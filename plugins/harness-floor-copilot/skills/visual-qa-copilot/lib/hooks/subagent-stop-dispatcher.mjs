#!/usr/bin/env node
// subagentStop dispatcher — visual-qa variant.
//
// Identical contract to agent-all-copilot's dispatcher; ships separately
// so each skill is self-contained. Writes to
// `<repo>/.copilot/visual-qa/inbox.jsonl`.
//
// See plugins/harness-floor-copilot/skills/agent-all-copilot/lib/hooks/
// subagent-stop-dispatcher.mjs for full contract notes.

import { existsSync, appendFileSync } from "node:fs";
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
  if (!inbox) return { ok: false, reason: "no-inbox" };
  if (!existsSync(dirname(inbox))) return { ok: false, reason: "no-inbox-dir" };
  let payload;
  try { payload = JSON.parse(payloadRaw); }
  catch (e) { return { ok: false, reason: "invalid-json", error: e.message }; }
  const normalized = {
    agentId: payload.agentId ?? payload.agent_id ?? payload.id ?? null,
    status: payload.status ?? "completed",
    output: payload.output ?? payload.outputText ?? null,
    costUSD: payload.costUSD ?? payload.cost_usd ?? null,
    finishedAt: payload.finishedAt ?? new Date().toISOString(),
    raw: payload,
  };
  if (!normalized.agentId) return { ok: false, reason: "missing-agentId", payload };
  appendFileSync(inbox, JSON.stringify(normalized) + "\n", "utf-8");
  return { ok: true, agentId: normalized.agentId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readStdin();
  const result = await dispatch({ inbox: args.inbox, payloadRaw: raw });
  if (!result.ok) {
    process.stderr.write(`visual-qa subagentStop dispatcher: ${result.reason}\n`);
    process.exit(0);
  }
  process.exit(0);
}

const isDirectInvocation = process.argv[1] && process.argv[1].endsWith("subagent-stop-dispatcher.mjs");
if (isDirectInvocation) {
  main().catch((e) => {
    process.stderr.write(`visual-qa subagentStop dispatcher: ${e?.message ?? e}\n`);
    process.exit(0);
  });
}
