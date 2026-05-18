// Tests for the tmp-gc lib (agent-all-gemini and visual-qa-gemini).
//
// We exercise the real GC under safe roots by setting mtime on test
// fixtures via utimesSync. We do NOT operate on the live /tmp/agent-all
// or /tmp/visual-qa roots — the lib refuses paths outside the safe-root
// allowlist, which we verify in the safety test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
  utimesSync, existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const AGENT_ALL_GC = "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/tmp-gc.mjs";
const VISUAL_QA_GC = "plugins/harness-floor-gemini/skills/visual-qa-gemini/lib/tmp-gc.mjs";

// Use the *real* safe root for behavioural tests; create a uniquely-named
// subdir so test runs don't collide with each other or with live runs.
function makeSafeSubdir(rootName, prefix) {
  const base = `/tmp/${rootName}`;
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, prefix));
  return dir;
}

test("vendored copies of tmp-gc match byte-for-byte", () => {
  const a = readFileSync(resolve(AGENT_ALL_GC), "utf-8");
  const b = readFileSync(resolve(VISUAL_QA_GC), "utf-8");
  assert.equal(a, b, "agent-all-gemini and visual-qa-gemini copies of tmp-gc diverged");
});

test("__internal.isSafeRoot accepts safe roots, rejects others", async () => {
  const { __internal } = await import(`../../${AGENT_ALL_GC}`);
  assert.equal(__internal.isSafeRoot("/tmp/agent-all"), true);
  assert.equal(__internal.isSafeRoot("/tmp/agent-all/wave-1"), true);
  assert.equal(__internal.isSafeRoot("/tmp/visual-qa"), true);
  assert.equal(__internal.isSafeRoot("/tmp/visual-qa/page-foo"), true);

  assert.equal(__internal.isSafeRoot("/"), false);
  assert.equal(__internal.isSafeRoot("/tmp"), false);
  assert.equal(__internal.isSafeRoot("/home/user"), false);
  assert.equal(__internal.isSafeRoot("/etc"), false);
});

test("gcTmp refuses to operate outside the safe root allowlist", async () => {
  const { gcTmp } = await import(`../../${AGENT_ALL_GC}`);
  const r = gcTmp("/tmp", 1000, { dryRun: true });
  assert.deepEqual(r.removed, []);
  assert.ok(r.errors.length > 0);
  assert.match(r.errors[0].message, /outside safe roots/);
});

test("gcTmp removes old subdirs, preserves recent ones", async () => {
  const { gcTmp } = await import(`../../${AGENT_ALL_GC}`);
  const safe = makeSafeSubdir("agent-all", "gc-test-");
  try {
    const oldDir = join(safe, "wave-old");
    const newDir = join(safe, "wave-new");
    mkdirSync(oldDir);
    mkdirSync(newDir);
    writeFileSync(join(oldDir, "task-1.json"), "{}");
    writeFileSync(join(newDir, "task-2.json"), "{}");
    // Backdate oldDir by 2 hours.
    const past = new Date(Date.now() - 2 * 3600 * 1000);
    utimesSync(oldDir, past, past);

    const r = gcTmp(safe, 60 * 60 * 1000); // 1h threshold
    assert.equal(r.removed.length, 1);
    assert.ok(r.removed[0].endsWith("wave-old"));
    assert.equal(r.kept.length, 1);
    assert.ok(r.kept[0].endsWith("wave-new"));
    assert.equal(existsSync(oldDir), false);
    assert.equal(existsSync(newDir), true);
  } finally {
    rmSync(safe, { recursive: true, force: true });
  }
});

test("gcTmp dry-run reports without deleting", async () => {
  const { gcTmp } = await import(`../../${AGENT_ALL_GC}`);
  const safe = makeSafeSubdir("visual-qa", "gc-dryrun-");
  try {
    const oldDir = join(safe, "page-old");
    mkdirSync(oldDir);
    writeFileSync(join(oldDir, "r.json"), "{}");
    const past = new Date(Date.now() - 2 * 3600 * 1000);
    utimesSync(oldDir, past, past);

    const r = gcTmp(safe, 60 * 60 * 1000, { dryRun: true });
    assert.equal(r.removed.length, 1);
    assert.equal(existsSync(oldDir), true, "dry-run should NOT delete");
  } finally {
    rmSync(safe, { recursive: true, force: true });
  }
});

test("gcTmp no-ops when root does not exist", async () => {
  const { gcTmp } = await import(`../../${AGENT_ALL_GC}`);
  const r = gcTmp("/tmp/agent-all/doesnt-exist-" + Date.now(), 1000);
  assert.deepEqual(r.removed, []);
  assert.deepEqual(r.kept, []);
  assert.deepEqual(r.errors, []);
});

test("CLI: tmp-gc.mjs --root <safe> --dry-run exits 0 with JSON report", async () => {
  const safe = makeSafeSubdir("agent-all", "gc-cli-");
  try {
    const res = spawnSync("node", [resolve(AGENT_ALL_GC), "--root", safe, "--dry-run"], { encoding: "utf-8" });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.ok(Array.isArray(out.removed));
    assert.ok(Array.isArray(out.kept));
    assert.ok(Array.isArray(out.errors));
  } finally {
    rmSync(safe, { recursive: true, force: true });
  }
});

test("CLI: tmp-gc.mjs without --root exits 2 with usage error", () => {
  const res = spawnSync("node", [resolve(AGENT_ALL_GC)], { encoding: "utf-8" });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Usage/);
});

test("CLI: tmp-gc.mjs against unsafe root exits 1 with error report", () => {
  const res = spawnSync("node", [resolve(AGENT_ALL_GC), "--root", "/etc", "--dry-run"], { encoding: "utf-8" });
  assert.equal(res.status, 1);
  const out = JSON.parse(res.stdout);
  assert.ok(out.errors.length > 0);
});

test("ensureTmpDir creates dir under safe root", async () => {
  const { ensureTmpDir } = await import(`../../${AGENT_ALL_GC}`);
  const safe = `/tmp/agent-all/ensure-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const p = ensureTmpDir(safe);
    assert.equal(p, safe);
    assert.equal(existsSync(safe), true);
  } finally {
    rmSync(safe, { recursive: true, force: true });
  }
});

test("ensureTmpDir refuses unsafe paths", async () => {
  const { ensureTmpDir } = await import(`../../${AGENT_ALL_GC}`);
  assert.throws(() => ensureTmpDir("/tmp/whatever"), /outside safe roots/);
});
