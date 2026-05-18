import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readState, writeStateAtomic, mergeState,
} from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/state-rw.mjs";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "vq-state-"));
  return join(dir, ".visual-qa-state.json");
}

test("readState: returns null for missing file", () => {
  assert.equal(readState("/nonexistent/state.json"), null);
});

test("readState: returns null for empty file", () => {
  const p = fresh();
  writeFileSync(p, "");
  assert.equal(readState(p), null);
});

test("readState: throws on bad JSON", () => {
  const p = fresh();
  writeFileSync(p, "not json {");
  assert.throws(() => readState(p), /not valid JSON/);
});

test("writeStateAtomic: writes JSON atomically; readState round-trips", () => {
  const p = fresh();
  writeStateAtomic(p, { slug: "abc", iter: 2 });
  assert.ok(existsSync(p));
  assert.deepEqual(readState(p), { slug: "abc", iter: 2 });
  // Tmp file should not linger.
  assert.equal(existsSync(`${p}.tmp`), false);
});

test("writeStateAtomic: creates parent dir if missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "vq-state-"));
  const deep = join(dir, "subdir/nested/state.json");
  writeStateAtomic(deep, { ok: 1 });
  assert.deepEqual(readState(deep), { ok: 1 });
});

test("mergeState: shallow merge prev + patch", () => {
  const merged = mergeState({ a: 1, b: 2 }, { b: 20, c: 3 });
  assert.deepEqual(merged, { a: 1, b: 20, c: 3 });
});

test("mergeState: returns patch if no prev", () => {
  assert.deepEqual(mergeState(null, { a: 1 }), { a: 1 });
});
