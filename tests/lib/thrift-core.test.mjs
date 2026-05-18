import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, DEFAULTS } from "../../plugins/harness-thrift/skills/thrift/lib/config-loader.mjs";
import { shouldFireSummariser, estimateTokensFromBytes } from "../../plugins/harness-thrift/skills/thrift/lib/threshold-evaluator.mjs";
import { estimate, estimateSession, SUPPORTED_MODELS } from "../../plugins/harness-thrift/skills/thrift/lib/cost-estimator.mjs";

// ---------- config-loader ----------

test("config-loader: returns DEFAULTS with warning when path missing", () => {
  const r = loadConfig("/tmp/nonexistent/.thrift.json");
  assert.equal(r.ok, true);
  assert.equal(r.config.summariser.everyNTurns, 25);
  assert.match(r.warning, /not found/);
});

test("config-loader: returns DEFAULTS when path is null", () => {
  const r = loadConfig(null);
  assert.equal(r.ok, true);
  assert.equal(r.config.summariser.model, "claude-haiku-4-5-20251001");
});

test("config-loader: parses valid config", () => {
  const dir = mkdtempSync(join(tmpdir(), "thrift-cl-"));
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({ ...DEFAULTS, summariser: { ...DEFAULTS.summariser, everyNTurns: 50 } }));
    const r = loadConfig(p);
    assert.equal(r.ok, true);
    assert.equal(r.config.summariser.everyNTurns, 50);
    assert.equal(r.warning, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: rejects invalid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "thrift-cl-"));
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, "{not json}");
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    assert.equal(r.errors[0].field, "(parse)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: surfaces field-level errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "thrift-cl-"));
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      summariser: { ...DEFAULTS.summariser, everyNTurns: -1 },
      cache: { ...DEFAULTS.cache, warmInterval: 999 },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map(e => e.field);
    assert.ok(fields.includes("summariser.everyNTurns"));
    assert.ok(fields.includes("cache.warmInterval"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: rejects missing required sections", () => {
  const dir = mkdtempSync(join(tmpdir(), "thrift-cl-"));
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({ version: "0.1.0" }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map(e => e.field);
    for (const f of ["summariser", "cache", "contextMode", "audit"]) {
      assert.ok(fields.includes(f), `missing field check: ${f}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- threshold-evaluator ----------

test("threshold-evaluator: fires on turns threshold", () => {
  const r = shouldFireSummariser({
    turnsSinceLastSummary: 25,
    tokensSinceLastSummary: 0,
    config: DEFAULTS,
  });
  assert.deepEqual(r, { fire: true, reason: "turns" });
});

test("threshold-evaluator: fires on tokens threshold", () => {
  const r = shouldFireSummariser({
    turnsSinceLastSummary: 0,
    tokensSinceLastSummary: 30000,
    config: DEFAULTS,
  });
  assert.deepEqual(r, { fire: true, reason: "tokens" });
});

test("threshold-evaluator: turns reason wins when both fire", () => {
  // turns check happens first
  const r = shouldFireSummariser({
    turnsSinceLastSummary: 30,
    tokensSinceLastSummary: 40000,
    config: DEFAULTS,
  });
  assert.equal(r.reason, "turns");
});

test("threshold-evaluator: does not fire under threshold", () => {
  const r = shouldFireSummariser({
    turnsSinceLastSummary: 10,
    tokensSinceLastSummary: 5000,
    config: DEFAULTS,
  });
  assert.equal(r.fire, false);
});

test("threshold-evaluator: estimateTokensFromBytes uses 3 bytes/token mixed default", () => {
  assert.equal(estimateTokensFromBytes(3000), 1000);
  assert.equal(estimateTokensFromBytes(3000, "code"), 1200);
  assert.equal(estimateTokensFromBytes(3000, "english"), 750);
});

// ---------- cost-estimator ----------

test("cost-estimator: supports the 3 main models", () => {
  assert.deepEqual(SUPPORTED_MODELS.sort(), [
    "claude-haiku-4-5-20251001",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
  ]);
});

test("cost-estimator: zero usage → zero cost", () => {
  const r = estimate({ tokensInUncached: 0, tokensInCached: 0, tokensOut: 0, model: "claude-sonnet-4-6" });
  assert.equal(r.actualUSD, 0);
  assert.equal(r.baselineUSD, 0);
  assert.equal(r.savedRatio, 0);
});

test("cost-estimator: full uncached run → no savings", () => {
  const r = estimate({ tokensInUncached: 1_000_000, tokensInCached: 0, tokensOut: 100_000, model: "claude-sonnet-4-6" });
  // 1M uncached in × $3 + 100K out × $15 = $3 + $1.5 = $4.5
  assert.equal(r.actualUSD, 4.5);
  assert.equal(r.baselineUSD, 4.5);
  assert.equal(r.savedRatio, 0);
});

test("cost-estimator: cached hits produce savings", () => {
  const r = estimate({ tokensInUncached: 100_000, tokensInCached: 900_000, tokensOut: 100_000, model: "claude-sonnet-4-6" });
  // actual: 100K × $3 + 900K × $0.3 = $0.3 + $0.27 + 100K × $15 = $1.5 + actual_in = $2.07
  // Actually 100K × 3 = $0.30, 900K × 0.30 = $0.27, 100K × 15 = $1.50 → $2.07
  // baseline: 1M × $3 + 100K × $15 = $3.0 + $1.5 = $4.5
  // savedRatio = 1 - 2.07/4.5 = 0.54
  assert.equal(r.actualUSD, 2.07);
  assert.equal(r.baselineUSD, 4.5);
  assert.ok(r.savedRatio > 0.5 && r.savedRatio < 0.6, `savedRatio ${r.savedRatio}`);
});

test("cost-estimator: rejects unknown model", () => {
  assert.throws(
    () => estimate({ tokensInUncached: 1, tokensInCached: 0, tokensOut: 1, model: "claude-fake-5" }),
    /unknown model rate/,
  );
});

test("cost-estimator: estimateSession aggregates per-model", () => {
  const records = [
    { tokensInUncached: 100_000, tokensInCached: 0, tokensOut: 10_000, model: "claude-sonnet-4-6" },
    { tokensInUncached: 50_000, tokensInCached: 50_000, tokensOut: 5_000, model: "claude-sonnet-4-6" },
    { tokensInUncached: 200_000, tokensInCached: 0, tokensOut: 1_000, model: "claude-haiku-4-5-20251001" },
  ];
  const r = estimateSession(records);
  assert.ok(r.actualUSD > 0);
  assert.ok(r.baselineUSD > r.actualUSD); // some savings from cache
  assert.equal(r.perModel["claude-sonnet-4-6"].calls, 2);
  assert.equal(r.perModel["claude-haiku-4-5-20251001"].calls, 1);
});
