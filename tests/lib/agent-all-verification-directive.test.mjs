// Verifies the mandatory verification-before-completion directive
// appears in every platform's Phase 3 dispatch + Phase 4 gate docs.
// This is the safety-net layer that makes /agent-all --loop runs safe to
// leave unattended — implementer subagents must verify; reviewer subagents
// must check that verification actually happened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHASE_3_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/3-dispatch.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/3-dispatch.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/3-dispatch.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/3-dispatch.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/3-dispatch.md",
];

const PHASE_4_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/4-gate.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/4-gate.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/4-gate.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/4-gate.md",
];

for (const p of PHASE_3_PATHS) {
  test(`${p}: mandates superpowers:verification-before-completion in subagent dispatch`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /superpowers:verification-before-completion/, `${p} missing mandatory verification directive`);
    assert.match(body, /STATUS: blocked, REASON: verification failed/, `${p} missing failure-status convention`);
  });

  test(`${p}: recommends superpowers:test-driven-development for feature tasks`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /superpowers:test-driven-development/, `${p} missing TDD recommendation`);
    assert.match(body, /recommended, not strictly enforced/, `${p} should flag TDD as recommendation, not strict enforcement`);
  });
}

for (const p of PHASE_4_PATHS) {
  test(`${p}: mandates reviewer to verify implementer ran verification`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /superpowers:verification-before-completion/, `${p} reviewer must check for verification`);
    assert.match(body, /escalate as a `critical` issue/, `${p} reviewer must escalate skipped/failed verification as critical`);
  });

  test(`${p}: documents the two-layer safety net (Phase 3 verifies, Phase 4 audits)`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /two-layer safety net|Two-layer safety net/, `${p} should reference the two-layer safety net`);
  });
}
