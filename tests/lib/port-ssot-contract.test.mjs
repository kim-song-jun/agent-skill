// Drift guard for the agent-all SSOT pipeline contract across the 4 ports.
//
// The 2026-06-15 audit found the four agent-all ports (codex/copilot/cursor/
// gemini) had silently DROPPED mandatory pipeline-contract points that the
// canonical harness-floor agent-all enforces — and no test caught it because
// the ports are independent and sync-lib does not protect their phase files.
//
// This test mechanically asserts each port still carries the four restored
// contract points. If a port drops one again, CI fails here. (Markers, not
// full equivalence — the ports legitimately adapt wording to their platform.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PORTS = ["codex", "copilot", "cursor", "gemini"];
const dir = (p) => resolve("plugins", `harness-floor-${p}`, "skills", `agent-all-${p}`);
const read = (p, rel) => {
  const f = resolve(dir(p), rel);
  return existsSync(f) ? readFileSync(f, "utf-8") : null;
};

for (const p of PORTS) {
  test(`port ssot contract [${p}]: E1 orchestrator-routing seam present`, () => {
    const intent = read(p, "phases/1-intent.md");
    assert.ok(intent, `${p} phases/1-intent.md must exist`);
    assert.match(intent, /orchestrator-routing/, `${p} 1-intent must reference the orchestrator-routing seam`);
    assert.ok(
      existsSync(resolve(dir(p), "references/orchestrator-routing.md")),
      `${p} must ship references/orchestrator-routing.md`,
    );
    // The routing target must be the PLATFORM's mechanism, never a literal
    // dangling reference to CC's built-in Workflow tool as the route target.
    assert.doesNotMatch(
      intent,
      /built-in `Workflow`\/fan-out mechanism is the correct orchestrator/,
      `${p} 1-intent must not route to the CC-only built-in Workflow tool`,
    );
  });

  test(`port ssot contract [${p}]: E2 audit-token gate present (VERIFICATION/QA/ORCHESTRATION_AUDIT)`, () => {
    const gate = read(p, "phases/4-gate.md");
    assert.ok(gate, `${p} phases/4-gate.md must exist`);
    for (const tok of ["VERIFICATION_AUDIT", "QA_AUDIT", "ORCHESTRATION_AUDIT"]) {
      assert.match(gate, new RegExp(tok), `${p} 4-gate must enforce ${tok}`);
    }
  });

  test(`port ssot contract [${p}]: E3 orchestrator-owned commit (subagents cannot self-commit)`, () => {
    const dispatch = read(p, "phases/3-dispatch.md");
    assert.ok(dispatch, `${p} phases/3-dispatch.md must exist`);
    assert.match(
      dispatch,
      /self-commit|orchestrator.{0,40}commit|stages only|task-owned pathspec/i,
      `${p} 3-dispatch must state the orchestrator owns the commit and subagents must not self-commit`,
    );
  });

  test(`port ssot contract [${p}]: E4 task-ledger acceptance gate present + lib vendored`, () => {
    const pr = read(p, "phases/5-pr.md");
    assert.ok(pr, `${p} phases/5-pr.md must exist`);
    assert.match(pr, /validateTaskLedger/, `${p} 5-pr must run the validateTaskLedger gate`);
    assert.ok(
      existsSync(resolve(dir(p), "lib/task-ledger.mjs")),
      `${p} must vendor lib/task-ledger.mjs so the Phase-5 gate can run`,
    );
  });
}

// E5: adversarial verification dispatch — blocking-language guard.
// Scoped to [codex, copilot] per spec §4 and decision #4 (smartness = CC+Codex+Copilot).
// gemini = prose-only (#7); cursor excluded from smartness (#4, §8).
const ADVERSARIAL_PORTS = ["codex", "copilot"];

for (const p of ADVERSARIAL_PORTS) {
  test(
    `port ssot contract [${p}]: E5 adversarial dispatch uses BLOCKING (not advisory) language`,
    {
      skip:
        "Authored in G6/G7 — un-skip requires (1) adding the verification-reviewer-adversarial " +
        "section to this port's 4-gate.md AND (2) removing the stale 'implementer\\'s reported output' " +
        "advisory phrase from its per-reviewer block " +
        `(${p === "codex" ? "codex 4-gate.md:~133" : "copilot ~161"}), ` +
        "or E5's doesNotMatch assertion stays red.",
    },
    () => {
      const gate = read(p, "phases/4-gate.md");
      assert.ok(gate, `${p} phases/4-gate.md must exist`);
      assert.match(gate, /verification-reviewer-adversarial/,
        `${p} 4-gate must dispatch verification-reviewer-adversarial`);
      assert.match(gate, /MUST NOT read|MUST re-derive|BLOCKS the wave/i,
        `${p} 4-gate adversarial step must use BLOCKING language`);
      assert.match(gate, /implementer.{0,40}self.report|self.report.{0,40}implementer/i,
        `${p} 4-gate must name and forbid implementer self-report`);
      assert.doesNotMatch(gate, /implementer's reported output/,
        `${p} 4-gate must NOT trust the implementer's reported output`);
    },
  );
}
