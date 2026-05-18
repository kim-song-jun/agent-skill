import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readState, writeState } from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/state-rw.mjs";

function mktemp() {
  return mkdtempSync(join(tmpdir(), "cursor-vqa-state-"));
}

test("readState returns {} when slugDir contains no state file", () => {
  const dir = mktemp();
  try {
    assert.deepEqual(readState(dir), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("round-trip: write then read losslessly", () => {
  const dir = mktemp();
  try {
    const state = { slug: "x", phases: [{ phase: 0 }], priorRunDir: null };
    writeState(dir, state);
    assert.deepEqual(readState(dir), state);
    assert.ok(existsSync(resolve(dir, ".visual-qa-state.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("accepts an explicit .json path", () => {
  const dir = mktemp();
  try {
    const p = join(dir, "custom.json");
    writeState(p, { ok: 1 });
    assert.deepEqual(readState(p), { ok: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interrupted .tmp doesn't corrupt canonical state", () => {
  const dir = mktemp();
  try {
    writeState(dir, { phase: 1 });
    const canonical = resolve(dir, ".visual-qa-state.json");
    writeFileSync(`${canonical}.tmp`, "{partial");
    assert.deepEqual(readState(dir), { phase: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readState returns {} on corrupt JSON", () => {
  const dir = mktemp();
  try {
    writeFileSync(resolve(dir, ".visual-qa-state.json"), "not-json");
    assert.deepEqual(readState(dir), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
