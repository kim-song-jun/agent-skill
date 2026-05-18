import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  storeRepoMemory,
  recallRepoMemory,
  makeFileMirror,
  bridgeToFile,
  __internal,
} from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";

function freshMirror() {
  return makeFileMirror({ rootDir: mkdtempSync(join(tmpdir(), "memory-bridge-")) });
}

test("safeKey: sanitises slashes and special chars", () => {
  assert.equal(__internal.safeKey("agent-all/plan"), "agent-all_plan");
  assert.equal(__internal.safeKey("ok.name-1_2"), "ok.name-1_2");
});

test("storeRepoMemory: writes to both memory and file when both succeed", async () => {
  const mirror = freshMirror();
  const calls = [];
  const toolCaller = async ({ name, args }) => { calls.push({ name, args }); return { ok: true }; };
  const r = await storeRepoMemory({
    key: "agent-all/plan",
    value: { foo: 1 },
    toolCaller,
    fileMirror: mirror,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, "both");
  assert.equal(calls[0].name, __internal.STORE_TOOL);
  assert.equal(calls[0].args.scope, __internal.SCOPE);
  assert.equal(calls[0].args.key, "agent-all/plan");
  // file mirror written
  assert.ok(existsSync(mirror.pathFor("agent-all/plan")));
  assert.deepEqual(JSON.parse(readFileSync(mirror.pathFor("agent-all/plan"), "utf-8")), { foo: 1 });
});

test("storeRepoMemory: falls back to file when toolCaller throws", async () => {
  const mirror = freshMirror();
  const toolCaller = async () => { throw new Error("quota exceeded"); };
  const r = await storeRepoMemory({
    key: "k1",
    value: "hello",
    toolCaller,
    fileMirror: mirror,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, "file");
  assert.match(r.warning, /quota/);
});

test("storeRepoMemory: returns error when both fail", async () => {
  const toolCaller = async () => { throw new Error("mem fail"); };
  const r = await storeRepoMemory({ key: "k", value: "v", toolCaller });
  assert.equal(r.ok, false);
  assert.equal(r.source, null);
});

test("recallRepoMemory: prefers memory when available", async () => {
  const mirror = freshMirror();
  await storeRepoMemory({ key: "k", value: { a: 1 }, fileMirror: mirror });
  const toolCaller = async () => ({ value: JSON.stringify({ a: 99 }) });
  const r = await recallRepoMemory({ key: "k", toolCaller, fileMirror: mirror });
  assert.equal(r.ok, true);
  assert.equal(r.source, "memory");
  assert.deepEqual(r.value, { a: 99 });
});

test("recallRepoMemory: falls back to file when memory empty", async () => {
  const mirror = freshMirror();
  await storeRepoMemory({ key: "k", value: { a: 1 }, fileMirror: mirror });
  const toolCaller = async () => null;
  const r = await recallRepoMemory({ key: "k", toolCaller, fileMirror: mirror });
  assert.equal(r.ok, true);
  assert.equal(r.source, "file");
  assert.deepEqual(r.value, { a: 1 });
});

test("recallRepoMemory: missing key returns ok=false", async () => {
  const mirror = freshMirror();
  const r = await recallRepoMemory({ key: "nope", fileMirror: mirror });
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});

test("recallRepoMemory: stale flag flips when memory and file disagree", async () => {
  const mirror = freshMirror();
  mirror.write("k", { v: "old" });
  const toolCaller = async () => ({ value: JSON.stringify({ v: "new" }) });
  const r = await recallRepoMemory({
    key: "k",
    toolCaller,
    fileMirror: mirror,
    validateAgainstFile: true,
  });
  assert.equal(r.source, "memory");
  assert.equal(r.stale, true);
  assert.deepEqual(r.value, { v: "new" });
});

test("recallRepoMemory: handles raw-string toolCaller reply", async () => {
  const toolCaller = async () => "raw-string-value";
  const r = await recallRepoMemory({ key: "k", toolCaller });
  assert.equal(r.ok, true);
  assert.equal(r.value, "raw-string-value");
});

test("bridgeToFile: writes value through fileMirror", async () => {
  const mirror = freshMirror();
  const p = await bridgeToFile({ key: "k", value: { x: 1 }, fileMirror: mirror });
  assert.ok(existsSync(p));
  assert.deepEqual(JSON.parse(readFileSync(p, "utf-8")), { x: 1 });
});

test("bridgeToFile: throws without fileMirror", async () => {
  await assert.rejects(() => bridgeToFile({ key: "k", value: 1 }), /fileMirror/);
});

test("parseMaybeJson: round-trips JSON or returns raw on bad parse", () => {
  assert.deepEqual(__internal.parseMaybeJson('{"a":1}'), { a: 1 });
  assert.equal(__internal.parseMaybeJson("not json"), "not json");
  assert.equal(__internal.parseMaybeJson(null), null);
});
