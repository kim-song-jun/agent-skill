import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(".");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

test("security redaction helpers are available in core, floor, platform, and debug runtimes", () => {
  const required = [
    "plugins/harness-core/lib/security/redaction-scanner.mjs",
    "plugins/harness-core/lib/security/artifact-redactor.mjs",
    "plugins/harness-floor/skills/agent-all/lib/security/redaction-scanner.mjs",
    "plugins/harness-floor-codex/skills/agent-all-codex/lib/security/redaction-scanner.mjs",
    "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/security/redaction-scanner.mjs",
    "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/security/redaction-scanner.mjs",
    "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/security/redaction-scanner.mjs",
    "plugins/harness-debug/skills/debug/lib/security/redaction-scanner.mjs",
    "plugins/harness-debug-codex/skills/debug-codex/lib/security/redaction-scanner.mjs",
  ];

  for (const rel of required) {
    assert.equal(existsSync(resolve(ROOT, rel)), true, `${rel} should exist`);
  }
});

test("agent-all PR phase requires redaction before GitHub PR creation", () => {
  for (const rel of [
    "plugins/harness-floor/skills/agent-all/phases/5-pr.md",
    "plugins/harness-floor-codex/skills/agent-all-codex/phases/5-pr.md",
    "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/5-pr.md",
    "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/5-pr.md",
    "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/5-pr.md",
  ]) {
    const body = read(rel);
    assert.match(body, /redactArtifactContent/);
    assert.match(body, /assertRedactionAllowed/);
    assert.match(body, /PR body/);
    assert.match(body, /gh pr create[\s\S]{0,120}prBody/);
  }
});

test("visual QA and debug phases require redaction before artifact writes", () => {
  for (const rel of [
    "plugins/harness-floor/skills/visual-qa/phases/4-aggregate.md",
    "plugins/harness-floor-codex/skills/visual-qa-codex/phases/4-aggregate.md",
    "plugins/harness-floor-cursor/skills/visual-qa-cursor/phases/4-aggregate.md",
    "plugins/harness-floor-copilot/skills/visual-qa-copilot/phases/4-aggregate.md",
    "plugins/harness-floor-gemini/skills/visual-qa-gemini/phases/4-aggregate.md",
  ]) {
    const body = read(rel);
    assert.match(body, /redactArtifactContent/);
    assert.match(body, /report\.md/);
    assert.match(body, /report\.json/);
  }

  for (const rel of [
    "plugins/harness-debug/skills/debug/phases/5-summarise.md",
    "plugins/harness-debug-codex/skills/debug-codex/phases/5-summarise.md",
  ]) {
    const body = read(rel);
    assert.match(body, /redaction gate/);
    assert.match(body, /\.debug-state\.json/);
  }
});

test("agent-all intent phases require redaction before task doc writes", () => {
  for (const rel of [
    "plugins/harness-floor/skills/agent-all/phases/1-intent.md",
    "plugins/harness-floor-codex/skills/agent-all-codex/phases/1-intent.md",
    "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/1-intent.md",
    "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/1-intent.md",
    "plugins/harness-floor-gemini/skills/agent-all-gemini/phases/1-intent.md",
  ]) {
    const body = read(rel);
    assert.match(body, /writeTaskDocArtifact/);
    assert.match(body, /\.agent-skill\/tasks\/<display-id>-<slug>\.md/);
    assert.match(body, /\.agent-skill\/tasks\/index\.md/);
  }
});
