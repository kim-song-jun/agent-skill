/**
 * DEFECT G3 — Real-process tests for the wiki-index.mjs CLI.
 * Runs via child_process.spawnSync against the real fixtures.
 * If the import.meta.main guard or exit codes are wrong, spawnSync().status mismatches.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const WIKI_INDEX = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  "../../plugins/harness-floor/skills/wiki/lib/wiki-index.mjs",
);

const FIXTURES = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  "../fixtures/wiki",
);

function runCli(args, opts = {}) {
  return spawnSync("node", [WIKI_INDEX, ...args], {
    encoding: "utf-8",
    timeout: 10000,
    ...opts,
  });
}

// --- compile: complete fixture ---
test("wiki CLI compile on complete fixture exits 0 and reports diff=0", () => {
  const r = runCli(["compile", resolve(FIXTURES, "complete")]);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /diff=0/, `expected diff=0 in stdout: ${r.stdout}`);
});

// --- compile: missing-page fixture (index entry present but file missing) ---
test("wiki CLI compile on missing-page fixture exits 1 and reports Index-only", () => {
  const r = runCli(["compile", resolve(FIXTURES, "missing-page")]);
  assert.equal(r.status, 1, `expected exit 1 (drift), got ${r.status}; stdout: ${r.stdout}`);
  assert.match(r.stderr, /Index-only/i, `stderr must mention Index-only: ${r.stderr}`);
  assert.match(r.stderr, /missing\.md/, `stderr must name the missing file: ${r.stderr}`);
});

// --- compile: missing-index-entry fixture (page on disk but not indexed) ---
test("wiki CLI compile on missing-index-entry fixture exits 1 and reports Pages-only", () => {
  const r = runCli(["compile", resolve(FIXTURES, "missing-index-entry")]);
  assert.equal(r.status, 1, `expected exit 1 (drift), got ${r.status}; stdout: ${r.stdout}`);
  assert.match(r.stderr, /Pages-only/i, `stderr must mention Pages-only: ${r.stderr}`);
  assert.match(r.stderr, /orphan-page\.md/, `stderr must name the orphan page: ${r.stderr}`);
});

// --- list: complete fixture ---
test("wiki CLI list on complete fixture exits 0 and prints auth-flow", () => {
  const r = runCli(["list", resolve(FIXTURES, "complete")]);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /auth-flow/, `stdout must contain auth-flow slug: ${r.stdout}`);
});

// --- status: complete fixture ---
test("wiki CLI status on complete fixture exits 0 and drift=0", () => {
  const r = runCli(["status", resolve(FIXTURES, "complete")]);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /drift=0/, `stdout must include drift=0: ${r.stdout}`);
});

// --- unknown command exits 2 ---
test("wiki CLI unknown command exits 2", () => {
  const r = runCli(["frobnitz"]);
  assert.equal(r.status, 2, `expected exit 2 for unknown command, got ${r.status}`);
});
