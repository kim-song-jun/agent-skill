import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve("scripts/sync-lib.mjs");

test("sync-lib --check confirms vendored copies match source", () => {
  const out = execFileSync("node", [SCRIPT, "--check"], { stdio: "pipe", encoding: "utf-8" });
  // Assert the real success shape, not just the substring "OK" (which also
  // appears in "drift detected ... run: ..." guidance). Require the explicit
  // "OK — <N> vendored files match source." line with N > 0, and no drift.
  const m = out.match(/OK\s+—\s+(\d+)\s+vendored files match source/);
  assert.ok(m, `expected the explicit OK-with-count line, got: ${out}`);
  assert.ok(Number(m[1]) > 0, `vendored file count must be > 0, got ${m[1]}`);
  assert.doesNotMatch(out, /drift detected/i, `unexpected drift: ${out}`);
});
