import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  storeRepoMemory,
  recallRepoMemory,
  makeFileMirror,
} from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/memory-bridge.mjs";

function freshMirror() {
  return makeFileMirror({ rootDir: mkdtempSync(join(tmpdir(), "vq-memory-")) });
}

test("storeRepoMemory: writes to both when both available", async () => {
  const mirror = freshMirror();
  const r = await storeRepoMemory({
    key: "visual-qa/matrix",
    value: [{ page: "home" }],
    toolCaller: async () => ({}),
    fileMirror: mirror,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, "both");
  assert.ok(existsSync(mirror.pathFor("visual-qa/matrix")));
});

test("recallRepoMemory: file fallback when memory empty", async () => {
  const mirror = freshMirror();
  await storeRepoMemory({ key: "visual-qa/matrix", value: { a: 1 }, fileMirror: mirror });
  const r = await recallRepoMemory({
    key: "visual-qa/matrix",
    toolCaller: async () => null,
    fileMirror: mirror,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, "file");
  assert.deepEqual(r.value, { a: 1 });
});

test("recallRepoMemory: missing both → ok=false", async () => {
  const mirror = freshMirror();
  const r = await recallRepoMemory({ key: "nope", fileMirror: mirror });
  assert.equal(r.ok, false);
});

test("storeRepoMemory: file-only fallback when toolCaller rejects", async () => {
  const mirror = freshMirror();
  const r = await storeRepoMemory({
    key: "k",
    value: "v",
    toolCaller: async () => { throw new Error("eviction"); },
    fileMirror: mirror,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, "file");
});
