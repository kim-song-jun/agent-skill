// dispatch-task — wraps a single Copilot `task({prompt, context})` invocation.
//
// Copilot's `task` tool returns immediately with an `agentId`; the coordinator
// later polls via `read_agent` / `list_agents` or awaits via `subagentStop`.
//
// Difference from Claude Code's `Task` (which takes
// `{description, prompt, subagent_type}` and runs synchronously):
//   - Copilot infers the subagent from the prompt; no `subagent_type` field.
//   - Copilot returns immediately — async by default.
//   - Context is a free-form JSON object the dispatched agent reads via
//     `read_context()` (or similar). The coordinator stuffs routing keys
//     in here (`agentAllWave`, `agentAllTask`, `planKey`).
//
// Contract:
//   buildTaskCall({task, plan, role, files}) → {prompt, context}
//       Pure — deterministic prompt + routing context. No side effects.
//   dispatchTask({call, taskCaller, contextExtras?}) → Promise<{agentId, ok, error?}>
//       Async — invokes the host's `task` tool via `taskCaller`.
//   parseTaskResult(agentOutput) → {status, commits, errors}
//       Pure — extracts STATUS/COMMITS lines from the dispatched agent's
//       final message.

function bullet(items) {
  if (!items || !items.length) return "(none)";
  return items.map((s) => `- ${s}`).join("\n");
}

function escapeBackticks(s) {
  if (typeof s !== "string") return s;
  return s.replace(/```/g, "ʻʻʻ"); // U+02BB, visually similar; avoid breaking outer fences.
}

export function buildTaskCall({ task, plan, role, files }) {
  if (!task || typeof task !== "object") {
    throw new Error("buildTaskCall: task is required");
  }
  if (!task.id) throw new Error("buildTaskCall: task.id required");
  if (!task.title) throw new Error("buildTaskCall: task.title required");

  const resolvedRole = role ?? task.role ?? "dev";
  const resolvedFiles = files ?? task.files ?? [];

  const planSection = task.planSection ?? "(planner did not embed a plan section)";

  const promptLines = [
    `# Implement: ${task.title}`,
    "",
    `**Task ID:** ${task.id}`,
    `**Role:** ${resolvedRole}`,
    "",
    "## Files in scope",
    bullet(resolvedFiles),
    "",
    "## Plan section",
    "",
    "```",
    escapeBackticks(planSection),
    "```",
    "",
    "## Instructions",
    "",
    "1. Read the plan section above and any referenced files.",
    "2. Implement the changes listed in 'Files in scope'.",
    "3. Run the project's tests + lint locally.",
    "4. On completion, end your final message with two lines exactly:",
    "   ```",
    "   STATUS: completed|blocked|failed",
    "   COMMITS: <sha1>,<sha2>,...",
    "   ```",
    "   Use `STATUS: blocked` if you need a human; `failed` for an unrecoverable error.",
  ];

  const context = {
    agentAllTask: task.id,
    role: resolvedRole,
    files: resolvedFiles,
    planKey: plan?.memoryKey ?? "agent-all/plan",
    planPath: plan?.path,
  };

  return {
    prompt: promptLines.join("\n"),
    context,
  };
}

export async function dispatchTask({ call, taskCaller, contextExtras } = {}) {
  if (typeof taskCaller !== "function") {
    throw new Error("dispatchTask: taskCaller must be a function");
  }
  if (!call || typeof call !== "object" || typeof call.prompt !== "string") {
    throw new Error("dispatchTask: call.prompt required");
  }
  const args = {
    prompt: call.prompt,
    context: contextExtras ? { ...call.context, ...contextExtras } : call.context,
  };
  try {
    const reply = await taskCaller({ name: "task", args });
    // Supported host adapters return {agentId}, {agent_id}, {id}, or a raw
    // string id. Normalize them to the internal agentId contract.
    const agentId = typeof reply === "string"
      ? reply
      : reply?.agentId ?? reply?.id ?? reply?.agent_id ?? null;
    if (!agentId) {
      return { ok: false, agentId: null, error: "task reply missing agentId" };
    }
    return { ok: true, agentId };
  } catch (e) {
    return { ok: false, agentId: null, error: e?.message ?? String(e) };
  }
}

const STATUS_RE = /^STATUS:\s*(completed|blocked|failed)\s*$/im;
const COMMITS_RE = /^COMMITS:\s*(.*)$/im;

export function parseTaskResult(agentOutput) {
  const out = { status: "unknown", commits: [], errors: [] };
  if (typeof agentOutput !== "string" || agentOutput.length === 0) {
    out.errors.push("empty agent output");
    return out;
  }
  const statusMatch = agentOutput.match(STATUS_RE);
  if (statusMatch) {
    out.status = statusMatch[1].toLowerCase();
  } else {
    out.errors.push("no STATUS line found");
  }
  const commitsMatch = agentOutput.match(COMMITS_RE);
  if (commitsMatch) {
    const raw = commitsMatch[1].trim();
    if (raw && raw !== "(none)") {
      out.commits = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[a-f0-9]{4,40}$/i.test(s));
    }
  }
  return out;
}

export const __internal = { bullet, escapeBackticks, STATUS_RE, COMMITS_RE };
