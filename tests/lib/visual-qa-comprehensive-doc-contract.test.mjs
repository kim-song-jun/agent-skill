// Doc-level contract test: all 5 platform visual-qa SKILL.md files
// describe `declared` + `comprehensive` modes and the four pieces of
// comprehensive (crawl auto-discovery, shallow click, dom-hash cache,
// baseline-relative verdict).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_PATHS = [
  "plugins/harness-floor/skills/visual-qa/SKILL.md",
  "plugins/harness-floor-cursor/skills/visual-qa-cursor/SKILL.md",
  "plugins/harness-floor-copilot/skills/visual-qa-copilot/SKILL.md",
  "plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md",
  "plugins/harness-floor-gemini/skills/visual-qa-gemini/SKILL.md",
];

for (const p of SKILL_PATHS) {
  test(`${p}: documents declared + comprehensive modes`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /\bdeclared\b/, `${p} should mention declared mode`);
    assert.match(body, /\bcomprehensive\b/, `${p} should mention comprehensive mode`);
  });

  test(`${p}: describes the comprehensive components users care about`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    // crawl auto-discovery
    assert.match(body, /crawl|auto-discover/i, `${p} should mention crawl/auto-discovery`);
    // shallow click
    assert.match(body, /shallow.click|click.*expansion/i, `${p} should mention shallow click`);
    // baseline verdict
    assert.match(body, /baseline|verdict/i, `${p} should mention baseline/verdict`);
  });
}

const PHASE_1_PATHS = [
  "plugins/harness-floor/skills/visual-qa/phases/1-config.md",
  "plugins/harness-floor-codex/skills/visual-qa-codex/phases/1-config.md",
];

for (const p of PHASE_1_PATHS) {
  test(`${p}: documents the mode branch with code references`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /mode === "declared"/);
    assert.match(body, /mode === "comprehensive"/);
    assert.match(body, /crawler|crawl\(/);
    assert.match(body, /walkDom|dom-walker/);
    assert.match(body, /git-diff-scoper|scopeDiff/);
  });
}

const PHASE_4_PATHS = [
  "plugins/harness-floor/skills/visual-qa/phases/4-aggregate.md",
  "plugins/harness-floor-codex/skills/visual-qa-codex/phases/4-aggregate.md",
];

for (const p of PHASE_4_PATHS) {
  test(`${p}: comprehensive verdict + DOM-hash cache writeback documented`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /computeVerdict|firstRunVerdict/);
    assert.match(body, /verdict\.json/);
    assert.match(body, /dom-hash|domHashCache|writeCache/);
  });
}

const PHASE_5_PATHS = [
  "plugins/harness-floor/skills/visual-qa/phases/5-summary.md",
  "plugins/harness-floor-codex/skills/visual-qa-codex/phases/5-summary.md",
];

for (const p of PHASE_5_PATHS) {
  test(`${p}: exit code branches on mode`, () => {
    const body = readFileSync(resolve(p), "utf-8");
    assert.match(body, /Comprehensive mode/i);
    assert.match(body, /verdict\.pass/);
    assert.match(body, /Declared mode/i);
  });
}
