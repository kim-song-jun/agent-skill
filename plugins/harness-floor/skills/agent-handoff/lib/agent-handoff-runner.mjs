import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  appendFileSync,
  readdirSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { extractTaskDoc, validateTaskDocShape } from "../../agent-all/lib/task-doc-extractor.mjs";
import { readGitState } from "../../agent-all/lib/git-state-reader.mjs";
import { renderHandoff } from "../../agent-all/lib/handoff-writer.mjs";
import { renderSessionPrompt } from "../../agent-all/lib/session-prompt-writer.mjs";
import { handoffPathsForTask } from "../../agent-all/lib/resume-artifacts.mjs";
import { artifactPaths } from "../../agent-all/lib/artifact-paths.mjs";
import { normalizeInteraction } from "../../agent-all/lib/interactions/schema.mjs";
import { resolveNonTtyInteraction } from "../../agent-all/lib/interactions/non-tty-resolver.mjs";
import {
  appendInteractionLog,
  interactionLogPath,
} from "../../agent-all/lib/interactions/interaction-log-writer.mjs";
import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "../../agent-all/lib/security/artifact-redactor.mjs";
import { writeRedactionAudit } from "../../agent-all/lib/security/redact-report-writer.mjs";

const DATA_EVIDENCE_ADAPTERS = new Set(["verify:notebook-data", "verify:sql-db", "verify:batch-job"]);

function toPosix(path) {
  return String(path || "").split(sep).join("/");
}

function rel(cwd, path) {
  return toPosix(relative(cwd, path)) || ".";
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function collectDataEvidence({ cwd, limit = 5, config = {} } = {}) {
  const runsDir = resolve(cwd, artifactPaths(config).runsDir);
  if (!existsSync(runsDir)) return [];
  let runEntries = [];
  try {
    runEntries = readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries = [];
  for (const entry of runEntries) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    const evidenceAbs = resolve(runsDir, runId, "verification-evidence.jsonl");
    const evidenceRel = rel(cwd, evidenceAbs);
    readJsonLines(evidenceAbs).forEach((evidence, index) => {
      if (!DATA_EVIDENCE_ADAPTERS.has(evidence.adapter)) return;
      entries.push({
        adapter: evidence.adapter,
        status: evidence.status,
        summary: evidence.summary,
        artifacts: Array.isArray(evidence.artifacts) ? evidence.artifacts : [],
        timestamp: evidence.timestamp || null,
        runId,
        evidencePath: evidenceRel,
        order: index,
      });
    });
  }
  return entries
    .sort((left, right) => {
      const time = String(right.timestamp || "").localeCompare(String(left.timestamp || ""));
      return time || right.order - left.order;
    })
    .slice(0, limit);
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function gitSummary(gitState) {
  const status = gitState.statusLines?.length
    ? gitState.statusLines.join("; ")
    : "clean";
  const log = gitState.logLines?.length ? `; recent commits: ${gitState.logLines.slice(0, 3).join(" | ")}` : "";
  return `${gitState.branch || "unknown"}; ${status}${log}`;
}

function nextActions(taskRel, sessionRel) {
  return [
    {
      id: "resume-agent-all",
      label: "Resume /agent-all",
      command: `/agent-all ${taskRel} --resume`,
      reason: "Continue from the persisted state and generated handoff/session artifacts.",
      recommended: true,
    },
    {
      id: "start-new-session",
      label: "Start a new session from the session prompt",
      command: `Use ${sessionRel} as the first message in the new session`,
      reason: "Keeps goal, state, gates, and unsafe-command policy together.",
      recommended: false,
    },
    {
      id: "verify-first",
      label: "Run verification before more edits",
      command: "Run the Verification commands recorded in the task doc",
      reason: "Useful when the handoff says implementation may already be complete.",
      recommended: false,
    },
  ];
}

function auditEntry({ generatedAt, taskRel, selectedNextAction }) {
  return {
    schema: "agent-skill/handoff-audit@1",
    event: "non_tty_next_action_auto_selected",
    generatedAt,
    taskPath: taskRel,
    selectedAction: selectedNextAction?.id || null,
    reason: selectedNextAction?.reason || "recommended action",
  };
}

function nextActionInteraction({ taskRel, actions, generatedAt }) {
  return normalizeInteraction({
    id: `${taskRel}:handoff-next-action`,
    kind: "resume",
    title: "Choose handoff next action",
    context: `Task ${taskRel} handoff generated at ${generatedAt}. Choose how the next session should resume.`,
    options: actions.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.reason,
      recommended: Boolean(action.recommended),
      risk: "low",
      metadata: { command: action.command },
    })),
    defaultOptionId: actions.find((action) => action.recommended)?.id,
    requireUserInput: false,
    nonTtyPolicy: "choose_recommended",
    metadata: { taskPath: taskRel },
  });
}

export function runAgentHandoff({
  cwd = process.cwd(),
  taskPath,
  dryRun = false,
  strict = false,
  nonInteractive = !process.stdin.isTTY,
  now = new Date(),
  collectGitState = readGitState,
  config = {},
  artifactRoot = null,
} = {}) {
  if (!taskPath) throw new Error("taskPath is required");
  const taskAbs = resolve(cwd, taskPath);
  if (!existsSync(taskAbs)) throw new Error(`task file not found: ${taskPath}`);

  const taskRel = rel(cwd, taskAbs);
  const taskText = readFileSync(taskAbs, "utf8");
  const shape = validateTaskDocShape(taskText);
  if (strict && !shape.ok) {
    const error = new Error(`strict task doc validation failed: ${shape.errors.join("; ")}`);
    error.errors = shape.errors;
    throw error;
  }

  const state = readJsonIfExists(resolve(cwd, ".agent-all-state.json"));
  const extracted = extractTaskDoc({ taskPath: taskRel, taskText, state });
  const gitState = collectGitState({ cwd });
  const generatedAt = now.toISOString();
  const artifactConfig = artifactRoot ? { ...config, artifactRoot } : config;
  const dataEvidence = collectDataEvidence({ cwd, config: artifactConfig });
  const paths = handoffPathsForTask(taskRel, { config: artifactConfig });
  const handoffAbs = resolve(cwd, paths.handoffPath);
  const sessionAbs = resolve(cwd, paths.sessionPath);
  const handoffRel = rel(cwd, handoffAbs);
  const sessionRel = rel(cwd, sessionAbs);
  const actions = nextActions(taskRel, sessionRel);
  const interaction = nextActionInteraction({ taskRel, actions, generatedAt });
  const interactionResult = nonInteractive
    ? resolveNonTtyInteraction(interaction, { now })
    : null;
  const selectedNextAction = interactionResult?.selectedOptionId
    ? actions.find((action) => action.id === interactionResult.selectedOptionId) ?? null
    : null;
  const metadata = {
    schema: "agent-skill/handoff@1",
    generatedAt,
    taskId: extracted.id,
    displayId: extracted.displayId,
    githubIssue: extracted.githubIssue,
    taskPath: taskRel,
    handoffPath: handoffRel,
    sessionPath: sessionRel,
    goal: extracted.goal,
    git: {
      branch: gitState.branch,
      statusLines: gitState.statusLines,
      logLines: gitState.logLines,
    },
    nextActions: actions,
    selectedNextActionId: selectedNextAction?.id || null,
    interaction: {
      id: interaction.id,
      kind: interaction.kind,
      nonTtyPolicy: interaction.nonTtyPolicy,
      selectedOptionId: interactionResult?.selectedOptionId ?? null,
      action: interactionResult?.action ?? null,
    },
    dataEvidence,
    state: state ? {
      iter: state.iter ?? null,
      costUSD: state.costUSD ?? null,
      lastBreakConditionExit: state.lastBreakConditionExit ?? null,
    } : null,
  };

  const renderedHandoff = renderHandoff({
    title: extracted.title,
    completed: extracted.completed,
    remaining: extracted.remaining,
    blockers: extracted.blockers,
    validation: extracted.validation,
    gitState: gitSummary(gitState),
    resumeFiles: [handoffRel, sessionRel],
    nextActions: actions,
    dataEvidence,
    nextAction: selectedNextAction
      ? `${selectedNextAction.command} (${selectedNextAction.reason})`
      : "Ask the user to choose a next action; in non-TTY mode auto-select the recommended resume action.",
    metadata,
  });

  const renderedSession = renderSessionPrompt({
    title: extracted.title,
    taskPath: taskRel,
    goal: extracted.goal,
    ssot: [...new Set([...extracted.ssot, handoffRel, sessionRel].filter((item) => item !== taskRel))],
    currentStatus: extracted.progressSnapshot,
    completed: extracted.completed,
    remaining: extracted.remaining,
    blockers: extracted.blockers,
    validation: extracted.validation,
    gitState: gitSummary(gitState),
    nextActions: actions,
    selectedNextAction,
    firstAction: selectedNextAction
      ? `Inspect ${taskRel}, ${handoffRel}, and ${sessionRel}; then run ${selectedNextAction.command}.`
      : `Inspect ${taskRel}, ${handoffRel}, and ${sessionRel}; then ask the user which next action to take.`,
    metadata: { ...metadata, schema: "agent-skill/session-prompt@1" },
  });
  const handoffRedaction = redactArtifactContent({
    artifactPath: handoffRel,
    content: renderedHandoff,
    config: artifactConfig,
    now,
  });
  const sessionRedaction = redactArtifactContent({
    artifactPath: sessionRel,
    content: renderedSession,
    config: artifactConfig,
    now,
  });
  const redactionAudits = [handoffRedaction, sessionRedaction]
    .filter((result) => result.findings.length > 0)
    .map((result) => result.audit);
  const handoff = handoffRedaction.content;
  const session = sessionRedaction.content;

  const auditPath = resolve(cwd, artifactPaths(artifactConfig).runsDir, "handoff-audit.jsonl");
  const interactionsPath = interactionLogPath({ cwd, runId: "handoff", config: artifactConfig });
  const audit = selectedNextAction ? auditEntry({ generatedAt, taskRel, selectedNextAction }) : null;

  if (!dryRun) {
    for (const result of [handoffRedaction, sessionRedaction]) {
      writeRedactionAudit({
        cwd,
        runId: "handoff",
        config: artifactConfig,
        artifactPath: result.artifactPath,
        findings: result.findings,
        now,
      });
    }
  }
  assertRedactionAllowed(handoffRedaction);
  assertRedactionAllowed(sessionRedaction);

  if (!dryRun) {
    atomicWrite(handoffAbs, handoff);
    atomicWrite(sessionAbs, session);
    if (interactionResult) {
      appendInteractionLog({
        cwd,
        runId: "handoff",
        config: artifactConfig,
        interaction,
        result: interactionResult,
        source: "agent-handoff",
        now,
      });
    }
    if (audit) {
      mkdirSync(dirname(auditPath), { recursive: true });
      appendFileSync(auditPath, `${JSON.stringify(audit)}\n`);
    }
  }

  return {
    taskPath: taskRel,
    handoffPath: handoffRel,
    sessionPath: sessionRel,
    auditPath: rel(cwd, auditPath),
    interactionLogPath: rel(cwd, interactionsPath),
    handoff,
    session,
    audit,
    interaction,
    interactionResult,
    wrote: !dryRun,
    strictErrors: shape.errors,
    selectedNextAction,
    dataEvidence,
    redactionAudits,
  };
}
