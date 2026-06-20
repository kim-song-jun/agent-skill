// await-pages — wait for visual-qa per-page Copilot `task` subagents to
// finish. Same shape as agent-all-copilot's await-wave.mjs but named for
// the visual-qa contract (per-page rather than per-wave). Considered
// extracting to a shared module — deferred until both ports stabilise
// (per visual-qa-copilot spec).
//
// See plugins/harness-floor-copilot/skills/agent-all-copilot/lib/await-wave.mjs
// for the contract — identical here.

import { readFileSync, existsSync } from "node:fs";

export const TERMINAL_STATUSES = new Set([
  "completed", "failed", "blocked", "cancelled", "canceled",
]);

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

function defaultSleeper(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function defaultNow() { return Date.now(); }
function defaultFsReader(path) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function parseInboxLines(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

export async function awaitPagesHook({
  agentIds,
  inboxPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = 250,
  fsReader = defaultFsReader,
  sleeper = defaultSleeper,
  now = defaultNow,
} = {}) {
  if (!Array.isArray(agentIds)) throw new Error("awaitPagesHook: agentIds must be array");
  if (!inboxPath) throw new Error("awaitPagesHook: inboxPath required");
  const want = new Set(agentIds);
  const results = new Map();
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const raw = fsReader(inboxPath);
    for (const rec of parseInboxLines(raw)) {
      const id = rec.agentId ?? rec.agent_id ?? rec.id ?? rec.agentName ?? rec.agent_name ?? rec.sessionId ?? rec.session_id ?? rec.transcriptPath ?? rec.transcript_path;
      if (id && want.has(id) && !results.has(id)) {
        const status = rec.status && TERMINAL_STATUSES.has(rec.status)
          ? rec.status
          : (rec.status ?? "completed");
        results.set(id, { ...rec, status, agentId: id });
      }
    }
    if (results.size >= want.size) return { ok: true, results, timedOut: false };
    await sleeper(intervalMs);
  }
  return {
    ok: false,
    results,
    timedOut: true,
    error: `timed out waiting for ${want.size - results.size}/${want.size} page agents`,
  };
}

export async function awaitPagesPoll({
  agentIds,
  listAgentsFn,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleeper = defaultSleeper,
  now = defaultNow,
} = {}) {
  if (!Array.isArray(agentIds)) throw new Error("awaitPagesPoll: agentIds must be array");
  if (typeof listAgentsFn !== "function") throw new Error("awaitPagesPoll: listAgentsFn required");
  const want = new Set(agentIds);
  const results = new Map();
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    let agents;
    try {
      agents = await listAgentsFn();
    } catch (e) {
      return { ok: false, results, timedOut: false, error: `list_agents failed: ${e?.message ?? e}` };
    }
    const list = Array.isArray(agents) ? agents : (agents?.agents ?? []);
    for (const a of list) {
      const id = a.agentId ?? a.agent_id ?? a.id ?? a.agentName ?? a.agent_name ?? a.sessionId ?? a.session_id ?? a.transcriptPath ?? a.transcript_path;
      if (id && want.has(id) && TERMINAL_STATUSES.has(a.status) && !results.has(id)) {
        results.set(id, { ...a, agentId: id });
      }
    }
    if (results.size >= want.size) return { ok: true, results, timedOut: false };
    await sleeper(intervalMs);
  }
  return {
    ok: false,
    results,
    timedOut: true,
    error: `timed out waiting for ${want.size - results.size}/${want.size} page agents`,
  };
}

export async function awaitPages({
  agentIds,
  strategy = "auto",
  inboxPath,
  listAgentsFn,
  ...opts
} = {}) {
  let resolved = strategy;
  if (resolved === "auto") {
    if (inboxPath && existsSync(inboxPath)) resolved = "hook";
    else if (typeof listAgentsFn === "function") resolved = "poll";
    else if (inboxPath) resolved = "hook";
    else throw new Error("awaitPages: cannot auto-select; provide inboxPath or listAgentsFn");
  }
  if (resolved === "hook") return awaitPagesHook({ agentIds, inboxPath, ...opts });
  if (resolved === "poll") return awaitPagesPoll({ agentIds, listAgentsFn, ...opts });
  throw new Error(`awaitPages: unknown strategy '${resolved}'`);
}

export const __internal = { parseInboxLines };
