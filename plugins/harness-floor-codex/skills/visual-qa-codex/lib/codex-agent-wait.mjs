// codex-agent-wait.mjs — wraps `codex agent wait --task-prefix ...` for
// visual-qa-codex. Sibling of agent-all-codex's codex-agent-wait.mjs;
// differs only in the prefix.
//
// TODO: requires live Codex CLI to verify `codex agent wait` argv and
// response schema. Phase 3 assumes:
//
//   codex agent wait --task-prefix 'visual-qa/page/' --timeout 1800 --json
//
// returning a JSON array of:
//
//   [{agentId, taskId, status, captures, analyses, costUSD, errors?}]

import { VISUAL_QA_MATCHER_PREFIX } from "./dispatch-strategy.mjs";

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
 * Prefix that scopes `codex agent wait` to visual-qa dispatches.
 *
 * @returns {string}
 */
export function buildVisualQaPrefix() {
  return VISUAL_QA_MATCHER_PREFIX;
}

/**
 * Build argv for `codex agent wait`.
 *
 * @param {object} opts
 * @param {string} [opts.taskPrefix="visual-qa/page/"]
 * @param {number} [opts.timeoutSeconds=1800]
 * @param {string} [opts.codexBin="codex"]
 * @param {boolean} [opts.json=true]
 * @returns {string[]}
 */
export function buildWaitArgs(opts = {}) {
  const taskPrefix = opts.taskPrefix || buildVisualQaPrefix();
  assertNonEmpty("taskPrefix", taskPrefix);
  const timeout = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("buildWaitArgs: timeoutSeconds must be a positive number");
  }
  const codexBin = opts.codexBin || "codex";
  const argv = [
    codexBin,
    "agent",
    "wait",
    "--task-prefix", taskPrefix,
    "--timeout", String(timeout),
  ];
  if (opts.json !== false) argv.push("--json");
  return argv;
}

export function buildWaitShellCommand(opts = {}) {
  return buildWaitArgs(opts).map(shellQuote).join(" ");
}

/**
 * Parse the `codex agent wait --json` response for visual-qa.
 *
 * Each entry normalizes to:
 *   {agentId, taskId, status, captures, analyses, costUSD, errors}
 *
 * @param {string} stdout
 * @returns {Array<object>}
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
    captures: Array.isArray(entry.captures) ? entry.captures : [],
    analyses: Array.isArray(entry.analyses) ? entry.analyses : [],
    costUSD: typeof entry.costUSD === "number"
      ? entry.costUSD
      : typeof entry.cost_usd === "number" ? entry.cost_usd : 0,
    errors: Array.isArray(entry.errors) ? entry.errors : [],
  }));
}

/**
 * Default awaiter.
 *
 * @param {Parameters<typeof buildWaitArgs>[0]} opts
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<ReturnType<typeof parseWaitResponse>>}
 */
export async function waitForPageAgents(opts, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("waitForPageAgents: shellRunner must be a function");
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
