// codex-agent-dispatch.mjs — wraps Codex CLI's `agent dispatch` subcommand.
//
// Legacy experimental helper for a Codex agent-dispatch CLI surface.
// Current Codex hooks do not expose that surface; production phases use
// sequential-dispatch.mjs.
//
// This module produces *both*:
//   - `buildDispatchArgs(...)` — argv array suitable for spawn-style
//     callers (preferred; avoids quoting bugs).
//   - `buildDispatchShellCommand(...)` — the equivalent single-string
//     command for `shell_command(...)` callers (phase docs show this form).
//
// TODO: requires live Codex CLI to verify `codex agent dispatch` argv
// schema. The shape below mirrors what the phase docs assume:
//
//   codex agent dispatch \
//     --role <role> \
//     --skill <skill-path> \
//     --task-id <prefix>/<task-id> \
//     --body <json-string>
//
// If the live CLI diverges, only this module needs to change.

import { AGENT_ALL_MATCHER_PREFIX } from "./dispatch-strategy.mjs";

/**
 * @typedef {object} DispatchInvocation
 * @property {string} role        — e.g. "dev", "reviewer"
 * @property {string} skillPath   — `.codex/skills/<role>/SKILL.md`
 * @property {string} taskId      — task identifier (no prefix); we prepend
 *                                  the wave prefix to form the full task-id.
 * @property {object} body        — opaque payload; JSON-encoded for transport.
 */

function assertNonEmpty(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`codex-agent-dispatch: ${name} must be a non-empty string`);
  }
}

/**
 * Build the task-id used by `--task-id` and by `codex agent wait
 * --task-prefix`. Centralised so both sides agree on the wave prefix.
 *
 * @param {number|string} waveIndex
 * @param {string} taskId
 * @returns {string}
 */
export function buildWaveTaskId(waveIndex, taskId) {
  if (waveIndex == null || `${waveIndex}`.length === 0) {
    throw new Error("buildWaveTaskId: waveIndex required");
  }
  assertNonEmpty("taskId", taskId);
  return `${AGENT_ALL_MATCHER_PREFIX}${waveIndex}/${taskId}`;
}

/**
 * Build argv for `codex agent dispatch`. Use this when the caller can
 * spawn directly (preferred — no quoting).
 *
 * @param {DispatchInvocation & {waveIndex: number|string, codexBin?: string}} inv
 * @returns {string[]} argv beginning with the codex binary path
 */
export function buildDispatchArgs(inv) {
  assertNonEmpty("role", inv.role);
  assertNonEmpty("skillPath", inv.skillPath);
  assertNonEmpty("taskId", inv.taskId);
  if (inv.body == null) {
    throw new Error("codex-agent-dispatch: body required (object payload)");
  }
  const fullTaskId = buildWaveTaskId(inv.waveIndex, inv.taskId);
  const codexBin = inv.codexBin || "codex";
  return [
    codexBin,
    "agent",
    "dispatch",
    "--role", inv.role,
    "--skill", inv.skillPath,
    "--task-id", fullTaskId,
    "--body", JSON.stringify(inv.body),
  ];
}

function shellQuote(value) {
  // POSIX single-quote escape: wrap in single quotes; any embedded
  // single quote is closed, escaped, then re-opened.
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Build the single-string `shell_command` form of dispatch. Phase 3
 * documents this shape:
 *
 *   shell_command("codex agent dispatch --role '<r>' --skill '<s>' \
 *     --task-id '<id>' --body '<json>'")
 *
 * @param {DispatchInvocation & {waveIndex: number|string, codexBin?: string}} inv
 * @returns {string}
 */
export function buildDispatchShellCommand(inv) {
  const argv = buildDispatchArgs(inv);
  return argv.map(shellQuote).join(" ");
}

/**
 * Default dispatcher: invokes `shellRunner(commandString)` and returns
 * the parsed agent id from stdout. Callers wire `shellRunner` to either
 * the Codex `shell_command` host tool or `spawnSync` in tests.
 *
 * Expected stdout shape (TODO verify on live CLI):
 *   {"agentId": "<uuid>", "taskId": "<full-task-id>", "started": true}
 *
 * @param {DispatchInvocation & {waveIndex: number|string, codexBin?: string}} inv
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<{agentId: string, taskId: string, started: boolean, raw: string}>}
 */
export async function dispatchAgent(inv, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("dispatchAgent: shellRunner must be a function");
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
    // CLI may emit non-JSON on early builds; surface raw stdout so
    // the coordinator can decide.
    return { agentId: null, taskId: buildWaveTaskId(inv.waveIndex, inv.taskId),
      started: true, raw: stdout };
  }
  return {
    agentId: parsed.agentId ?? parsed.agent_id ?? null,
    taskId: parsed.taskId ?? parsed.task_id
      ?? buildWaveTaskId(inv.waveIndex, inv.taskId),
    started: parsed.started ?? true,
    raw: stdout,
  };
}

export const __internal = { shellQuote };
