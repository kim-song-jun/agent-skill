#!/usr/bin/env node
// gate-check.mjs — deterministic adversarial-audit gate.
//
// Makes the BLOCK DECISION deterministic code instead of asking the orchestrating
// LLM to mentally evaluate `adversarialAuditBlocks(...).blocked`. The phase doc
// runs this as a single shell command and reads the exit code:
//   exit 0  -> not blocked (VERIFICATION_AUDIT: passed | skipped | token absent)
//   exit 2  -> BLOCKED     (VERIFICATION_AUDIT: failed from the adversarial reviewer)
//
// The adversarial reviewer's reported verdict text is supplied via the
// $GATE_VERDICT_TEXT env var, or piped on stdin:
//   printf '%s' "$ADV_AUDIT_TEXT" | node <lib>/policy/gate-check.mjs
//
// Honest scope: this makes the *decision* deterministic (exit-coded, computed by
// adversarialAuditBlocks — not LLM judgement). The *invocation* is still issued by
// the orchestrator following the phase doc; there is no runtime hook that auto-runs
// phase markdown. Running the command and checking its exit code is one unambiguous
// step, which is the honest ceiling of a markdown-orchestrated gate.

import { adversarialAuditBlocks } from "./audit-tokens.mjs";

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

const text =
  process.env.GATE_VERDICT_TEXT != null && process.env.GATE_VERDICT_TEXT !== ""
    ? process.env.GATE_VERDICT_TEXT
    : await readStdin();

const { blocked, verdict, role } = adversarialAuditBlocks(text);

if (blocked) {
  process.stderr.write(
    `[gate-check] BLOCKED: ${role} reported VERIFICATION_AUDIT: ${verdict} — enter Phase-4 block-on-critical retry, do not pass the wave.\n`,
  );
  process.exit(2);
}
process.stdout.write(
  `[gate-check] ok: ${role} verdict=${verdict ?? "absent"} (not blocked)\n`,
);
process.exit(0);
