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
  assert.deepEqual(result.config.artifact, { root: ".agent-skill", exportDocs: false });
  assert.deepEqual(result.config.telemetry.cost, DEFAULTS.telemetry.cost);
});

test("loads full config without modification", () => {
  const result = loadConfig(fx("full.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.defaults.maxIter, 3);
  assert.equal(result.config.loop.stableIters, 2);
  assert.deepEqual(result.config.artifact, { root: ".custom-agent", exportDocs: true });
  assert.equal(result.config.telemetry.cost.warnAtRatio, 0.8);
});

test("loads explicit unlimited loop config with null maxIter", () => {
  const result = loadConfig(fx("unlimited-loop.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.defaults.maxIter, null);
  assert.equal(result.config.loop.maxIter, null);
  assert.equal(result.config.loop.maxRuntimeSec, 3600);
  assert.equal(result.config.loop.maxRepeatedFailureSignature, 3);
});

test("loads verification-adapter break condition config", () => {
  const result = loadConfig(fx("verification-adapter.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.loop.breakCondition.type, "verification-adapter");
  assert.equal(result.config.loop.breakCondition.adapter, "cli");
  assert.equal(result.config.loop.breakCondition.config.command, "node --version");
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
  assert.ok(result.errors.some(e => e.path === "loop.maxRuntimeSec" && /number/i.test(e.message)));
  assert.ok(result.errors.some(e => e.path === "artifact.exportDocs" && /boolean/i.test(e.message)));
});

test("rejects invalid cost telemetry config types", () => {
  const result = loadConfig(fx("invalid-telemetry.json"));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === "telemetry.cost.enabled" && /boolean/i.test(e.message)));
  assert.ok(result.errors.some(e => e.path === "telemetry.cost.warnAtRatio" && /number/i.test(e.message)));
  assert.ok(result.errors.some(e => e.path === "telemetry.cost.modelRates" && /object/i.test(e.message)));
});
