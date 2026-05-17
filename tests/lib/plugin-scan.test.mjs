import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scanPlugins } from "../../plugins/harness-builder/skills/agent-init/lib/plugin-scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, "..", "fixtures", "plugins", name), "utf-8"));

const REQUIRED = ["context-mode@context-mode", "superpowers@claude-plugins-official"];

test("classifies all-enabled as enabled", () => {
  const { installed, enabled } = load("all-enabled.json");
  const result = scanPlugins({ installedPlugins: installed, enabledPlugins: enabled, required: REQUIRED });
  assert.deepEqual(result.enabled.sort(), REQUIRED.slice().sort());
  assert.deepEqual(result.disabled, []);
  assert.deepEqual(result.missing, []);
});

test("classifies disabled-but-installed correctly", () => {
  const { installed, enabled } = load("partial.json");
  const result = scanPlugins({ installedPlugins: installed, enabledPlugins: enabled, required: REQUIRED });
  assert.deepEqual(result.enabled, ["context-mode@context-mode"]);
  assert.deepEqual(result.disabled, ["superpowers@claude-plugins-official"]);
  assert.deepEqual(result.missing, []);
});

test("classifies fully missing", () => {
  const { installed, enabled } = load("missing.json");
  const result = scanPlugins({ installedPlugins: installed, enabledPlugins: enabled, required: REQUIRED });
  assert.deepEqual(result.enabled, []);
  assert.deepEqual(result.disabled, []);
  assert.deepEqual(result.missing.sort(), REQUIRED.slice().sort());
});

test("ignores plugins not in the required list", () => {
  const result = scanPlugins({
    installedPlugins: { plugins: { "frontend-design@x": [{}] } },
    enabledPlugins: { "frontend-design@x": true },
    required: ["context-mode@context-mode"],
  });
  assert.deepEqual(result.missing, ["context-mode@context-mode"]);
  assert.equal(result.enabled.length, 0);
});
