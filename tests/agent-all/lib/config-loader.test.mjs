import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadConfig, DEFAULTS, resolveVerificationCommands } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

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

test("wiki.auto defaults to true (the agent-all↔wiki auto-loop is default-on)", () => {
  assert.equal(DEFAULTS.wiki.auto, true);
});

test("wiki.model defaults to a cheap model (haiku) — the scribe authors on a cheap tier", () => {
  assert.equal(DEFAULTS.wiki.model, "haiku");
});

test("wiki.model: overridable string, non-string rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-wikimodel-"));
  try {
    const ok = join(dir, "ok.json");
    writeFileSync(ok, JSON.stringify({ wiki: { model: "sonnet" } }));
    assert.equal(loadConfig(ok).config.wiki.model, "sonnet", "wiki.model is overridable");

    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ wiki: { model: 42 } }));
    const r = loadConfig(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path === "wiki.model" && /string/i.test(e.message)), "non-string wiki.model rejected");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wiki.auto: a config can opt out (false), and a non-boolean is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-wiki-"));
  try {
    const off = join(dir, "off.json");
    writeFileSync(off, JSON.stringify({ wiki: { auto: false } }));
    const r1 = loadConfig(off);
    assert.equal(r1.ok, true);
    assert.equal(r1.config.wiki.auto, false, "explicit --no-wiki / config opt-out is honored");

    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ wiki: { auto: "yes" } }));
    const r2 = loadConfig(bad);
    assert.equal(r2.ok, false);
    assert.ok(r2.errors.some(e => e.path === "wiki.auto" && /boolean/i.test(e.message)), "non-boolean wiki.auto rejected");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verification commands: default null, resolution falls back to breakCondition, configured values override", () => {
  // Defaults are null → no regression: both scoped and full resolve to breakCondition.
  assert.deepEqual(DEFAULTS.verification, { scopedCommand: null, fullCommand: null });
  const def = resolveVerificationCommands(DEFAULTS);
  assert.equal(def.scoped, DEFAULTS.loop.breakCondition, "unconfigured scoped → breakCondition");
  assert.equal(def.full, DEFAULTS.loop.breakCondition, "unconfigured full → breakCondition");

  const dir = mkdtempSync(join(tmpdir(), "cfg-verif-"));
  try {
    // Both configured → both override the fallback.
    const both = join(dir, "both.json");
    writeFileSync(both, JSON.stringify({
      loop: { breakCondition: "npm test" },
      verification: { scopedCommand: "vitest related --run", fullCommand: "npm run test:all" },
    }));
    const rBoth = loadConfig(both);
    assert.equal(rBoth.ok, true);
    assert.equal(rBoth.config.verification.scopedCommand, "vitest related --run");
    const resBoth = resolveVerificationCommands(rBoth.config);
    assert.equal(resBoth.scoped, "vitest related --run");
    assert.equal(resBoth.full, "npm run test:all");

    // Only full configured → scoped falls back to breakCondition, full overrides.
    const partial = join(dir, "partial.json");
    writeFileSync(partial, JSON.stringify({
      loop: { breakCondition: "npm run test:unit" },
      verification: { fullCommand: "npm run test:all" },
    }));
    const rPartial = loadConfig(partial);
    assert.equal(rPartial.ok, true);
    assert.equal(rPartial.config.verification.scopedCommand, null, "scoped stays null when unset");
    const resPartial = resolveVerificationCommands(rPartial.config);
    assert.equal(resPartial.scoped, "npm run test:unit", "null scoped → breakCondition fallback");
    assert.equal(resPartial.full, "npm run test:all", "full overrides");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verification commands: empty-string and non-command values are rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-verif-bad-"));
  try {
    const emptyScoped = join(dir, "empty.json");
    writeFileSync(emptyScoped, JSON.stringify({ verification: { scopedCommand: "   " } }));
    const r1 = loadConfig(emptyScoped);
    assert.equal(r1.ok, false);
    assert.ok(r1.errors.some(e => e.path === "verification.scopedCommand"), "blank scopedCommand rejected");

    const numFull = join(dir, "num.json");
    writeFileSync(numFull, JSON.stringify({ verification: { fullCommand: 42 } }));
    const r2 = loadConfig(numFull);
    assert.equal(r2.ok, false);
    assert.ok(r2.errors.some(e => e.path === "verification.fullCommand"), "non-string/non-object fullCommand rejected");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
