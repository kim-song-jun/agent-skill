import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import {
  freshState,
  readState,
  writeState,
  recordTurn,
  recordSummariser,
  recordCoercion,
  recordCachePrime,
  recordPhase,
  metricsSinceLastSummary,
} from "../../plugins/harness-thrift/skills/thrift/lib/metrics-collector.mjs";
import { buildAuditContext } from "../../plugins/harness-thrift/skills/thrift/lib/audit-renderer.mjs";
import { render } from "../../plugins/harness-builder/skills/agent-init/lib/render.mjs";
import { DEFAULTS } from "../../plugins/harness-thrift/skills/thrift/lib/config-loader.mjs";

// ---------- metrics-collector ----------

test("metrics-collector: freshState has zero counters", () => {
  const s = freshState();
  assert.equal(s.turnCount, 0);
  assert.equal(s.tokensInUncached, 0);
  assert.deepEqual(s.modelCalls, []);
  assert.equal(s.version, "0.1.0");
});

test("metrics-collector: readState returns fresh when file missing", () => {
  const s = readState("/tmp/nonexistent/.thrift-state.json");
  assert.equal(s.turnCount, 0);
});

test("metrics-collector: write + read round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "thrift-state-"));
  const p = join(dir, ".thrift-state.json");
  try {
    const s = freshState();
    s.turnCount = 5;
    writeState(p, s);
    const r = readState(p);
    assert.equal(r.turnCount, 5);
    assert.equal(r.version, "0.1.0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("metrics-collector: corrupt file falls back to fresh + .bak", () => {
  const dir = mkdtempSync(join(tmpdir(), "thrift-state-"));
  const p = join(dir, ".thrift-state.json");
  try {
    writeFileSync(p, "{not json");
    const r = readState(p);
    assert.equal(r.turnCount, 0);
    const dirEntries = readdirSync(dir);
    assert.ok(dirEntries.some(e => e.includes(".bak.")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("metrics-collector: recordTurn accumulates", () => {
  const s = freshState();
  recordTurn(s, { tokensInUncached: 100, tokensInCached: 50, tokensOut: 30, model: "claude-sonnet-4-6" });
  recordTurn(s, { tokensInUncached: 200, tokensInCached: 0, tokensOut: 40, model: "claude-sonnet-4-6" });
  assert.equal(s.turnCount, 2);
  assert.equal(s.tokensInUncached, 300);
  assert.equal(s.tokensInCached, 50);
  assert.equal(s.tokensOut, 70);
  assert.equal(s.modelCalls.length, 2);
});

test("metrics-collector: recordSummariser captures savedRatio", () => {
  const s = freshState();
  recordSummariser(s, { reason: "tokens", tokensBefore: 1000, tokensAfter: 200 });
  assert.equal(s.summarisers.length, 1);
  assert.equal(s.summarisers[0].savedRatio, 0.8);
  assert.equal(s.summarisers[0].reason, "tokens");
});

test("metrics-collector: recordCoercion + recordCachePrime + recordPhase", () => {
  const s = freshState();
  recordCoercion(s, { tool: "Bash", suggestion: "ctx_execute", accepted: true });
  recordCachePrime(s, { cohort: "session", costUSD: 0.001 });
  recordPhase(s, 0);
  assert.equal(s.coercions.length, 1);
  assert.equal(s.cachePrimes.length, 1);
  assert.equal(s.phases.length, 1);
});

test("metrics-collector: metricsSinceLastSummary counts only post-summariser turns", async () => {
  const s = freshState();
  recordTurn(s, { tokensInUncached: 100, tokensInCached: 0, tokensOut: 10, model: "claude-sonnet-4-6" });
  // Small delay to ensure timestamps differ
  await new Promise(r => setTimeout(r, 10));
  recordSummariser(s, { reason: "turns", tokensBefore: 10, tokensAfter: 2 });
  await new Promise(r => setTimeout(r, 10));
  recordTurn(s, { tokensInUncached: 200, tokensInCached: 0, tokensOut: 20, model: "claude-sonnet-4-6" });
  recordTurn(s, { tokensInUncached: 300, tokensInCached: 0, tokensOut: 15, model: "claude-sonnet-4-6" });
  const m = metricsSinceLastSummary(s);
  assert.equal(m.turnsSinceLastSummary, 2);
  assert.equal(m.tokensSinceLastSummary, 35);
});

// ---------- audit-renderer ----------

test("audit-renderer: buildAuditContext for empty session", () => {
  const s = freshState();
  const ctx = buildAuditContext({ state: s, config: DEFAULTS, now: new Date(s.sessionStartedAt) });
  assert.equal(ctx.turnCount, 0);
  assert.equal(ctx.actualUSD, 0);
  assert.equal(ctx.summariserFires, false);
  assert.equal(ctx.coercionFires, false);
  assert.equal(ctx.cachePrimeFires, false);
});

test("audit-renderer: buildAuditContext computes cache hit rate", () => {
  const s = freshState();
  recordTurn(s, { tokensInUncached: 100, tokensInCached: 900, tokensOut: 50, model: "claude-sonnet-4-6" });
  const ctx = buildAuditContext({ state: s, config: DEFAULTS, now: new Date() });
  assert.equal(ctx.cacheHitRate, 90); // 900 / 1000 = 90%
  assert.ok(ctx.savedUSD > 0); // some savings from cache
});

test("audit-renderer: report renders without crash for empty session", () => {
  const s = freshState();
  const ctx = buildAuditContext({ state: s, config: DEFAULTS, now: new Date(s.sessionStartedAt) });
  const tpl = readFileSync(resolve("plugins/harness-thrift/skills/thrift/templates/audit-report.md.hbs"), "utf-8");
  const out = render(tpl, ctx);
  assert.match(out, /# Thrift Audit/);
  assert.match(out, /\*\*Saved\*\* \| \$0/);
  assert.match(out, /none — session shorter/);
});

test("audit-renderer: report renders summariser table when fires present", () => {
  const s = freshState();
  recordTurn(s, { tokensInUncached: 1000, tokensInCached: 0, tokensOut: 100, model: "claude-sonnet-4-6" });
  recordSummariser(s, { reason: "tokens", tokensBefore: 5000, tokensAfter: 500 });
  recordCoercion(s, { tool: "Bash", suggestion: "ctx_execute", accepted: true });
  recordPhase(s, 5);
  const ctx = buildAuditContext({ state: s, config: DEFAULTS, now: new Date() });
  const tpl = readFileSync(resolve("plugins/harness-thrift/skills/thrift/templates/audit-report.md.hbs"), "utf-8");
  const out = render(tpl, ctx);
  assert.ok(out.includes("Summariser activity"));
  assert.match(out, /tokens.*5000.*500/);
  assert.ok(out.includes("Tool coercions"));
  assert.match(out, /Bash.*ctx_execute.*true/);
  assert.match(out, /Phase 5/);
});
