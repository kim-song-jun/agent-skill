import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve("scripts/sync-lib.mjs");

test("sync-lib --check confirms vendored copies match source", () => {
  const out = execFileSync("node", [SCRIPT, "--check"], { stdio: "pipe", encoding: "utf-8" });
  assert.ok(out.includes("OK"), `expected OK, got: ${out}`);
});
