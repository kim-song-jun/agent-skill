// codex-agent-dispatch.mjs — wraps `codex agent dispatch` for visual-qa-codex.
//
// Legacy experimental helper for a Codex agent-dispatch CLI surface.
// Current Codex hooks do not expose that surface; production phases use
// sequential-dispatch.mjs.
//
// TODO: requires live Codex CLI to verify `codex agent dispatch` argv
// schema. The shape below mirrors Phase 3:
//
//   codex agent dispatch \
//     --role visual-qa-page \
//     --skill .codex/skills/visual-qa-page/SKILL.md \
//     --task-id visual-qa/page/<page.name> \
//     --body '<page-prompt body JSON>'

import { VISUAL_QA_MATCHER_PREFIX } from "./dispatch-strategy.mjs";

const DEFAULT_ROLE = "visual-qa-page";
const DEFAULT_SKILL_PATH = ".codex/skills/visual-qa-page/SKILL.md";

function assertNonEmpty(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`codex-agent-dispatch: ${name} must be a non-empty string`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Build the page-scoped task id used by `--task-id` and `--task-prefix`.
 *
 * @param {string} pageName
 * @returns {string}
 */
export function buildPageTaskId(pageName) {
  assertNonEmpty("pageName", pageName);
  return `${VISUAL_QA_MATCHER_PREFIX}${pageName}`;
}

/**
 * Build argv for `codex agent dispatch`.
 *
 * @param {object} inv
 * @param {string} inv.pageName               — required; e.g. "home"
 * @param {object} inv.body                   — page-prompt payload (JSON-encoded)
 * @param {string} [inv.role="visual-qa-page"]
 * @param {string} [inv.skillPath=".codex/skills/visual-qa-page/SKILL.md"]
 * @param {string} [inv.codexBin="codex"]
 * @returns {string[]}
 */
export function buildDispatchArgs(inv) {
  if (!inv || typeof inv !== "object") {
    throw new Error("codex-agent-dispatch: invocation object required");
  }
  assertNonEmpty("pageName", inv.pageName);
  if (inv.body == null) {
    throw new Error("codex-agent-dispatch: body required (object payload)");
  }
  const role = inv.role || DEFAULT_ROLE;
  const skillPath = inv.skillPath || DEFAULT_SKILL_PATH;
  const codexBin = inv.codexBin || "codex";
  return [
    codexBin,
    "agent",
    "dispatch",
    "--role", role,
    "--skill", skillPath,
    "--task-id", buildPageTaskId(inv.pageName),
    "--body", JSON.stringify(inv.body),
  ];
}

export function buildDispatchShellCommand(inv) {
  return buildDispatchArgs(inv).map(shellQuote).join(" ");
}

/**
 * Default dispatcher. See agent-all-codex's sibling for response-shape notes.
 *
 * @param {Parameters<typeof buildDispatchArgs>[0]} inv
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<{agentId: string|null, taskId: string, started: boolean, raw: string}>}
 */
export async function dispatchPageAgent(inv, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("dispatchPageAgent: shellRunner must be a function");
  }
  const command = buildDispatchShellCommand(inv);
  const result = await shellRunner(command);
  if (!result || result.status !== 0) {
    const err = result?.stderr || "(no stderr)";
    throw new Error(
      `codex agent dispatch failed (exit=${result?.status ?? "?"}): ${err}`,
    );
  }
  const stdout = (result.stdout || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      agentId: null,
      taskId: buildPageTaskId(inv.pageName),
      started: true,
      raw: stdout,
    };
  }
  return {
    agentId: parsed.agentId ?? parsed.agent_id ?? null,
    taskId: parsed.taskId ?? parsed.task_id ?? buildPageTaskId(inv.pageName),
    started: parsed.started ?? true,
    raw: stdout,
  };
}

export const __internal = { shellQuote, DEFAULT_ROLE, DEFAULT_SKILL_PATH };
