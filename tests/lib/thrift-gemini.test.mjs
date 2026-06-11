// Tests for harness-thrift-gemini lib modules.
//
// Coverage:
//   - config-loader (DEFAULTS, validation, cache.vertex schema)
//   - settings-patcher (BeforeTool/AfterTool/SessionStart, append-only,
//     sentinel revert, flat-shape Gemini hook entries)
//   - cost-estimator (Vertex rate table, storage-time term, min-token gate,
//     unknown-model rejection)
//   - vertex-cache-eval (free-tier short-circuit, min-token gate, payback
//     formula, session/pause gates)

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadConfig,
  DEFAULTS,
} from "../../plugins/harness-thrift-gemini/skills/thrift-gemini/lib/config-loader.mjs";
import {
  patchSettings,
  unpatchSettings,
  buildStandardThriftGeminiHooks,
  GEMINI_HOOK_EVENTS,
} from "../../plugins/harness-thrift-gemini/skills/thrift-gemini/lib/settings-patcher.mjs";
import {
  estimate,
  estimateSession,
  SUPPORTED_MODELS,
  getRate,
} from "../../plugins/harness-thrift-gemini/skills/thrift-gemini/lib/cost-estimator.mjs";
import {
  evaluateVertexCachePrimeROI,
  wouldCreateCacheEntry,
} from "../../plugins/harness-thrift-gemini/skills/thrift-gemini/lib/vertex-cache-eval.mjs";

function tmp(prefix = "thrift-gemini-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ---------- config-loader ----------

test("config-loader: returns DEFAULTS with warning when path missing", () => {
  const r = loadConfig("/tmp/nonexistent-thrift-gemini/.thrift.json");
  assert.equal(r.ok, true);
  assert.equal(r.config.summariser.model, "gemini-flash");
  assert.equal(r.config.cache.vertex.tier, "paid");
  assert.equal(r.config.cache.vertex.minTokenThreshold, 32000);
  assert.equal(r.config.audit.outputPath, ".agent-skill/reports/thrift/audit-<date>.md");
  assert.match(r.warning, /not found/);
});

test("config-loader: parses valid config with cache.vertex block", () => {
  const dir = tmp();
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      cache: {
        ...DEFAULTS.cache,
        vertex: { minTokenThreshold: 16384, storageTimeHours: 2, tier: "free" },
      },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, true);
    assert.equal(r.config.cache.vertex.minTokenThreshold, 16384);
    assert.equal(r.config.cache.vertex.tier, "free");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: rejects missing cache.vertex block", () => {
  const dir = tmp();
  const p = join(dir, ".thrift.json");
  try {
    const noVertex = { ...DEFAULTS, cache: { ...DEFAULTS.cache } };
    delete noVertex.cache.vertex;
    writeFileSync(p, JSON.stringify(noVertex));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map((e) => e.field);
    assert.ok(fields.includes("cache.vertex"), `expected cache.vertex error, got: ${JSON.stringify(fields)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: rejects invalid cache.vertex.tier", () => {
  const dir = tmp();
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      cache: { ...DEFAULTS.cache, vertex: { ...DEFAULTS.cache.vertex, tier: "enterprise" } },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map((e) => e.field);
    assert.ok(fields.includes("cache.vertex.tier"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- settings-patcher ----------

test("settings-patcher: GEMINI_HOOK_EVENTS exports the three Gemini events", () => {
  assert.deepEqual(GEMINI_HOOK_EVENTS.sort(), ["AfterTool", "BeforeTool", "SessionStart"]);
});

test("settings-patcher: patches into empty settings with flat Gemini shape", () => {
  const dir = tmp();
  const sp = join(dir, "settings.json");
  try {
    const hooks = buildStandardThriftGeminiHooks({ hooksDir: ".gemini/hooks" });
    const res = patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    // 2 BeforeTool + 1 AfterTool + 1 SessionStart = 4
    assert.equal(res.applied, 4);
    assert.equal(res.skipped, 0);
    const written = JSON.parse(readFileSync(sp, "utf-8"));
    assert.equal(written.hooks.BeforeTool.length, 2);
    assert.equal(written.hooks.AfterTool.length, 1);
    assert.equal(written.hooks.SessionStart.length, 1);
    // Verify flat shape: {matcher?, command}, not {hooks: [{type, command}]}
    const first = written.hooks.BeforeTool[0];
    assert.equal(typeof first.command, "string");
    assert.match(first.command, /thrift-beforetool-bash-telemetry\.mjs/);
    assert.equal(first.matcher, "run_shell_command");
    // AfterTool entry has no matcher
    assert.equal(written.hooks.AfterTool[0].matcher, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: append-only — preserves existing hooks", () => {
  const dir = tmp();
  const sp = join(dir, "settings.json");
  try {
    writeFileSync(sp, JSON.stringify({
      hooks: {
        BeforeTool: [
          { matcher: "write_file", command: "node user-hook.mjs" },
        ],
      },
    }));
    const hooks = buildStandardThriftGeminiHooks({ hooksDir: ".gemini/hooks" });
    patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    const written = JSON.parse(readFileSync(sp, "utf-8"));
    // User entry preserved first; thrift appended after.
    assert.equal(written.hooks.BeforeTool[0].command, "node user-hook.mjs");
    assert.match(written.hooks.BeforeTool[1].command, /thrift-beforetool-bash-telemetry/);
    assert.equal(written.hooks.BeforeTool.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: idempotent on re-run", () => {
  const dir = tmp();
  const sp = join(dir, "settings.json");
  try {
    const hooks = buildStandardThriftGeminiHooks({ hooksDir: ".gemini/hooks" });
    patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    const res2 = patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    assert.equal(res2.applied, 0);
    assert.equal(res2.skipped, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: dry-run does not write", () => {
  const dir = tmp();
  const sp = join(dir, "settings.json");
  try {
    const hooks = buildStandardThriftGeminiHooks({ hooksDir: ".gemini/hooks" });
    const res = patchSettings({ settingsPath: sp, hooksToAdd: hooks, dryRun: true });
    assert.equal(res.applied, 4);
    assert.ok(!existsSync(sp), "should not have written file in dry-run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: refuses to touch unparseable settings", () => {
  const dir = tmp();
  const sp = join(dir, "settings.json");
  try {
    writeFileSync(sp, "{ this isn't json ");
    const hooks = buildStandardThriftGeminiHooks({ hooksDir: ".gemini/hooks" });
    assert.throws(
      () => patchSettings({ settingsPath: sp, hooksToAdd: hooks }),
      /cannot parse/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: unpatch removes only thrift entries (preserves user hook)", () => {
  const dir = tmp();
  const sp = join(dir, "settings.json");
  try {
    writeFileSync(sp, JSON.stringify({
      hooks: {
        BeforeTool: [
          { matcher: "write_file", command: "node user-hook.mjs" },
        ],
      },
    }));
    const hooks = buildStandardThriftGeminiHooks({ hooksDir: ".gemini/hooks" });
    patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    const before = JSON.parse(readFileSync(sp, "utf-8"));
    assert.equal(before.hooks.BeforeTool.length, 3);
    const res = unpatchSettings({ settingsPath: sp });
    assert.equal(res.removed, 4);
    const after = JSON.parse(readFileSync(sp, "utf-8"));
    assert.equal(after.hooks.BeforeTool.length, 1);
    assert.match(after.hooks.BeforeTool[0].command, /user-hook/);
    // Empty event arrays cleaned up
    assert.equal(after.hooks.AfterTool, undefined);
    assert.equal(after.hooks.SessionStart, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: buildStandardThriftGeminiHooks encodes hooksDir", () => {
  const h = buildStandardThriftGeminiHooks({ hooksDir: "/abs/path/.gemini/hooks" });
  for (const entries of Object.values(h)) {
    for (const entry of entries) {
      assert.match(entry.command, /\/abs\/path\/\.gemini\/hooks\/thrift-/);
    }
  }
});

// ---------- cost-estimator ----------

test("cost-estimator: supports Gemini family models", () => {
  assert.deepEqual(SUPPORTED_MODELS.sort(), [
    "gemini-flash",
    "gemini-flash-lite",
    "gemini-pro",
  ]);
});

test("cost-estimator: zero usage → zero cost", () => {
  const r = estimate({ tokensInUncached: 0, tokensInCached: 0, tokensOut: 0, model: "gemini-pro" });
  assert.equal(r.actualUSD, 0);
  assert.equal(r.baselineUSD, 0);
  assert.equal(r.savedRatio, 0);
});

test("cost-estimator: full uncached run → no savings", () => {
  const r = estimate({ tokensInUncached: 1_000_000, tokensInCached: 0, tokensOut: 100_000, model: "gemini-pro" });
  // 1M uncached in × $1.25 + 100K out × $5.0 = $1.25 + $0.5 = $1.75
  assert.equal(r.actualUSD, 1.75);
  assert.equal(r.baselineUSD, 1.75);
  assert.equal(r.savedRatio, 0);
});

test("cost-estimator: cached hits produce savings (above min-token threshold)", () => {
  // gemini-pro minTokenThreshold = 32000; pass tokensInCached well above.
  const r = estimate({
    tokensInUncached: 100_000,
    tokensInCached: 900_000,
    tokensOut: 100_000,
    model: "gemini-pro",
  });
  // actualIn uncached: 100K × $1.25 = $0.125
  // actualIn cached: 900K × $0.3125 = $0.28125
  // actualOut: 100K × $5.0 = $0.5
  // actual = 0.125 + 0.28125 + 0.5 = $0.90625
  // baseline: 1M × $1.25 + 100K × $5 = $1.25 + $0.5 = $1.75
  assert.equal(r.actualUSD, 0.90625);
  assert.equal(r.baselineUSD, 1.75);
  assert.ok(r.savedRatio > 0.4 && r.savedRatio < 0.6, `savedRatio ${r.savedRatio}`);
  assert.equal(r.degradedBelowMinTokens, false);
});

test("cost-estimator: storage-time term added to actual cost", () => {
  const r = estimate({
    tokensInUncached: 0,
    tokensInCached: 1_000_000,
    tokensOut: 0,
    model: "gemini-pro",
    storageHours: 2,
  });
  // cached: 1M × $0.3125 = $0.3125
  // storage: 1M × $4.50 × 2 = $9.0
  // actual = 0.3125 + 9.0 = $9.3125
  assert.equal(r.actualUSD, 9.3125);
  assert.equal(r.breakdown.storage, 9);
});

test("cost-estimator: min-token gate downgrades sub-threshold cached tokens", () => {
  // Below the 32k threshold for gemini-pro
  const r = estimate({
    tokensInUncached: 0,
    tokensInCached: 1_000,
    tokensOut: 0,
    model: "gemini-pro",
  });
  // gate fires: tokensInCached reclassified to uncached
  assert.equal(r.degradedBelowMinTokens, true);
  // actual = 1000 × $1.25 / 1M = $0.00125 (paid uncached rate)
  assert.equal(r.actualUSD, 0.00125);
});

test("cost-estimator: min-token gate can be bypassed via applyMinTokenGate=false", () => {
  const r = estimate({
    tokensInUncached: 0,
    tokensInCached: 1_000,
    tokensOut: 0,
    model: "gemini-pro",
    applyMinTokenGate: false,
  });
  assert.equal(r.degradedBelowMinTokens, false);
});

test("cost-estimator: rejects unknown model", () => {
  assert.throws(
    () => estimate({ tokensInUncached: 1, tokensInCached: 0, tokensOut: 1, model: "gpt-5" }),
    /unknown model rate/,
  );
});

test("cost-estimator: estimateSession aggregates per-model with storage", () => {
  const records = [
    { tokensInUncached: 100_000, tokensInCached: 0, tokensOut: 10_000, model: "gemini-pro" },
    { tokensInUncached: 50_000, tokensInCached: 50_000, tokensOut: 5_000, model: "gemini-pro" },
    { tokensInUncached: 200_000, tokensInCached: 0, tokensOut: 1_000, model: "gemini-flash" },
  ];
  const r = estimateSession(records);
  assert.ok(r.actualUSD > 0);
  assert.equal(r.perModel["gemini-pro"].calls, 2);
  assert.equal(r.perModel["gemini-flash"].calls, 1);
  assert.ok("storageUSD" in r);
});

test("cost-estimator: getRate exposes per-model rate fields", () => {
  const r = getRate("gemini-pro");
  assert.ok(r.in > 0);
  assert.ok(r.cacheRead > 0);
  assert.ok(r.cacheWrite > 0);
  assert.ok(r.storagePerHour > 0);
  assert.ok(r.minTokenThreshold > 0);
});

// ---------- vertex-cache-eval ----------

test("vertex-cache-eval: free-tier short-circuits", () => {
  const config = { cache: { vertex: { tier: "free", minTokenThreshold: 32000, storageTimeHours: 1 } } };
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 120,
    expectedPausesOver5Min: 10,
    accumulatedTokens: 100_000,
    expectedCacheHits: 50,
    config,
  });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /free-tier/);
});

test("vertex-cache-eval: below min-token threshold → not worth it", () => {
  const config = { cache: { vertex: { tier: "paid", minTokenThreshold: 32000, storageTimeHours: 1 } } };
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 60,
    expectedPausesOver5Min: 5,
    accumulatedTokens: 1_000,
    expectedCacheHits: 50,
    config,
  });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /min-tokens/);
});

test("vertex-cache-eval: short session → not worth it", () => {
  const config = { cache: { vertex: { tier: "paid", minTokenThreshold: 32000, storageTimeHours: 1 } } };
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 5,
    expectedPausesOver5Min: 5,
    accumulatedTokens: 100_000,
    expectedCacheHits: 50,
    config,
  });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /short-session/);
});

test("vertex-cache-eval: no pauses → not worth it", () => {
  const config = { cache: { vertex: { tier: "paid", minTokenThreshold: 32000, storageTimeHours: 1 } } };
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 60,
    expectedPausesOver5Min: 0,
    accumulatedTokens: 100_000,
    expectedCacheHits: 50,
    config,
  });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /no-pauses/);
});

test("vertex-cache-eval: storage-payback-too-long → not worth it", () => {
  // Inflate storageTimeHours so the up-front cost dominates expected savings.
  const config = { cache: { vertex: { tier: "paid", minTokenThreshold: 32000, storageTimeHours: 240 } } };
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 60,
    expectedPausesOver5Min: 5,
    accumulatedTokens: 100_000,
    expectedCacheHits: 1, // only 1 expected hit
    config,
  });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /storage-payback-too-long/);
  assert.ok(r.paybackHits > 1, `paybackHits should be > 1, got ${r.paybackHits}`);
});

test("vertex-cache-eval: paid + above min + long session + pauses + cache hits → worth it", () => {
  const config = { cache: { vertex: { tier: "paid", minTokenThreshold: 32000, storageTimeHours: 1 } } };
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 120,
    expectedPausesOver5Min: 10,
    accumulatedTokens: 100_000,
    expectedCacheHits: 100,
    config,
  });
  assert.equal(r.worthIt, true);
  assert.match(r.reason, /payback achievable/);
});

test("vertex-cache-eval: refuses to evaluate without config.cache.vertex", () => {
  const r = evaluateVertexCachePrimeROI({
    sessionMinutes: 60,
    expectedPausesOver5Min: 5,
    accumulatedTokens: 100_000,
    expectedCacheHits: 50,
    config: { cache: {} },
  });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /vertex missing/);
});

test("vertex-cache-eval: wouldCreateCacheEntry returns true above threshold", () => {
  const config = { cache: { vertex: { minTokenThreshold: 32000 } } };
  assert.equal(wouldCreateCacheEntry({ tokensInPrefix: 50_000, config }), true);
  assert.equal(wouldCreateCacheEntry({ tokensInPrefix: 1_000, config }), false);
  // Missing config → false (safe default)
  assert.equal(wouldCreateCacheEntry({ tokensInPrefix: 50_000, config: {} }), false);
});
