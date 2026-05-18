// await-wave — wait for a set of Copilot `task`-dispatched agentIds to reach
// a terminal state (completed | failed | blocked).
//
// Two strategies, with auto-fallback:
//
//   - Hook mode: Copilot's `subagentStop` hook (registered via
//     ~/.copilot/hooks.json) writes a JSON line per finished agent to
//     `<repo>/.copilot/agent-all/inbox.jsonl`. We tail that file.
//     Payload shape (TODO: confirm via live tools.list RPC):
//       {agentId, status, output, costUSD, finishedAt}
//
//   - Poll mode: every `intervalMs` we call `listAgentsFn()` (the host's
//     `list_agents` tool) and filter for our ids; resolve when all have
//     `status` ∈ TERMINAL.
//
// Public API:
//   awaitWaveHook({agentIds, inboxPath, timeoutMs, fsReader?, sleeper?})
//       → Promise<{ok, results: Map<agentId, payload>, timedOut, error?}>
//   awaitWavePoll({agentIds, listAgentsFn, intervalMs, timeoutMs, sleeper?, now?})
//       → same shape
//   awaitWave({agentIds, strategy, inboxPath, listAgentsFn, ...opts})
//       → auto-selects: 'hook' if inboxPath exists, else 'poll'.

import { readFileSync, existsSync } from "node:fs";

export const TERMINAL_STATUSES = new Set([
  "completed", "failed", "blocked", "cancelled", "canceled",
]);

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

function defaultSleeper(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultNow() {
  return Date.now();
}

function defaultFsReader(path) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function parseInboxLines(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip malformed lines; the dispatcher should never emit them, but
      // partial writes are possible if we tail mid-flush.
    }
  }
  return records;
}

export async function awaitWaveHook({
  agentIds,
  inboxPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = 250,
  fsReader = defaultFsReader,
  sleeper = defaultSleeper,
  now = defaultNow,
} = {}) {
  if (!Array.isArray(agentIds)) {
    throw new Error("awaitWaveHook: agentIds must be an array");
  }
  if (!inboxPath || typeof inboxPath !== "string") {
    throw new Error("awaitWaveHook: inboxPath required");
  }
  const want = new Set(agentIds);
  const results = new Map();
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const raw = fsReader(inboxPath);
    const records = parseInboxLines(raw);
    for (const rec of records) {
      const id = rec.agentId ?? rec.agent_id ?? rec.id;
      if (id && want.has(id) && !results.has(id)) {
        // Map all non-terminal-looking statuses to a documented default.
        const status = rec.status && TERMINAL_STATUSES.has(rec.status)
          ? rec.status
          : (rec.status ?? "completed");
        results.set(id, { ...rec, status, agentId: id });
      }
    }
    if (results.size >= want.size) {
      return { ok: true, results, timedOut: false };
    }
    await sleeper(intervalMs);
  }
  return {
    ok: false,
    results,
    timedOut: true,
    error: `timed out waiting for ${want.size - results.size}/${want.size} agents`,
  };
}

export async function awaitWavePoll({
  agentIds,
  listAgentsFn,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleeper = defaultSleeper,
  now = defaultNow,
} = {}) {
  if (!Array.isArray(agentIds)) {
    throw new Error("awaitWavePoll: agentIds must be an array");
  }
  if (typeof listAgentsFn !== "function") {
    throw new Error("awaitWavePoll: listAgentsFn required");
  }
  const want = new Set(agentIds);
  const results = new Map();
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    let agents;
    try {
      agents = await listAgentsFn();
    } catch (e) {
      return {
        ok: false,
        results,
        timedOut: false,
        error: `list_agents failed: ${e?.message ?? e}`,
      };
    }
    // TODO: confirm via live tools.list RPC — assumed list_agents returns
    // an array of {agentId, status, output?, costUSD?} or {agents: [...]}.
    const list = Array.isArray(agents) ? agents : (agents?.agents ?? []);
    for (const a of list) {
      const id = a.agentId ?? a.agent_id ?? a.id;
      if (id && want.has(id) && TERMINAL_STATUSES.has(a.status) && !results.has(id)) {
        results.set(id, { ...a, agentId: id });
      }
    }
    if (results.size >= want.size) {
      return { ok: true, results, timedOut: false };
    }
    await sleeper(intervalMs);
  }
  return {
    ok: false,
    results,
    timedOut: true,
    error: `timed out waiting for ${want.size - results.size}/${want.size} agents`,
  };
}

export async function awaitWave({
  agentIds,
  strategy = "auto",
  inboxPath,
  listAgentsFn,
  ...opts
} = {}) {
  let resolved = strategy;
  if (resolved === "auto") {
    const reader = opts.fsReader ?? defaultFsReader;
    if (inboxPath && existsSync(inboxPath)) {
      resolved = "hook";
    } else if (inboxPath && reader === defaultFsReader && false) {
      // unreachable; existsSync covers it. Kept for explicit branch.
      resolved = "hook";
    } else if (typeof listAgentsFn === "function") {
      resolved = "poll";
    } else if (inboxPath) {
      // hook strategy requested but inbox doesn't exist yet — still tail it;
      // the hook will create it on first write.
      resolved = "hook";
    } else {
      throw new Error("awaitWave: cannot auto-select; provide inboxPath or listAgentsFn");
    }
  }
  if (resolved === "hook") {
    return awaitWaveHook({ agentIds, inboxPath, ...opts });
  }
  if (resolved === "poll") {
    return awaitWavePoll({ agentIds, listAgentsFn, ...opts });
  }
  throw new Error(`awaitWave: unknown strategy '${resolved}'`);
}

export const __internal = { parseInboxLines };
