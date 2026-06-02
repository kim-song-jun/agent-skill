// codex-agent-wait.mjs — legacy wrapper for a Codex CLI
// `agent wait --task-prefix ...` blocking call.
//
// Verified against Codex CLI 0.135.0: `codex agent wait` is not exposed by Codex CLI 0.135.0.
// Production phases use sequential-dispatch.mjs. The retained legacy argv
// shape mirrors what the phase docs originally assumed, so future CLI
// support can be re-evaluated in one module:
//
//   codex agent wait --task-prefix '<prefix>' --timeout <seconds> [--json]
//
// returning a JSON array of:
//
//   [{agentId, taskId, status, commits, costUSD, errors?}]
//
// If a future CLI exposes this surface with a different shape, only this
// module should need to change.

import { AGENT_ALL_MATCHER_PREFIX } from "./dispatch-strategy.mjs";

const DEFAULT_TIMEOUT_SECONDS = 1800;

function assertNonEmpty(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`codex-agent-wait: ${name} must be a non-empty string`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Build the wave-scoped task prefix that `codex agent wait` will block on.
 * Mirrors the prefix used by `buildWaveTaskId` in codex-agent-dispatch.mjs.
 *
 * @param {number|string} waveIndex
 * @returns {string}
 */
export function buildWavePrefix(waveIndex) {
  if (waveIndex == null || `${waveIndex}`.length === 0) {
    throw new Error("buildWavePrefix: waveIndex required");
  }
  return `${AGENT_ALL_MATCHER_PREFIX}${waveIndex}/`;
}

/**
 * Build argv for `codex agent wait`.
 *
 * @param {object} opts
 * @param {string} opts.taskPrefix
 * @param {number} [opts.timeoutSeconds=1800]
 * @param {string} [opts.codexBin="codex"]
 * @param {boolean} [opts.json=true]
 * @returns {string[]}
 */
export function buildWaitArgs(opts) {
  assertNonEmpty("taskPrefix", opts.taskPrefix);
  const timeout = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("buildWaitArgs: timeoutSeconds must be a positive number");
  }
  const codexBin = opts.codexBin || "codex";
  const argv = [
    codexBin,
    "agent",
    "wait",
    "--task-prefix", opts.taskPrefix,
    "--timeout", String(timeout),
  ];
  if (opts.json !== false) argv.push("--json");
  return argv;
}

/**
 * Build the single-string `shell_command` form. Phase 3 doc shape:
 *
 *   shell_command("codex agent wait --task-prefix 'agent-all/wave/<i>/' --timeout 1800")
 *
 * @param {Parameters<typeof buildWaitArgs>[0]} opts
 * @returns {string}
 */
export function buildWaitShellCommand(opts) {
  return buildWaitArgs(opts).map(shellQuote).join(" ");
}

/**
 * Parse the `codex agent wait --json` response into a normalized array.
 *
 * Accepts both `{results: [...]}` and bare-array forms. Missing fields
 * default to safe values so the coordinator can still compute wave status.
 *
 * @param {string} stdout
 * @returns {Array<{agentId: string|null, taskId: string|null, status: string,
 *                  commits: string[], costUSD: number, errors: string[]}>}
 */
export function parseWaitResponse(stdout) {
  if (!stdout || typeof stdout !== "string") return [];
  let parsed;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (err) {
    throw new Error(`parseWaitResponse: invalid JSON: ${err.message}`);
  }
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.agents)
        ? parsed.agents
        : [];
  return items.map((entry) => ({
    agentId: entry.agentId ?? entry.agent_id ?? null,
    taskId: entry.taskId ?? entry.task_id ?? null,
    status: entry.status ?? "unknown",
    commits: Array.isArray(entry.commits) ? entry.commits : [],
    costUSD: typeof entry.costUSD === "number"
      ? entry.costUSD
      : typeof entry.cost_usd === "number" ? entry.cost_usd : 0,
    errors: Array.isArray(entry.errors) ? entry.errors : [],
  }));
}

/**
 * Default awaiter: invokes `shellRunner(commandString)` and parses the
 * `--json` payload.
 *
 * @param {object} opts
 * @param {string} opts.taskPrefix
 * @param {number} [opts.timeoutSeconds]
 * @param {string} [opts.codexBin]
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<ReturnType<typeof parseWaitResponse>>}
 */
export async function waitForAgents(opts, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("waitForAgents: shellRunner must be a function");
  }
  const command = buildWaitShellCommand(opts);
  const result = await shellRunner(command);
  if (!result || result.status !== 0) {
    const err = result?.stderr || "(no stderr)";
    throw new Error(
      `codex agent wait failed (exit=${result?.status ?? "?"}): ${err}`,
    );
  }
  return parseWaitResponse(result.stdout || "");
}

export const __internal = { shellQuote, DEFAULT_TIMEOUT_SECONDS };
