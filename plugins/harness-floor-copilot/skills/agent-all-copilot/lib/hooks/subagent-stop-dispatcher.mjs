#!/usr/bin/env node
// subagentStop dispatcher — short-lived hook script.
//
// Copilot's `subagentStop` hook is configured via ~/.copilot/hooks.json to
// invoke this script with the hook payload on stdin (JSON). The script
// appends the payload as a single JSON line to the inbox file the
// coordinator tails (`<repo>/.copilot/agent-all/inbox.jsonl`).
//
// The hook fires for EVERY Copilot session — not just agent-all runs. To
// avoid noisy writes, we no-op when the inbox file's parent directory
// doesn't exist. The init script creates the directory; deleting it
// effectively unsubscribes a repo.
//
// Supported payload aliases are normalized before append:
//   {agentId|agent_id|id, status?, output|outputText?, costUSD|cost_usd?, finishedAt?, ...}
//
// Usage (invoked by Copilot, not directly):
//   node subagent-stop-dispatcher.mjs --inbox <abs-path>
// stdin: JSON payload

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";

function parseArgs(argv) {
  const out = { inbox: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--inbox") out.inbox = argv[++i];
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

export async function dispatch({ inbox, payloadRaw }) {
  if (!inbox) {
    // No-op when no inbox configured (other Copilot sessions).
    return { ok: false, reason: "no-inbox" };
  }
  const parentDir = dirname(inbox);
  if (!existsSync(parentDir)) {
    // No active agent-all run in this repo.
    return { ok: false, reason: "no-inbox-dir" };
  }
  let payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch (e) {
    return { ok: false, reason: "invalid-json", error: e.message };
  }
  // Normalize agentId — the hook may emit different keys.
  const normalized = {
    agentId: payload.agentId ?? payload.agent_id ?? payload.id ?? null,
    status: payload.status ?? "completed",
    output: payload.output ?? payload.outputText ?? null,
    costUSD: payload.costUSD ?? payload.cost_usd ?? null,
    finishedAt: payload.finishedAt ?? new Date().toISOString(),
    raw: payload,
  };
  if (!normalized.agentId) {
    return { ok: false, reason: "missing-agentId", payload };
  }
  // Atomic append — fs.appendFileSync uses O_APPEND on POSIX, no need for locking
  // unless we expect concurrent hooks. Keep small payloads under one line.
  appendFileSync(inbox, JSON.stringify(normalized) + "\n", "utf-8");
  return { ok: true, agentId: normalized.agentId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readStdin();
  const result = await dispatch({ inbox: args.inbox, payloadRaw: raw });
  if (!result.ok) {
    // Hooks should fail silently to avoid disrupting unrelated Copilot
    // sessions. Log to stderr for debugging only.
    process.stderr.write(`subagentStop dispatcher: ${result.reason}\n`);
    process.exit(0);
  }
  process.exit(0);
}

// Only run main() if invoked directly. Tests import {dispatch}.
const isDirectInvocation = process.argv[1] && process.argv[1].endsWith("subagent-stop-dispatcher.mjs");
if (isDirectInvocation) {
  main().catch((e) => {
    process.stderr.write(`subagentStop dispatcher: ${e?.message ?? e}\n`);
    process.exit(0);
  });
}
