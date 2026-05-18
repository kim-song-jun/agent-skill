// Doc-level contract test for the interactive break-condition prompt
// introduced in Phase 0 + the object-form break-condition routing in
// Phase 6. Every platform sibling (Claude Code + cursor / copilot /
// codex / gemini) must:
//
//   1. Document the four PRESET_CATALOGUE choices in Phase 0.
//   2. Reference the break-resolver lib (normalizeBreakCondition).
//   3. Mention the save-confirmation prompt + non-interactive fallback
//      (--yes / non-TTY) in Phase 0.
//   4. Route on the spec.type in Phase 6 — visual-qa must dispatch a
//      subagent, not run via `sh -c`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHASE_0_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/0-preflight.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/0-preflight.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/0-preflight.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/0-preflight.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/0-preflight.md",
];

const PHASE_6_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/6-loop.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/6-loop.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/6-loop.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/6-loop.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/6-loop.md",
];

const SKILL_PATHS = [
  "plugins/harness-floor/skills/agent-all/SKILL.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/SKILL.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/SKILL.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/SKILL.md",
];

for (const p of PHASE_0_PATHS) {
  test(`${p}: documents break-condition resolution under --loop`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /break[- ]condition resolution|Break-condition resolution/i, `${p} missing break-condition section`);
    assert.match(body, /--loop/, `${p} should gate the prompt on --loop`);
  });

  test(`${p}: enumerates the four preset choices`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /Test command|test-auto|auto-detect/i, `${p} missing test-auto preset`);
    assert.match(body, /visual-qa/i, `${p} missing visual-qa preset`);
    assert.match(body, /Custom shell|custom shell command|Custom .* shell/i, `${p} missing custom shell preset`);
    assert.match(body, /Composite/i, `${p} missing composite preset`);
  });

  test(`${p}: documents non-interactive fallback`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /--yes|non-interactive|non-TTY|not a TTY|stdin is not/i, `${p} missing non-interactive fallback`);
  });

  test(`${p}: documents save-confirmation prompt`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /[Ss]ave .* default|save.*\.agent-all\.json|persist .* config/i, `${p} missing save-confirmation prompt`);
  });

  test(`${p}: references the break-resolver lib`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /break-resolver|normalizeBreakCondition|PRESET_CATALOGUE/, `${p} should reference break-resolver lib`);
  });
}

for (const p of PHASE_6_PATHS) {
  test(`${p}: routes on spec.type (not just plain shell)`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /type.*shell|spec\.type|breakCondition.*object|spec\.type ===|normalizeBreakCondition/, `${p} must route by spec.type`);
  });

  test(`${p}: visual-qa step dispatches a subagent (no sh -c)`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /visual-qa/, `${p} should mention visual-qa branch`);
    // The visual-qa branch must NOT be advertised as runnable through sh -c.
    // We accept any of: subagent, Task tool, gemini chat, copilot task,
    // codex agent dispatch, or any phrase indicating skill invocation.
    assert.match(body, /subagent|Task tool|skill dispatch|invoke the visual-qa|dispatch the visual-qa|visual-qa subagent|visual-qa.*skill/i, `${p} visual-qa branch must dispatch a subagent/skill, not sh -c`);
  });

  test(`${p}: composite short-circuits on first failure`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /short-circuit|first non-zero|sequential AND|fails.*stop|stops on .* failure/i, `${p} composite must short-circuit on first failure`);
  });
}

for (const p of SKILL_PATHS) {
  test(`${p}: documents --break-condition + --reconfigure CLI flags`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /--break-condition/, `${p} missing --break-condition flag`);
    assert.match(body, /--reconfigure/, `${p} missing --reconfigure flag`);
  });
}
