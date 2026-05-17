import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig, DEFAULTS } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "configs", name);

test("loads minimal config — fills in built-in defaults for missing sections", () => {
  const result = loadConfig(fx("minimal.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.defaults.maxIter, 1);
  assert.deepEqual(Object.keys(result.config.waves).sort(), ["large", "medium", "small"]);
  assert.equal(result.config.loop.stableIters, DEFAULTS.loop.stableIters);
});

test("loads full config without modification", () => {
  const result = loadConfig(fx("full.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.defaults.maxIter, 3);
  assert.equal(result.config.loop.stableIters, 2);
});

test("missing config file → returns built-in defaults with warning flag", () => {
  const result = loadConfig(fx("__nonexistent__.json"));
  assert.equal(result.ok, true);
  assert.equal(result.warning, true);
  assert.deepEqual(result.config, DEFAULTS);
});

test("invalid type → returns error", () => {
  const result = loadConfig(fx("invalid-type.json"));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /maxIter/.test(e.path) && /number/i.test(e.message)));
});
