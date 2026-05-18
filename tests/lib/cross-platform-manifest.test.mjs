import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
  "harness-floor-codex",
  "harness-floor-copilot",
  "harness-floor-gemini",
];

for (const p of PLUGINS) {
  test(`${p}: plugin.json is valid and has required fields`, () => {
    const path = resolve("plugins", p, ".claude-plugin", "plugin.json");
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw);
    assert.equal(data.name, p);
    assert.ok(data.version, "version present");
    assert.ok(data.description, "description present");
  });
}

test("harness-builder-gemini: gemini-extension.json is valid", () => {
  const path = resolve("plugins", "harness-builder-gemini", "gemini-extension.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  assert.equal(data.name, "harness-builder-gemini");
  assert.equal(data.contextFileName, "GEMINI.md");
});

test("harness-floor-gemini: gemini-extension.json is valid", () => {
  const path = resolve("plugins", "harness-floor-gemini", "gemini-extension.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  assert.equal(data.name, "harness-floor-gemini");
});

test("marketplace.json lists all nine plugins", () => {
  const data = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf-8"));
  const names = data.plugins.map((p) => p.name).sort();
  assert.deepEqual(names, [
    "harness-builder",
    "harness-builder-codex",
    "harness-builder-copilot",
    "harness-builder-cursor",
    "harness-builder-gemini",
    "harness-floor",
    "harness-floor-codex",
    "harness-floor-copilot",
    "harness-floor-gemini",
  ]);
});
