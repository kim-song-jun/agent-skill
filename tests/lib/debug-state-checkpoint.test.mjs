import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadState,
  saveState,
  skeleton,
  computeTreeHash,
  pushCheckpoint,
  restoreTo,
  summariseForResume,
  STATE_VERSION,
} from "../../plugins/harness-debug/skills/debug/lib/state-checkpoint.mjs";

// ---------- skeleton / round-trip ----------

test("state-checkpoint: skeleton has version and empty arrays", () => {
  const s = skeleton({ command: "pytest -x", description: "login broken" });
  assert.equal(s.version, STATE_VERSION);
  assert.equal(s.failure.command, "pytest -x");
  assert.equal(s.failure.description, "login broken");
  assert.deepEqual(s.hypotheses, []);
  assert.deepEqual(s.checkpoints, []);
  assert.equal(s.resolution, null);
});

test("state-checkpoint: saveState then loadState round-trips", () => {
  const dir = mkdtempSync(join(tmpdir(), "debug-sc-"));
  const p = join(dir, ".debug-state.json");
  try {
    const s = skeleton({ command: "make test" });
    s.hypotheses.push({ id: 1, text: "race condition", status: "untested" });
    saveState(p, s);
    assert.ok(existsSync(p));
    const r = loadState(p);
    assert.equal(r.ok, true);
    assert.equal(r.state.failure.command, "make test");
    assert.equal(r.state.hypotheses[0].text, "race condition");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("state-checkpoint: loadState returns skeleton when path missing", () => {
  const r = loadState("/tmp/nonexistent/.debug-state.json");
  assert.equal(r.ok, true);
  assert.equal(r.state.version, STATE_VERSION);
  assert.match(r.warning, /not found/);
});

test("state-checkpoint: loadState rejects invalid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "debug-sc-"));
  const p = join(dir, ".debug-state.json");
  try {
    writeFileSync(p, "not valid json");
    const r = loadState(p);
    assert.equal(r.ok, false);
    assert.equal(r.errors[0].field, "(parse)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("state-checkpoint: loadState validates required fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "debug-sc-"));
  const p = join(dir, ".debug-state.json");
  try {
    writeFileSync(p, JSON.stringify({ version: "0.1.0" }));
    const r = loadState(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map((e) => e.field);
    assert.ok(fields.includes("createdAt"));
    assert.ok(fields.includes("failure"));
    assert.ok(fields.includes("hypotheses"));
    assert.ok(fields.includes("checkpoints"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- computeTreeHash + pushCheckpoint with stubbed spawn ----------

function makeSpawnStub({ files, perFileHash }) {
  return (_bin, args) => {
    if (args[0] === "ls-files" && args[1] === "-z") {
      const buf = Buffer.from(files.join("\0") + (files.length ? "\0" : ""));
      return { status: 0, stdout: buf, stderr: Buffer.from("") };
    }
    if (args[0] === "hash-object") {
      const chunk = args.slice(2);
      const out = chunk.map((f) => perFileHash[f] ?? "deadbeef".repeat(5)).join("\n") + "\n";
      return { status: 0, stdout: out, stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "stub: unknown command" };
  };
}

test("state-checkpoint: computeTreeHash is deterministic for identical inputs", () => {
  const spawn = makeSpawnStub({
    files: ["a.js", "b.js"],
    perFileHash: { "a.js": "1111111111111111111111111111111111111111", "b.js": "2222222222222222222222222222222222222222" },
  });
  const h1 = computeTreeHash({ spawnSync: spawn });
  const h2 = computeTreeHash({ spawnSync: spawn });
  assert.equal(h1, h2);
  assert.match(h1, /^sha256:[0-9a-f]{64}$/);
});

test("state-checkpoint: computeTreeHash changes when file content changes", () => {
  const spawnA = makeSpawnStub({
    files: ["a.js"],
    perFileHash: { "a.js": "1111111111111111111111111111111111111111" },
  });
  const spawnB = makeSpawnStub({
    files: ["a.js"],
    perFileHash: { "a.js": "9999999999999999999999999999999999999999" },
  });
  const hA = computeTreeHash({ spawnSync: spawnA });
  const hB = computeTreeHash({ spawnSync: spawnB });
  assert.notEqual(hA, hB);
});

test("state-checkpoint: pushCheckpoint appends with hash + actions", () => {
  const state = skeleton({ command: "x" });
  const spawn = makeSpawnStub({
    files: ["a.js"],
    perFileHash: { "a.js": "aa".repeat(20) },
  });
  pushCheckpoint(state, {
    phase: 1,
    actionsTaken: ["ran command", "parsed error"],
    spawnSync: spawn,
  });
  assert.equal(state.checkpoints.length, 1);
  assert.equal(state.checkpoints[0].phase, 1);
  assert.match(state.checkpoints[0].stateHashBefore, /^sha256:/);
  assert.deepEqual(state.checkpoints[0].actionsTaken, ["ran command", "parsed error"]);
});

test("state-checkpoint: restoreTo reports matched=true when hash unchanged", () => {
  const spawn = makeSpawnStub({
    files: ["a.js"],
    perFileHash: { "a.js": "ab".repeat(20) },
  });
  const state = skeleton({ command: "x" });
  const h = computeTreeHash({ spawnSync: spawn });
  const r = restoreTo(state, h, { spawnSync: spawn });
  assert.equal(r.ok, true);
  assert.equal(r.matched, true);
});

test("state-checkpoint: restoreTo reports matched=false on hash divergence", () => {
  const spawn = makeSpawnStub({
    files: ["a.js"],
    perFileHash: { "a.js": "ab".repeat(20) },
  });
  const state = skeleton({ command: "x" });
  const r = restoreTo(state, "sha256:" + "0".repeat(64), { spawnSync: spawn });
  assert.equal(r.ok, true);
  assert.equal(r.matched, false);
  assert.match(r.reason, /working tree differs/);
});

test("state-checkpoint: summariseForResume returns digest under 500 chars", () => {
  const state = skeleton({ command: "pytest -x", description: "login broken" });
  state.hypotheses.push({ id: 1, text: "race", status: "rejected" });
  state.hypotheses.push({ id: 2, text: "cache", status: "untested" });
  state.currentCandidate = 2;
  const summary = summariseForResume(state);
  assert.match(summary, /failure: login broken/);
  assert.match(summary, /command: pytest -x/);
  assert.match(summary, /hypotheses: 2 total \/ 1 tested/);
  assert.ok(summary.length < 500);
});

test("state-checkpoint: saveState atomic write does not leave tmp files on success", () => {
  const dir = mkdtempSync(join(tmpdir(), "debug-sc-"));
  const p = join(dir, ".debug-state.json");
  try {
    saveState(p, skeleton({ command: "x" }));
    const entries = readdirSync(dir);
    assert.equal(entries.length, 1, "only final file should remain");
    assert.equal(entries[0], ".debug-state.json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
