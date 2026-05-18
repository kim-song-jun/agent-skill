import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeCohortKey,
  schedulePrime,
  evaluateCachePrimeROI,
} from "../../plugins/harness-thrift/skills/thrift/lib/cache-prime.mjs";
import { DEFAULTS } from "../../plugins/harness-thrift/skills/thrift/lib/config-loader.mjs";

// ---------- computeCohortKey ----------

test("computeCohortKey: session-only by default", () => {
  const key = computeCohortKey({ config: DEFAULTS });
  assert.equal(key, "session");
});

test("computeCohortKey: branch only", () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, shareCohortAcross: ["branch"] } };
  const key = computeCohortKey({ config, branchProvider: () => "feature/foo" });
  assert.equal(key, "branch:feature/foo");
});

test("computeCohortKey: session + branch", () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, shareCohortAcross: ["session", "branch"] } };
  const key = computeCohortKey({ config, branchProvider: () => "main" });
  assert.equal(key, "session|branch:main");
});

test("computeCohortKey: empty array → 'default'", () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, shareCohortAcross: [] } };
  const key = computeCohortKey({ config, branchProvider: () => "main" });
  assert.equal(key, "default");
});

// ---------- evaluateCachePrimeROI ----------

test("evaluateCachePrimeROI: short session → not worth it", () => {
  const r = evaluateCachePrimeROI({ sessionMinutes: 10, expectedPausesOver5Min: 5 });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /short/);
});

test("evaluateCachePrimeROI: no pauses → not worth it", () => {
  const r = evaluateCachePrimeROI({ sessionMinutes: 60, expectedPausesOver5Min: 0 });
  assert.equal(r.worthIt, false);
  assert.match(r.reason, /no expected long pauses/);
});

test("evaluateCachePrimeROI: long session + pauses → worth it", () => {
  const r = evaluateCachePrimeROI({ sessionMinutes: 60, expectedPausesOver5Min: 5 });
  assert.equal(r.worthIt, true);
  assert.match(r.reason, /amortizes/);
});

// ---------- schedulePrime ----------

test("schedulePrime: disabled config → no-op handle", () => {
  const r = schedulePrime({ config: DEFAULTS, primeFn: async () => ({}) });
  assert.equal(r.disabled, true);
  assert.equal(r.nextFireAt, null);
});

test("schedulePrime: requires primeFn when enabled", () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, enabled: true } };
  assert.throws(() => schedulePrime({ config }), /primeFn required/);
});

test("schedulePrime: enabled — schedules first fire at intervalMs", async () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, enabled: true } };
  let fired = 0;
  const handle = schedulePrime({
    config,
    primeFn: async () => { fired += 1; return { costUSD: 0.001, ok: true }; },
    intervalMs: 50,
    branchProvider: () => "main",
  });
  await new Promise((r) => setTimeout(r, 120));
  handle.cancel();
  assert.ok(fired >= 1, `expected at least 1 fire, got ${fired}`);
  assert.equal(handle.cohortKey, "session");
});

test("schedulePrime: immediateFirstPrime fires synchronously", async () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, enabled: true } };
  let fired = 0;
  const handle = schedulePrime({
    config,
    primeFn: async () => { fired += 1; return {}; },
    intervalMs: 1000,
    immediateFirstPrime: true,
  });
  // Synchronous + microtask drain
  await new Promise((r) => setImmediate(r));
  handle.cancel();
  assert.equal(fired, 1);
});

test("schedulePrime: cancel stops further fires", async () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, enabled: true } };
  let fired = 0;
  const handle = schedulePrime({
    config,
    primeFn: async () => { fired += 1; return {}; },
    intervalMs: 50,
  });
  await new Promise((r) => setTimeout(r, 70));
  handle.cancel();
  const after = fired;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(fired, after, "no fires after cancel");
});

test("schedulePrime: errored primeFn does not stop the schedule", async () => {
  const config = { ...DEFAULTS, cache: { ...DEFAULTS.cache, enabled: true } };
  let fired = 0;
  const handle = schedulePrime({
    config,
    primeFn: async () => { fired += 1; throw new Error("network down"); },
    intervalMs: 30,
  });
  await new Promise((r) => setTimeout(r, 100));
  handle.cancel();
  assert.ok(fired >= 2, "schedule continues despite primeFn errors");
});
