import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  load,
  save,
  invalidate,
  list,
  SCHEMA_VERSION,
} from "../../plugins/harness-explore/skills/explore/lib/cache-store.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "explore-cache-"));
}

function sampleMap(sha) {
  return {
    schemaVersion: SCHEMA_VERSION,
    sha,
    generatedAt: "2026-05-18T00:00:00Z",
    root: "/some/repo",
    totalFiles: 3,
    totalLines: 42,
    sizeCategory: "small",
    languages: { ts: 2, md: 1 },
    dirs: [{ dir: "src", fileCount: 3, totalLines: 42, entries: [] }],
    publicEntryPoints: ["src/index.ts"],
  };
}

test("save → load: round-trip preserves map", () => {
  const dir = tmp();
  try {
    const m = sampleMap("abc123");
    const r = save("abc123", m, dir);
    assert.equal(r.ok, true);
    assert.ok(r.bytes > 0);
    assert.ok(existsSync(r.path));
    const loaded = load("abc123", dir);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.map.sha, "abc123");
    assert.equal(loaded.map.totalFiles, 3);
    assert.deepEqual(loaded.map.publicEntryPoints, ["src/index.ts"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("load: missing file → not-found", () => {
  const dir = tmp();
  try {
    const r = load("nonexistent", dir);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-found");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("load: schema-version mismatch → schema-mismatch reason", () => {
  const dir = tmp();
  try {
    mkdirSync(dir, { recursive: true });
    const stale = { ...sampleMap("xyz"), schemaVersion: "0.0.1" };
    writeFileSync(join(dir, "xyz.json"), JSON.stringify(stale));
    const r = load("xyz", dir);
    assert.equal(r.ok, false);
    assert.match(r.reason, /schema-mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("load: malformed JSON → malformed-json reason", () => {
  const dir = tmp();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.json"), "{not valid json");
    const r = load("bad", dir);
    assert.equal(r.ok, false);
    assert.match(r.reason, /malformed-json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalidate: deletes existing cache; returns true", () => {
  const dir = tmp();
  try {
    save("toDelete", sampleMap("toDelete"), dir);
    assert.equal(invalidate("toDelete", dir), true);
    assert.equal(load("toDelete", dir).ok, false);
    // Second invalidate → false (already gone)
    assert.equal(invalidate("toDelete", dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("list: returns sorted SHAs of valid cache files; ignores .tmp", () => {
  const dir = tmp();
  try {
    save("alpha", sampleMap("alpha"), dir);
    save("zulu", sampleMap("zulu"), dir);
    save("mike", sampleMap("mike"), dir);
    // Drop a leftover .tmp — list() should skip it.
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "stale.json.tmp"), "{}");
    const r = list(dir);
    assert.deepEqual(r, ["alpha", "mike", "zulu"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("save: creates cacheDir if missing (atomic write)", () => {
  const root = tmp();
  try {
    const cacheDir = join(root, "nested", "cache");
    const r = save("nested-test", sampleMap("nested-test"), cacheDir);
    assert.equal(r.ok, true);
    assert.ok(existsSync(r.path));
    // No leftover tmp file from a normal save
    const files = readdirSync(cacheDir);
    assert.ok(!files.some((f) => f.endsWith(".tmp")), "no .tmp leftover after successful rename");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
