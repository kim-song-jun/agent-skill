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

const CLAUDE_CODEX_PHASE_3_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/3-dispatch.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/3-dispatch.md",
];

const CLAUDE_CODEX_PHASE_4_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/4-gate.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md",
];

function assertDispatchContract(body, path) {
  assert.match(body, /Dispatch Prompt Contract|Dispatch Contract/i, `${path} missing dispatch contract section`);
  assert.match(body, /Working directory/i, `${path} missing working directory contract`);
  assert.match(body, /Owned files|Owned file ranges|Owned files or line ranges/i, `${path} missing owned-files contract`);
  assert.match(body, /Forbidden files|Forbidden areas/i, `${path} missing forbidden-files contract`);
  assert.match(body, /DO NOT/, `${path} missing DO NOT list requirement`);
  assert.match(body, /Self-Audit/, `${path} missing Self-Audit output requirement`);
  assert.match(body, /Do not self-commit|self-commit/i, `${path} missing self-commit prohibition`);
}

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

for (const p of CLAUDE_CODEX_PHASE_3_PATHS) {
  test(`${p}: mandates the implementer dispatch prompt contract`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assertDispatchContract(body, p);
  });

  test(`${p}: reconciles no self-commit with coordinator-owned commit recording`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /coordinator|orchestrator/i, `${p} should name the commit owner`);
    assert.match(body, /pathspec commit/i, `${p} should require scoped pathspec commits`);
    assert.match(body, /record.*commit/i, `${p} should record coordinator-created commit SHAs`);
    assert.match(body, /changed files/i, `${p} should require implementers to report changed files`);
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

for (const p of CLAUDE_CODEX_PHASE_4_PATHS) {
  test(`${p}: mandates the reviewer dispatch prompt contract`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assertDispatchContract(body, p);
  });
}
