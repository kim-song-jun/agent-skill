import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  installHooks,
  buildHookEntry,
  buildPreToolUseEntry,
  addPreToolUseGitSafety,
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
  assert.equal(e.type, "command");
  assert.equal(e.env.AGENT_SKILL_HOOK_LABEL, "harness-floor-copilot:agent-all");
  assert.match(e.bash, /node '\/d\.mjs' --inbox '\/i\.jsonl'/);
  assert.match(e.powershell, /node '\/d\.mjs' --inbox '\/i\.jsonl'/);
  assert.ok(!("args" in e));
});

test("mergeHook: adds entry to empty hooks object", () => {
  const merged = mergeHook({}, buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" }));
  assert.equal(merged.version, 1);
  assert.equal(merged.hooks.subagentStop.length, 1);
  assert.equal(merged.hooks.subagentStop[0].env.AGENT_SKILL_HOOK_LABEL, "harness-floor-copilot:agent-all");
});

test("mergeHook: preserves existing unrelated hooks", () => {
  const existing = {
    version: 1,
    hooks: {
      subagentStop: [{ type: "command", bash: "echo hi", env: { AGENT_SKILL_HOOK_LABEL: "user-custom" } }],
      notification: [{ type: "command", matcher: "agent_completed", bash: "echo note" }],
    },
  };
  const entry = buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" });
  const merged = mergeHook(existing, entry);
  assert.equal(merged.hooks.subagentStop.length, 2);
  assert.ok(merged.hooks.subagentStop.find((h) => h.env?.AGENT_SKILL_HOOK_LABEL === "user-custom"));
  assert.ok(merged.hooks.subagentStop.find((h) => h.env?.AGENT_SKILL_HOOK_LABEL === "harness-floor-copilot:agent-all"));
  assert.deepEqual(merged.hooks.notification, existing.hooks.notification);
});

test("mergeHook: replaces entry with same label (idempotent)", () => {
  const e1 = buildHookEntry({ label: "agent-all", dispatcher: "/old", inbox: "/old-inbox" });
  const e2 = buildHookEntry({ label: "agent-all", dispatcher: "/new", inbox: "/new-inbox" });
  let merged = mergeHook({}, e1);
  merged = mergeHook(merged, e2);
  assert.equal(merged.hooks.subagentStop.length, 1);
  assert.match(merged.hooks.subagentStop[0].bash, /'\/new' --inbox '\/new-inbox'/);
});

test("mergeHook: normalizes single-object existing entry to array", () => {
  const existing = { version: 1, hooks: { subagentStop: { type: "command", bash: "x" } } };
  const merged = mergeHook(existing, buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" }));
  assert.ok(Array.isArray(merged.hooks.subagentStop));
  assert.equal(merged.hooks.subagentStop.length, 2);
});

test("mergeHook: migrates legacy top-level subagentStop into official hooks object", () => {
  const existing = { subagentStop: [{ type: "command", bash: "echo legacy" }] };
  const merged = mergeHook(existing, buildHookEntry({ label: "agent-all", dispatcher: "/d", inbox: "/i" }));
  assert.equal(merged.version, 1);
  assert.ok(!("subagentStop" in merged));
  assert.equal(merged.hooks.subagentStop.length, 2);
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
  assert.equal(parsed.version, 1);
  assert.equal(parsed.hooks.subagentStop[0].env.AGENT_SKILL_HOOK_LABEL, "harness-floor-copilot:agent-all");
  assert.match(parsed.hooks.subagentStop[0].bash, new RegExp(`${DISPATCHER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*--inbox`));
  assert.match(parsed.hooks.subagentStop[0].bash, new RegExp(inbox.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
  assert.equal(parsed.hooks.subagentStop.length, 2);
  const labels = parsed.hooks.subagentStop.map((h) => h.env.AGENT_SKILL_HOOK_LABEL).sort();
  assert.deepEqual(labels, [
    "harness-floor-copilot:agent-all",
    "harness-floor-copilot:visual-qa",
  ]);
});

test("installHooks: preserves an unrelated user hook", () => {
  const { hooksFile, inbox } = fresh();
  writeFileSync(hooksFile, JSON.stringify({
    version: 1,
    hooks: { subagentStop: [{ type: "command", bash: "echo hi", env: { AGENT_SKILL_HOOK_LABEL: "user-custom" } }] },
  }));
  installHooks({ hooksFile, inbox, label: "agent-all" });
  const parsed = JSON.parse(readFileSync(hooksFile, "utf-8"));
  const labels = parsed.hooks.subagentStop.map((h) => h.env.AGENT_SKILL_HOOK_LABEL).sort();
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
  // Must be valid JSON that round-trips.
  const parsed = JSON.parse(raw);
  // Re-stringify with 2-space indent and compare — proves the written form
  // is indented (not compact), which is the diffability contract.
  assert.equal(raw, JSON.stringify(parsed, null, 2),
    "hooks file must be written as JSON.stringify(…, null, 2) for diffability");
});

test("__internal: DEFAULT_DISPATCHERS resolves both plugin paths", () => {
  assert.equal(__internal.DEFAULT_DISPATCHERS["agent-all"], DISPATCHER);
  assert.equal(__internal.DEFAULT_DISPATCHERS["visual-qa"], VQ_DISPATCHER);
});

test("buildPreToolUseEntry: matcher bash|powershell, points at the git-safety handler, labeled", () => {
  const e = buildPreToolUseEntry("/abs/pre-tool-use-policy.mjs");
  assert.equal(e.type, "command");
  assert.equal(e.matcher, "bash|powershell");
  assert.match(e.bash, /node '\/abs\/pre-tool-use-policy\.mjs'/);
  assert.equal(e.env.AGENT_SKILL_HOOK_LABEL, "harness-floor-copilot:git-safety");
});

test("addPreToolUseGitSafety: idempotent and preserves an unrelated preToolUse hook", () => {
  const existing = {
    version: 1,
    hooks: { preToolUse: [{ type: "command", bash: "echo user", env: { AGENT_SKILL_HOOK_LABEL: "user-pre" } }] },
  };
  let merged = addPreToolUseGitSafety(existing, "/h.mjs");
  assert.equal(merged.hooks.preToolUse.length, 2);
  merged = addPreToolUseGitSafety(merged, "/h.mjs"); // re-run replaces, not appends
  assert.equal(merged.hooks.preToolUse.length, 2);
  assert.ok(merged.hooks.preToolUse.find((h) => h.env?.AGENT_SKILL_HOOK_LABEL === "user-pre"));
  assert.ok(merged.hooks.preToolUse.find((h) => h.env?.AGENT_SKILL_HOOK_LABEL === "harness-floor-copilot:git-safety"));
});

test("installHooks: registers the preToolUse git-safety hook alongside subagentStop", () => {
  const { hooksFile, inbox } = fresh();
  installHooks({ hooksFile, inbox, label: "agent-all" });
  const parsed = JSON.parse(readFileSync(hooksFile, "utf-8"));
  assert.equal(parsed.hooks.subagentStop.length, 1);
  assert.equal(parsed.hooks.preToolUse.length, 1);
  assert.equal(parsed.hooks.preToolUse[0].matcher, "bash|powershell");
  assert.match(parsed.hooks.preToolUse[0].bash, /pre-tool-use-policy\.mjs/);
  assert.equal(parsed.hooks.preToolUse[0].env.AGENT_SKILL_HOOK_LABEL, "harness-floor-copilot:git-safety");
});

test("defaultHooksFile resolves inside the ~/.copilot/hooks/ directory (not a single hooks.json)", () => {
  assert.match(__internal.defaultHooksFile(), /\.copilot\/hooks\/[^/]+\.json$/);
  assert.doesNotMatch(__internal.defaultHooksFile(), /\.copilot\/hooks\.json$/);
});
