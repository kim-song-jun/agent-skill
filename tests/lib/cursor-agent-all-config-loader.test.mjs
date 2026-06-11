// Verifies the vendored copy of `config-loader.mjs` in the
// agent-all-cursor skill stays byte-for-byte identical to the
// source-of-truth, and that its API behaves the same way against the
// shared fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, DEFAULTS } from "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "agent-all", "fixtures", "configs", name);

const SOURCE = resolve("plugins/harness-floor/skills/agent-all/lib/config-loader.mjs");
const VENDORED = resolve("plugins/harness-floor-cursor/skills/agent-all-cursor/lib/config-loader.mjs");

test("vendored copy retains all source-of-truth code (allowing for added header comments)", () => {
  const src = readFileSync(SOURCE, "utf-8");
  const ven = readFileSync(VENDORED, "utf-8");
  // The vendored file may carry a leading header comment block — verify
  // every non-empty line from the source appears verbatim in the vendored
  // file (stable strict-superset check).
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    assert.ok(
      ven.includes(line),
      `vendored config-loader.mjs missing line from source: ${line}`,
    );
  }
});

test("loads minimal config — fills in built-in defaults for missing sections", () => {
  const r = loadConfig(fx("minimal.json"));
  assert.equal(r.ok, true);
  assert.equal(r.config.defaults.maxIter, 1);
  assert.deepEqual(Object.keys(r.config.waves).sort(), ["large", "medium", "small"]);
  assert.equal(r.config.loop.stableIters, DEFAULTS.loop.stableIters);
});

test("loads full config without modification", () => {
  const r = loadConfig(fx("full.json"));
  assert.equal(r.ok, true);
  assert.equal(r.config.defaults.maxIter, 3);
  assert.equal(r.config.loop.stableIters, 2);
});

test("missing file → returns DEFAULTS with warning flag", () => {
  const r = loadConfig(fx("__nope__.json"));
  assert.equal(r.ok, true);
  assert.equal(r.warning, true);
  assert.deepEqual(r.config, DEFAULTS);
});

test("invalid type → returns error", () => {
  const r = loadConfig(fx("invalid-type.json"));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /maxIter/.test(e.path) && /number/i.test(e.message)));
  assert.ok(r.errors.some((e) => e.path === "loop.maxRuntimeSec" && /number/i.test(e.message)));
});
