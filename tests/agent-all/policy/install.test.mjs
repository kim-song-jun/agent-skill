import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFloorPolicy, uninstallFloorPolicy } from "../../../plugins/harness-floor/bin/install-floor-policy.mjs";

function tempProject() {
  return mkdtempSync(join(tmpdir(), "ifp-"));
}

function settingsPath(dir) {
  return join(dir, ".claude/settings.local.json");
}

function commandOf(entry) {
  return entry?.hooks?.[0]?.command || "";
}

test("install adds Claude Task PreToolUse + PostToolUse entries with executable commands", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  try {
    mkdirSync(join(dir, ".claude"));
    const settings = settingsPath(dir);
    writeFileSync(settings, JSON.stringify({ hooks: {} }));
    installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/floor-policy-hook.mjs" });
    const s = JSON.parse(readFileSync(settings, "utf-8"));
    const pre = (s.hooks.PreToolUse || []).find((entry) => commandOf(entry).includes("floor-policy-hook.mjs"));
    const post = (s.hooks.PostToolUse || []).find((entry) => commandOf(entry).includes("floor-policy-hook.mjs"));
    assert.ok(pre, "PreToolUse entry missing");
    assert.ok(post, "PostToolUse entry missing");
    assert.equal(pre.matcher, "Task");
    assert.equal(post.matcher, "Task");
    assert.deepEqual(pre.hooks, [{ type: "command", command: 'node "/abs/path/floor-policy-hook.mjs" PreToolUse' }]);
    assert.deepEqual(post.hooks, [{ type: "command", command: 'node "/abs/path/floor-policy-hook.mjs" PostToolUse' }]);
    assert.doesNotMatch(commandOf(pre), /^floor-policy-pre\b/);
    assert.doesNotMatch(commandOf(post), /^floor-policy-post\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install creates .claude/settings.local.json when the settings directory is absent", () => {
  const dir = tempProject();
  try {
    installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/floor-policy-hook.mjs" });
    assert.ok(existsSync(settingsPath(dir)), "settings.local.json should be created");
    const s = JSON.parse(readFileSync(settingsPath(dir), "utf-8"));
    assert.equal(s.hooks.PreToolUse[0].matcher, "Task");
    assert.match(commandOf(s.hooks.PostToolUse[0]), /PostToolUse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install is idempotent (no duplicates)", () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, ".claude"));
    const settings = settingsPath(dir);
    writeFileSync(settings, JSON.stringify({ hooks: {} }));
    installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/floor-policy-hook.mjs" });
    installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/floor-policy-hook.mjs" });
    const s = JSON.parse(readFileSync(settings, "utf-8"));
    const pre = (s.hooks.PreToolUse || []).filter((entry) => commandOf(entry).includes("floor-policy-hook.mjs"));
    const post = (s.hooks.PostToolUse || []).filter((entry) => commandOf(entry).includes("floor-policy-hook.mjs"));
    assert.equal(pre.length, 1);
    assert.equal(post.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install migrates legacy flat floor-policy entries before adding current entries", () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, ".claude"));
    const settings = settingsPath(dir);
    writeFileSync(settings, JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Task", command: "floor-policy-pre node /old/floor-policy-hook.mjs PreToolUse" },
          { matcher: "Bash", hooks: [{ type: "command", command: "node user-hook.mjs" }] },
        ],
        PostToolUse: [
          { matcher: "Task", command: "floor-policy-post node /old/floor-policy-hook.mjs PostToolUse" },
        ],
      },
    }));

    installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/new/floor-policy-hook.mjs" });
    const s = JSON.parse(readFileSync(settings, "utf-8"));
    const body = JSON.stringify(s);
    assert.doesNotMatch(body, /floor-policy-pre node|floor-policy-post node/);
    assert.match(body, /node user-hook\.mjs/);
    assert.equal(
      s.hooks.PreToolUse.filter((entry) => commandOf(entry).includes("/new/floor-policy-hook.mjs")).length,
      1,
    );
    assert.equal(
      s.hooks.PostToolUse.filter((entry) => commandOf(entry).includes("/new/floor-policy-hook.mjs")).length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uninstall removes only nested and legacy floor-policy entries", () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, ".claude"));
    const settings = settingsPath(dir);
    writeFileSync(settings, JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "node user-hook.mjs" }] },
          { matcher: "Task", hooks: [{ type: "command", command: 'node "/abs/floor-policy-hook.mjs" PreToolUse' }] },
          { matcher: "Task", command: "floor-policy-pre node /old/floor-policy-hook.mjs PreToolUse" },
        ],
        PostToolUse: [
          { matcher: "Task", hooks: [{ type: "command", command: 'node "/abs/floor-policy-hook.mjs" PostToolUse' }] },
        ],
      },
    }));
    uninstallFloorPolicy({ projectDir: dir });
    const s = JSON.parse(readFileSync(settings, "utf-8"));
    assert.equal(s.hooks.PreToolUse.length, 1);
    assert.equal(commandOf(s.hooks.PreToolUse[0]), "node user-hook.mjs");
    assert.equal(s.hooks.PostToolUse, undefined);
    assert.doesNotMatch(JSON.stringify(s), /floor-policy-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install refuses to overwrite unparseable settings", () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, ".claude"));
    const settings = settingsPath(dir);
    writeFileSync(settings, "{ invalid json");
    assert.throws(
      () => installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/floor-policy-hook.mjs" }),
      /cannot parse .*settings\.local\.json/,
    );
    assert.equal(readFileSync(settings, "utf-8"), "{ invalid json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
