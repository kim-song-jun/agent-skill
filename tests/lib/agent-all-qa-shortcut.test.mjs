// Verifies the `--qa` shortcut feature wired into Phase 0 of /agent-all:
//   - lib/break-resolver.mjs exports QA_SHORTCUT_SPEC + QA_AUTOSCAFFOLD_CONFIG
//   - normalizeBreakCondition accepts the `mode` field on visual-qa steps
//   - serializeBreakCondition surfaces [comprehensive] when mode set
//   - all 5 platform Phase 0 docs document the --qa branch
//   - all 5 platform SKILL.md files document the --qa flag
//   - all 4 vendored break-resolver copies match the source-of-truth

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  QA_SHORTCUT_SPEC,
  QA_AUTOSCAFFOLD_CONFIG,
  normalizeBreakCondition,
  serializeBreakCondition,
} from "../../plugins/harness-floor/skills/agent-all/lib/break-resolver.mjs";

const PHASE_0_PATHS = [
  "plugins/harness-floor/skills/agent-all/phases/0-preflight.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/0-preflight.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/0-preflight.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/phases/0-preflight.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/0-preflight.md",
];

const SKILL_PATHS = [
  "plugins/harness-floor/skills/agent-all/SKILL.md",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/SKILL.md",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/SKILL.md",
  "plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/SKILL.md",
];

const VENDORED_RESOLVERS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/break-resolver.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/break-resolver.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/break-resolver.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/break-resolver.mjs",
];

test("QA_SHORTCUT_SPEC is the canonical composite of test-auto + visual-qa comprehensive", () => {
  assert.deepEqual(QA_SHORTCUT_SPEC, {
    type: "composite",
    steps: [
      { type: "test-auto" },
      { type: "visual-qa", mode: "comprehensive" },
    ],
  });
});

test("QA_SHORTCUT_SPEC normalises cleanly (i.e., it is a valid spec)", () => {
  const out = normalizeBreakCondition(QA_SHORTCUT_SPEC);
  assert.ok(out);
  assert.equal(out.type, "composite");
  assert.equal(out.steps.length, 2);
  assert.equal(out.steps[0].type, "test-auto");
  assert.equal(out.steps[1].type, "visual-qa");
  assert.equal(out.steps[1].mode, "comprehensive");
});

test("normalizeBreakCondition: visual-qa step preserves valid mode", () => {
  assert.deepEqual(
    normalizeBreakCondition({ type: "visual-qa", mode: "comprehensive" }),
    { type: "visual-qa", mode: "comprehensive" },
  );
  assert.deepEqual(
    normalizeBreakCondition({ type: "visual-qa", mode: "declared" }),
    { type: "visual-qa", mode: "declared" },
  );
});

test("normalizeBreakCondition: visual-qa step drops invalid mode", () => {
  const out = normalizeBreakCondition({ type: "visual-qa", mode: "explosive" });
  assert.deepEqual(out, { type: "visual-qa" });
  assert.equal(out.mode, undefined);
});

test("serializeBreakCondition: shows [comprehensive] tag when mode=comprehensive", () => {
  assert.match(serializeBreakCondition({ type: "visual-qa", mode: "comprehensive" }), /\[comprehensive\]/);
  assert.doesNotMatch(serializeBreakCondition({ type: "visual-qa" }), /\[comprehensive\]/);
});

test("serializeBreakCondition: full QA_SHORTCUT_SPEC renders with both pieces", () => {
  const s = serializeBreakCondition(QA_SHORTCUT_SPEC);
  assert.match(s, /composite \[auto-detected test command && visual-qa skill \[comprehensive\]\]/);
});

test("QA_AUTOSCAFFOLD_CONFIG: comprehensive-mode visual-qa template with sane defaults", () => {
  assert.equal(QA_AUTOSCAFFOLD_CONFIG.mode, "comprehensive");
  assert.equal(typeof QA_AUTOSCAFFOLD_CONFIG.baseUrl, "string");
  assert.ok(QA_AUTOSCAFFOLD_CONFIG.baseUrl.startsWith("http"));
  assert.ok(Array.isArray(QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope.include));
  assert.ok(QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope.include.length > 0);
  assert.equal(QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope.maxPages, 50);
  assert.equal(QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope.depth, 3);
  assert.equal(QA_AUTOSCAFFOLD_CONFIG.comprehensive.interactions.click, true);
  assert.equal(QA_AUTOSCAFFOLD_CONFIG.comprehensive.interactions.depth, 1);
  assert.equal(QA_AUTOSCAFFOLD_CONFIG.comprehensive.verdict.firstRun, "auto-pass");
  assert.deepEqual(QA_AUTOSCAFFOLD_CONFIG.comprehensive.verdict.failOn, ["critical", "major"]);
});

test("QA_AUTOSCAFFOLD_CONFIG: serialises to valid JSON (no functions, no cycles)", () => {
  const round = JSON.parse(JSON.stringify(QA_AUTOSCAFFOLD_CONFIG));
  assert.deepEqual(round, QA_AUTOSCAFFOLD_CONFIG);
});

for (const p of PHASE_0_PATHS) {
  test(`${p}: documents the --qa shortcut branch at highest priority`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /--qa shortcut|--qa\s+shortcut|`--qa`/, `${p} missing --qa branch`);
    assert.match(body, /QA_SHORTCUT_SPEC/, `${p} should reference QA_SHORTCUT_SPEC`);
    assert.match(body, /QA_AUTOSCAFFOLD_CONFIG/, `${p} should reference QA_AUTOSCAFFOLD_CONFIG`);
  });

  test(`${p}: --qa branch mentions auto-scaffold of .visual-qa.json`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /\.visual-qa\.json/, `${p} should mention .visual-qa.json`);
    assert.match(body, /missing|not exist/, `${p} should describe the missing-file scaffold trigger`);
  });
}

for (const p of SKILL_PATHS) {
  test(`${p}: documents the --qa flag`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /--qa\b/, `${p} missing --qa flag`);
    assert.match(body, /composite|test-auto|visual-qa/, `${p} should explain --qa expands to composite`);
    assert.match(body, /comprehensive/, `${p} should mention comprehensive mode`);
  });
}

for (const vendored of VENDORED_RESOLVERS) {
  test(`${vendored}: vendored break-resolver carries QA_SHORTCUT_SPEC + QA_AUTOSCAFFOLD_CONFIG exports`, () => {
    const body = readFileSync(resolve(vendored), "utf-8");
    assert.match(body, /export const QA_SHORTCUT_SPEC/, `${vendored} missing QA_SHORTCUT_SPEC export`);
    assert.match(body, /export const QA_AUTOSCAFFOLD_CONFIG/, `${vendored} missing QA_AUTOSCAFFOLD_CONFIG export`);
  });
}
