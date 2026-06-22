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
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

  // E7: the quality-debt-reviewer verdict must be a Phase-4 gate PASS CONDITION,
  // not merely dispatched informationally. The 2026-06-22 adversarial round found
  // cursor and codex 4-gate.md dispatched the reviewer but omitted its verdict
  // from the pass conditions (CC/copilot/gemini already gated on it), so quality
  // debt was advisory-only on those two ports. This asserts the binding clause.
  test(`port ssot contract [${p}]: E7 quality-debt-reviewer verdict gates the wave`, () => {
    const gate = read(p, "phases/4-gate.md");
    assert.ok(gate, `${p} phases/4-gate.md must exist`);
    assert.match(
      gate,
      /`quality-debt-reviewer` reports no unapproved quality debt/,
      `${p} 4-gate must make the quality-debt-reviewer verdict a gate pass condition, not just dispatch it`,
    );
  });
}

// E5: adversarial verification dispatch — blocking-language guard.
// Extended to [codex, copilot, cursor] per task-13: cursor 4-gate.md now authors
// the verification-reviewer-adversarial blocking section (user-requested slice;
// constraints §5 says "extend to include cursor IF cursor agent-all has a gate
// phase that authors it"). gemini = prose-only (#7) remains excluded.
const ADVERSARIAL_PORTS = ["codex", "copilot", "cursor"];

for (const p of ADVERSARIAL_PORTS) {
  test(
    `port ssot contract [${p}]: E5 adversarial dispatch uses BLOCKING (not advisory) language`,
    {
      // codex un-skipped in G6, copilot un-skipped in G7, cursor un-skipped in
      // task-13 (all 3 now author the verification-reviewer-adversarial blocking
      // section and the stale 'implementer's reported output' advisory phrase is
      // removed). gemini=prose-only (#7) remains excluded. Suite reaches 0 skip.
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

  // E8: the adversarial block must be enforced by the deterministic gate-check.mjs
  // process (exit-coded), not a prose code-fence the LLM must mentally evaluate
  // (2026-06-22 adversarial round defect C2/C4: adversarialAuditBlocks had zero
  // runtime caller — only a markdown code-fence). The phase doc must invoke the
  // vendored gate-check.mjs and document its exit-2-blocks contract.
  test(`port ssot contract [${p}]: E8 adversarial block enforced by gate-check.mjs (exit-coded, not prose)`, () => {
    const gate = read(p, "phases/4-gate.md");
    assert.ok(gate, `${p} phases/4-gate.md must exist`);
    assert.match(gate, /gate-check\.mjs/,
      `${p} 4-gate must invoke gate-check.mjs so the block decision is deterministic code, not LLM judgement`);
    assert.match(gate, /exit 2[\s\S]{0,80}BLOCK/i,
      `${p} 4-gate must document gate-check exit 2 = BLOCKED`);
    assert.ok(existsSync(resolve(dir(p), "lib/policy/gate-check.mjs")),
      `${p} must vendor lib/policy/gate-check.mjs (its sibling audit-tokens.mjs must also be present)`);
    assert.ok(existsSync(resolve(dir(p), "lib/policy/audit-tokens.mjs")),
      `${p} must vendor lib/policy/audit-tokens.mjs (gate-check imports adversarialAuditBlocks from it)`);
  });
}

// E8-CC: the canonical harness-floor (Claude) port also enforces via gate-check.mjs.
test("port ssot contract [CC]: E8 adversarial block enforced by gate-check.mjs (exit-coded)", () => {
  const root = resolve("plugins/harness-floor/skills/agent-all");
  const gate = readFileSync(resolve(root, "phases/4-gate.md"), "utf-8");
  assert.match(gate, /gate-check\.mjs/, "CC 4-gate must invoke gate-check.mjs");
  assert.match(gate, /exit 2[\s\S]{0,80}BLOCK/i, "CC 4-gate must document gate-check exit 2 = BLOCKED");
  assert.ok(existsSync(resolve(root, "lib/policy/gate-check.mjs")), "CC must ship lib/policy/gate-check.mjs (source of truth)");
});

// E6: phase-doc lib imports must be install-anchored, never a bare "./lib/...".
// The 2026-06-22 adversarial round found copilot phase docs importing
// `from "./lib/<f>.mjs"`; a re-audit found the SAME drift in codex + cursor
// agent-all, and an independent adversarial verifier then found it AGAIN in
// visual-qa-codex (5 imports) — invisible to the first version of this test
// because it scanned only agent-all-{p}. Every install-to-subdir (port, skill)
// copies its lib tree into a project subdir and Phase 0 mandates repo-root cwd,
// so a bare "./lib/..." resolves to <repo-root>/lib/... = ERR_MODULE_NOT_FOUND.
// This guard scans EVERY such (port, skill) by its install-anchored prefix, so
// the defect class is closed repo-wide for the remediation surface, not per-skill.
// In-place CC ports (harness-floor) legitimately use "./lib/" (run from the skill
// dir) and are excluded. gemini is excluded: init copies NO lib (prose-guided).
// (Out of this remediation's scope: harness-debug-codex/debug-codex also installs
// to .codex/skills/debug and carries one bare "./lib/" — surfaced to the user.)
const INSTALL_ANCHOR_SCAN = [
  { skill: "agent-all-codex",   dir: "plugins/harness-floor-codex/skills/agent-all-codex",     prefix: ".codex/skills/agent-all" },
  { skill: "agent-all-copilot", dir: "plugins/harness-floor-copilot/skills/agent-all-copilot", prefix: ".copilot/agent-all" },
  { skill: "agent-all-cursor",  dir: "plugins/harness-floor-cursor/skills/agent-all-cursor",   prefix: ".cursor/agent-all" },
  { skill: "visual-qa-codex",   dir: "plugins/harness-floor-codex/skills/visual-qa-codex",     prefix: ".codex/skills/visual-qa" },
  { skill: "visual-qa-cursor",  dir: "plugins/harness-floor-cursor/skills/visual-qa-cursor",   prefix: ".cursor/visual-qa" },
  { skill: "visual-qa-copilot", dir: "plugins/harness-floor-copilot/skills/visual-qa-copilot", prefix: ".copilot/visual-qa" },
  // harness-debug-codex installs to .codex/skills/debug (a SEPARATE plugin from the
  // agent-all family) — the same install-anchor class, surfaced by the round-3
  // adversary and folded into v0.7.2 per the user's decision.
  { skill: "debug-codex",       dir: "plugins/harness-debug-codex/skills/debug-codex",         prefix: ".codex/skills/debug" },
];

for (const sc of INSTALL_ANCHOR_SCAN) {
  test(`install-anchor guard [${sc.skill}]: phase-doc lib imports are install-anchored (no bare ./lib/, file exists)`, () => {
    const phasesDir = resolve(sc.dir, "phases");
    if (!existsSync(phasesDir)) return; // skill ships no phases
    const anchored = `./${sc.prefix}/lib/`;
    const libRoot = resolve(sc.dir, "lib");
    // Matches static `from "./...lib/x.mjs"` and dynamic `import("./...lib/x.mjs")`.
    const importRe = /(?:from|import\()\s*['"](\.\/[^'"]*?lib\/[^'"]+\.mjs)['"]/g;
    for (const f of readdirSync(phasesDir).filter((x) => x.endsWith(".md"))) {
      const body = readFileSync(resolve(phasesDir, f), "utf-8");
      let m;
      while ((m = importRe.exec(body)) !== null) {
        const importPath = m[1];
        assert.ok(
          importPath.startsWith(anchored),
          `${sc.skill}/phases/${f} imports "${importPath}" — must be install-anchored "${anchored}..." (a bare "./lib/" resolves to <repo-root>/lib from the mandated repo-root cwd = ERR_MODULE_NOT_FOUND)`,
        );
        const rel = importPath.slice(anchored.length);
        assert.ok(
          existsSync(resolve(libRoot, rel)),
          `${sc.skill}/phases/${f} imports "${importPath}" but lib/${rel} is absent from the skill's vendored lib tree (doc-vs-install drift)`,
        );
      }
    }
  });
}
