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

// --- route: honors the WIKI_DIR env var (v0.7.3 fix for the dir-arg defect) ---
// `route` has no positional [dir] slot (its args are the multi-word query), so the
// wiki root must come from WIKI_DIR env. Before the fix, route hardcoded the ".wiki"
// default and silently ignored any directory, making it impossible to route against
// a non-cwd wiki. cwd is forced to /tmp here so a pass can ONLY come from WIKI_DIR.
test("wiki CLI route honors WIKI_DIR env and matches an exact slug (exit 0)", () => {
  const r = runCli(["route", "auth-flow"], {
    cwd: "/tmp",
    env: { ...process.env, WIKI_DIR: resolve(FIXTURES, "complete") },
  });
  assert.equal(r.status, 0, `expected exit 0 (match), got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /"slug":"auth-flow"/, `stdout must carry the matched page: ${r.stdout}`);
});

test("wiki CLI route honors WIKI_DIR env: a non-matching query exits 1 with match:null", () => {
  const r = runCli(["route", "zzz-no-such-page"], {
    cwd: "/tmp",
    env: { ...process.env, WIKI_DIR: resolve(FIXTURES, "complete") },
  });
  assert.equal(r.status, 1, `expected exit 1 (no match), got ${r.status}; stdout: ${r.stdout}`);
  assert.match(r.stdout, /"match":null/, `stdout must report match:null: ${r.stdout}`);
});

test("wiki CLI route without WIKI_DIR and no .wiki in cwd does not crash (exit 1, no match)", () => {
  const r = runCli(["route", "auth-flow"], {
    cwd: "/tmp",
    env: { ...process.env, WIKI_DIR: "" },
  });
  assert.equal(r.status, 1, `expected exit 1 (no .wiki, no match), got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /"match":null/, `stdout must report match:null: ${r.stdout}`);
});

test("wiki CLI route with no query exits 2 (usage)", () => {
  const r = runCli(["route"]);
  assert.equal(r.status, 2, `expected exit 2 (usage), got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stderr, /usage:/i, `stderr must show usage: ${r.stderr}`);
});
