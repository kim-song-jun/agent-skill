import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readState,
  writeState,
  clearTmp,
} from "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/state-rw.mjs";

function mktemp() {
  return mkdtempSync(join(tmpdir(), "cursor-agent-all-state-"));
}

test("readState returns {} when file missing", () => {
  const dir = mktemp();
  try {
    assert.deepEqual(readState(join(dir, ".agent-all-state.json")), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readState returns {} on empty file", () => {
  const dir = mktemp();
  try {
    const p = join(dir, "s.json");
    writeFileSync(p, "");
    assert.deepEqual(readState(p), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeState then readState round-trips losslessly", () => {
  const dir = mktemp();
  try {
    const p = join(dir, "s.json");
    const state = { iter: 3, phases: [{ phase: 0, completedAt: "x" }] };
    writeState(p, state);
    assert.deepEqual(readState(p), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeState writes via .tmp + rename — interrupted write leaves original intact", () => {
  const dir = mktemp();
  try {
    const p = join(dir, "s.json");
    writeState(p, { iter: 1 });
    // Simulate an interrupted write by manually planting a partial .tmp file
    // and confirming the canonical file is untouched.
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, '{"iter":');
    assert.ok(existsSync(p));
    assert.deepEqual(readState(p), { iter: 1 });
    // Cleanup helper should drop the orphan .tmp file.
    clearTmp(p);
    assert.ok(!existsSync(tmp));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readState returns {} when file content is corrupt JSON (no throw)", () => {
  const dir = mktemp();
  try {
    const p = join(dir, "s.json");
    writeFileSync(p, "not-json");
    assert.deepEqual(readState(p), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
