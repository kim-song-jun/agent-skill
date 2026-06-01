// sequential-dispatch.mjs — fallback dispatcher for agent-all-codex.
//
// Current Codex hooks do not expose the older agent-dispatch surface,
// so this module provides the stable sequential path.
//
// Verified against Codex CLI 0.135.0: `codex exec` is the supported
// non-interactive entry point and it accepts the initial instructions as
// a positional prompt. It does not expose `--skill` or `--prompt`, so
// this dispatcher embeds the role SKILL.md content into that prompt.

import { existsSync, readFileSync } from "node:fs";

const DEFAULT_SUBCOMMAND = "exec";

function assertNonEmpty(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`sequential-dispatch: ${name} must be a non-empty string`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Resolve the path to a role's SKILL.md relative to the project root.
 *
 * @param {string} role
 * @param {string} [projectRoot] — defaults to process.cwd()
 * @returns {string}
 */
export function resolveSkillPath(role, projectRoot) {
  assertNonEmpty("role", role);
  const root = projectRoot || process.cwd();
  // Manual join to avoid a node:path import; we want forward slashes for
  // the shell command anyway.
  return `${root.replace(/\/+$/, "")}/.codex/skills/${role}/SKILL.md`;
}

/**
 * Build the prompt body emitted to the sequential skill invocation. The
 * coordinator passes this to `codex exec --prompt <body>` so the chosen
 * skill has everything it needs to perform the wave task.
 *
 * @param {object} args
 * @param {object} args.task        — task descriptor from the plan
 * @param {string} args.task.id
 * @param {string} args.task.title
 * @param {string[]} [args.task.files=[]]
 * @param {string} [args.task.body=""]
 * @param {object} [args.plan]      — context (path, summary)
 * @returns {string}
 */
export function buildSkillPrompt(args) {
  const { task, plan, skillPath, skillBody } = args;
  if (!task || typeof task !== "object") {
    throw new Error("buildSkillPrompt: task object required");
  }
  assertNonEmpty("task.id", task.id);
  assertNonEmpty("task.title", task.title);
  const files = Array.isArray(task.files) ? task.files : [];
  const bodyText = task.body || "(no body provided)";
  const planRef = plan?.path ? `Plan: ${plan.path}` : "Plan: (inline)";
  const roleSkill = skillBody
    ? [
        "## Role Skill",
        "",
        `Path: ${skillPath || "(inline)"}`,
        "",
        "Follow this role skill for the task:",
        "",
        "```markdown",
        skillBody,
        "```",
        "",
      ]
    : skillPath
      ? [
          "## Role Skill",
          "",
          `Path: ${skillPath}`,
          "",
          "The dispatcher could not inline the skill body; load and follow this role skill before editing.",
          "",
        ]
      : [];
  return [
    "# Sequential dispatch (agent-all-codex fallback)",
    "",
    ...roleSkill,
    `Task ID: ${task.id}`,
    `Title:   ${task.title}`,
    planRef,
    "",
    "## Files in scope",
    files.length ? files.map((f) => `- ${f}`).join("\n") : "(none declared)",
    "",
    "## Task body",
    "",
    bodyText,
    "",
    "## Required output",
    "",
    "End with a JSON line:",
    '`{"status": "completed"|"blocked", "commits": ["<sha>", ...], "errors": ["..."]}`',
  ].join("\n");
}

/**
 * Build argv for the sequential skill invocation. Current Codex CLI
 * accepts the prompt as the positional argument to `codex exec`.
 *
 * @param {object} opts
 * @param {object} opts.task
 * @param {object} [opts.plan]
 * @param {string} [opts.projectRoot]
 * @param {string} [opts.codexBin="codex"]
 * @param {string} [opts.subcommand="exec"]
 * @param {string} [opts.skillPath] — pre-resolved override; otherwise derived from task.role
 * @param {string} [opts.skillBody] — optional inlined SKILL.md content
 * @returns {{argv: string[], skillPath: string, prompt: string}}
 */
export function buildSequentialInvocation(opts) {
  if (!opts || !opts.task) {
    throw new Error("buildSequentialInvocation: opts.task required");
  }
  const role = opts.task.role || "dev";
  const skillPath = opts.skillPath || resolveSkillPath(role, opts.projectRoot);
  const codexBin = opts.codexBin || "codex";
  const subcommand = opts.subcommand || DEFAULT_SUBCOMMAND;
  const prompt = buildSkillPrompt({
    task: opts.task,
    plan: opts.plan,
    skillPath,
    skillBody: opts.skillBody,
  });
  return {
    skillPath,
    prompt,
    argv: [
      codexBin,
      subcommand,
      prompt,
    ],
  };
}

/**
 * Build the single-string `shell_command` form. Phase 3 doc shape:
 *
 *   shell_command("codex exec <inlined skill + task prompt>")
 *
 * @param {Parameters<typeof buildSequentialInvocation>[0]} opts
 * @returns {{command: string, skillPath: string}}
 */
export function buildSequentialShellCommand(opts) {
  const { argv, skillPath } = buildSequentialInvocation(opts);
  return { command: argv.map(shellQuote).join(" "), skillPath };
}

/**
 * Parse the JSON tail emitted by a sequential skill run. Skills are
 * required (by buildSkillPrompt) to end with a single JSON line. We
 * scan from the bottom to be resilient to interleaved log output.
 *
 * @param {string} stdout
 * @returns {{status: string, commits: string[], errors: string[]}}
 */
export function parseSkillResult(stdout) {
  if (!stdout || typeof stdout !== "string") {
    return { status: "unknown", commits: [], errors: ["empty skill output"] };
  }
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      return {
        status: parsed.status ?? "unknown",
        commits: Array.isArray(parsed.commits) ? parsed.commits : [],
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      };
    } catch {
      continue;
    }
  }
  return {
    status: "unknown",
    commits: [],
    errors: ["no JSON result line found in skill output"],
  };
}

/**
 * Dispatch one task sequentially. Returns a normalized result matching
 * the shape Phase 3 (Strategy A) returns from `codex agent wait`, so
 * downstream code can treat both paths uniformly.
 *
 * @param {Parameters<typeof buildSequentialInvocation>[0]} opts
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<{agentId: string, taskId: string, status: string,
 *                    commits: string[], costUSD: number, errors: string[]}>}
 */
export async function dispatchSequential(opts, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("dispatchSequential: shellRunner must be a function");
  }
  const { skillPath } = buildSequentialInvocation(opts);
  if (opts.requireSkillExists !== false && !existsSync(skillPath)) {
    throw new Error(`sequential-dispatch: skill file missing: ${skillPath}`);
  }
  let skillBody = opts.skillBody;
  if (existsSync(skillPath)) {
    skillBody = readFileSync(skillPath, "utf-8");
  }
  if (opts.assertSkillFrontmatter && skillBody) {
    const head = skillBody.slice(0, 200);
    if (!head.startsWith("---")) {
      throw new Error(
        `sequential-dispatch: ${skillPath} missing YAML front-matter`,
      );
    }
  }
  const { command } = buildSequentialShellCommand({
    ...opts,
    skillPath,
    skillBody,
  });
  const result = await shellRunner(command);
  const stdout = result?.stdout || "";
  const parsed = parseSkillResult(stdout);
  return {
    agentId: `sequential/${opts.task.id}`,
    taskId: opts.task.id,
    status: result?.status === 0 ? parsed.status : "blocked",
    commits: parsed.commits,
    costUSD: 0, // sequential mode has no per-task cost report; coordinator estimates
    errors: result?.status === 0
      ? parsed.errors
      : [...parsed.errors, `shell exit=${result?.status ?? "?"}: ${result?.stderr ?? ""}`.trim()],
  };
}

export const __internal = { shellQuote, DEFAULT_SUBCOMMAND };
