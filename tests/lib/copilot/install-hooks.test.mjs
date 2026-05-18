import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  installHooks,
  buildHookEntry,
  mergeHook,
  loadHooksFile,
  __internal,
} from "../../../plugins/harness-floor-copilot/bin/install-hooks.mjs";

const DISPATCHER = resolve(
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/hooks/subagent-stop-dispatcher.mjs",
);
const VQ_DISPATCHER = resolve(
  "plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/hooks/subagent-stop-dispatcher.mjs",
);

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "install-hooks-"));
  return { dir, hooksFile: join(dir, "hooks.json"), inbox: join(dir, "inbox.jsonl") };
}

test("buildHookEntry: requires label, dispatcher, inbox", () => {
  assert.throws(() => buildHookEntry({}), /label/);
  assert.throws(() => buildHookEntry({ label: "x" }), /dispatcher/);
  assert.throws(() => buildHookEntry({ label: "x", dispatcher: "d" }), /inbox/);
  const e = buildHookEntry({ label: "agent-all", dispatcher: "/d.mjs", inbox: "/i.jsonl" });
  assert.equal(e.label, "harness-floor-copilot:agent-all");
  assert.equal(e.command, "node");
  assert.deepEqual(e.args, ["/d.mjs", "--inbox", "/i.jsonl"]);
});

test("mergeHook: adds entry to empty hooks object", () => {
  const merged = mergeHook({}, buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" }));
  assert.equal(merged.subagentStop.length, 1);
  assert.equal(merged.subagentStop[0].label, "harness-floor-copilot:agent-all");
});

test("mergeHook: preserves existing unrelated hooks", () => {
  const existing = {
    subagentStop: [{ label: "user-custom", command: "echo", args: ["hi"] }],
    otherHook: [{ command: "stuff" }],
  };
  const entry = buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" });
  const merged = mergeHook(existing, entry);
  assert.equal(merged.subagentStop.length, 2);
  assert.ok(merged.subagentStop.find((h) => h.label === "user-custom"));
  assert.ok(merged.subagentStop.find((h) => h.label === "harness-floor-copilot:agent-all"));
  assert.deepEqual(merged.otherHook, existing.otherHook);
});

test("mergeHook: replaces entry with same label (idempotent)", () => {
  const e1 = buildHookEntry({ label: "agent-all", dispatcher: "/old", inbox: "/old-inbox" });
  const e2 = buildHookEntry({ label: "agent-all", dispatcher: "/new", inbox: "/new-inbox" });
  let merged = mergeHook({}, e1);
  merged = mergeHook(merged, e2);
  assert.equal(merged.subagentStop.length, 1);
  assert.deepEqual(merged.subagentStop[0].args, ["/new", "--inbox", "/new-inbox"]);
});

test("mergeHook: normalizes single-object existing entry to array", () => {
  const existing = { subagentStop: { label: "old", command: "x", args: [] } };
  const merged = mergeHook(existing, buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" }));
  assert.ok(Array.isArray(merged.subagentStop));
  assert.equal(merged.subagentStop.length, 2);
});

test("loadHooksFile: returns {} for missing or empty file", () => {
  const { dir } = fresh();
  assert.deepEqual(loadHooksFile(join(dir, "nope.json")), {});
  writeFileSync(join(dir, "empty.json"), "");
  assert.deepEqual(loadHooksFile(join(dir, "empty.json")), {});
});

test("loadHooksFile: throws on invalid JSON", () => {
  const { dir } = fresh();
  const p = join(dir, "bad.json");
  writeFileSync(p, "not json {");
  assert.throws(() => loadHooksFile(p), /not valid JSON/);
});

test("installHooks: creates a new hooks file when missing", () => {
  const { hooksFile, inbox } = fresh();
  const r = installHooks({ hooksFile, inbox, label: "agent-all" });
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.ok(existsSync(hooksFile));
  const parsed = JSON.parse(readFileSync(hooksFile, "utf-8"));
  assert.equal(parsed.subagentStop[0].label, "harness-floor-copilot:agent-all");
  assert.deepEqual(parsed.subagentStop[0].args, [DISPATCHER, "--inbox", inbox]);
});

test("installHooks: idempotent re-run returns noop without writing", () => {
  const { hooksFile, inbox } = fresh();
  const r1 = installHooks({ hooksFile, inbox, label: "agent-all" });
  assert.equal(r1.changed, true);
  const before = readFileSync(hooksFile, "utf-8");
  const r2 = installHooks({ hooksFile, inbox, label: "agent-all" });
  assert.equal(r2.changed, false);
  assert.equal(r2.action, "noop");
  const after = readFileSync(hooksFile, "utf-8");
  assert.equal(before, after);
});

test("installHooks: merges agent-all + visual-qa side-by-side", () => {
  const { hooksFile } = fresh();
  const inbox1 = "/tmp/a/inbox.jsonl";
  const inbox2 = "/tmp/v/inbox.jsonl";
  installHooks({ hooksFile, inbox: inbox1, label: "agent-all" });
  installHooks({ hooksFile, inbox: inbox2, label: "visual-qa" });
  const parsed = JSON.parse(readFileSync(hooksFile, "utf-8"));
  assert.equal(parsed.subagentStop.length, 2);
  const labels = parsed.subagentStop.map((h) => h.label).sort();
  assert.deepEqual(labels, [
    "harness-floor-copilot:agent-all",
    "harness-floor-copilot:visual-qa",
  ]);
});

test("installHooks: preserves an unrelated user hook", () => {
  const { hooksFile, inbox } = fresh();
  writeFileSync(hooksFile, JSON.stringify({
    subagentStop: [{ label: "user-custom", command: "echo", args: ["hi"] }],
  }));
  installHooks({ hooksFile, inbox, label: "agent-all" });
  const parsed = JSON.parse(readFileSync(hooksFile, "utf-8"));
  const labels = parsed.subagentStop.map((h) => h.label).sort();
  assert.deepEqual(labels, [
    "harness-floor-copilot:agent-all",
    "user-custom",
  ]);
});

test("installHooks: unknown label without explicit dispatcher → throws", () => {
  const { hooksFile, inbox } = fresh();
  assert.throws(
    () => installHooks({ hooksFile, inbox, label: "made-up-label" }),
    /no default dispatcher/,
  );
});

test("installHooks: missing dispatcher path → throws", () => {
  const { hooksFile, inbox } = fresh();
  assert.throws(
    () => installHooks({
      hooksFile, inbox, label: "agent-all",
      dispatcher: "/path/does/not/exist.mjs",
    }),
    /dispatcher script not found/,
  );
});

test("installHooks: writes pretty-printed JSON for diffability", () => {
  const { hooksFile, inbox } = fresh();
  installHooks({ hooksFile, inbox, label: "agent-all" });
  const raw = readFileSync(hooksFile, "utf-8");
  // 2-space indent + multiple lines → at least one newline.
  assert.ok(raw.includes("\n"));
  assert.ok(raw.includes("  ")); // indentation
});

test("__internal: DEFAULT_DISPATCHERS resolves both plugin paths", () => {
  assert.equal(__internal.DEFAULT_DISPATCHERS["agent-all"], DISPATCHER);
  assert.equal(__internal.DEFAULT_DISPATCHERS["visual-qa"], VQ_DISPATCHER);
});
