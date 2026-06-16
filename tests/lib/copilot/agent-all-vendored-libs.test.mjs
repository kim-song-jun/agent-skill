// Vendored-lib sync check for agent-all-copilot.
//
// The 3 modules below are vendored byte-for-byte from
// plugins/harness-floor/skills/agent-all/lib/. This test guards drift.
// (Functional behaviour is covered by the source-of-truth tests in
// tests/agent-all/lib/.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = ["config-loader.mjs", "wave-builder.mjs", "loop-evaluator.mjs"];
const SOURCE = "plugins/harness-floor/skills/agent-all/lib";
const VENDORED = "plugins/harness-floor-copilot/skills/agent-all-copilot/lib";

for (const f of FILES) {
  test(`agent-all-copilot vendored ${f} matches source-of-truth`, () => {
    const src = readFileSync(resolve(SOURCE, f), "utf-8");
    const dst = readFileSync(resolve(VENDORED, f), "utf-8");
    assert.equal(dst, src, `${f} diverged — re-vendor from ${SOURCE}`);
  });
}

test("agent-all-copilot config-loader: imports load and basic load works", async () => {
  const mod = await import(`../../../${VENDORED}/config-loader.mjs`);
  assert.equal(typeof mod.loadConfig, "function");
  // DEFAULTS.defaults.waveSize must be one of the valid size strings.
  assert.ok(["small", "medium", "large"].includes(mod.DEFAULTS.defaults.waveSize),
    "waveSize must be small|medium|large");
  // loadConfig on a missing path returns defaults without errors.
  const r = mod.loadConfig("/nonexistent/path/config.json");
  assert.equal(r.ok, true, "loadConfig on missing file must return ok=true with defaults");
  assert.ok(r.config, "loadConfig on missing file must return a config object");
  assert.equal(r.config.defaults.waveSize, mod.DEFAULTS.defaults.waveSize);
});

test("agent-all-copilot wave-builder: buildWaves runs", async () => {
  const { buildWaves } = await import(`../../../${VENDORED}/wave-builder.mjs`);
  const waves = buildWaves(
    [{ id: 1, files: ["a"] }, { id: 2, files: ["b"] }],
    { maxParallel: 2, rolesAllowed: ["dev"] },
  );
  assert.equal(waves.length, 1);
});

test("agent-all-copilot loop-evaluator: evaluateLoop runs", async () => {
  const { evaluateLoop } = await import(`../../../${VENDORED}/loop-evaluator.mjs`);
  const res = evaluateLoop(
    { iter: 0, costUSD: 0, consecutivePass: 0 },
    { maxIter: 3, maxCostUSD: 100, stableIters: 1 },
    () => ({ exitCode: 0 }),
  );
  assert.equal(res.action, "break");
});
