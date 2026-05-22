import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFloorPolicy, uninstallFloorPolicy } from "../../../plugins/harness-floor/bin/install-floor-policy.mjs";

test("install adds PreToolUse + PostToolUse entries with sentinel paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  mkdirSync(join(dir, ".claude"));
  const settings = join(dir, ".claude/settings.local.json");
  writeFileSync(settings, JSON.stringify({ hooks: {} }));
  installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/floor-policy-hook.mjs" });
  const s = JSON.parse(readFileSync(settings, "utf-8"));
  const pre = (s.hooks.PreToolUse || []).find((h) => h.command?.includes("floor-policy-"));
  const post = (s.hooks.PostToolUse || []).find((h) => h.command?.includes("floor-policy-"));
  assert.ok(pre, "PreToolUse entry missing");
  assert.ok(post, "PostToolUse entry missing");
  assert.match(pre.command, /floor-policy-/);
  assert.match(post.command, /floor-policy-/);
});

test("install is idempotent (no duplicates)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  mkdirSync(join(dir, ".claude"));
  const settings = join(dir, ".claude/settings.local.json");
  writeFileSync(settings, JSON.stringify({ hooks: {} }));
  installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/h.mjs" });
  installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/h.mjs" });
  const s = JSON.parse(readFileSync(settings, "utf-8"));
  const pre = (s.hooks.PreToolUse || []).filter((h) => h.command?.includes("floor-policy-"));
  assert.equal(pre.length, 1);
});

test("uninstall removes only floor-policy entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  mkdirSync(join(dir, ".claude"));
  const settings = join(dir, ".claude/settings.local.json");
  writeFileSync(settings, JSON.stringify({
    hooks: { PreToolUse: [{ command: "other-hook" }, { command: "floor-policy-pre h.mjs" }] }
  }));
  uninstallFloorPolicy({ projectDir: dir });
  const s = JSON.parse(readFileSync(settings, "utf-8"));
  const pre = s.hooks.PreToolUse;
  assert.equal(pre.length, 1);
  assert.equal(pre[0].command, "other-hook");
});
