import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import {
  patchSettings,
  unpatchSettings,
  buildStandardThriftHooks,
} from "../../plugins/harness-thrift/skills/thrift/lib/settings-patcher.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "thrift-patch-"));
}

test("settings-patcher: patches into empty settings", () => {
  const dir = tmp();
  const sp = join(dir, "settings.local.json");
  try {
    const hooks = buildStandardThriftHooks({ hooksDir: ".claude/hooks" });
    const res = patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    assert.equal(res.applied, 6); // 2 PreToolUse + 2 PostToolUse + 1 SessionStart + 1 SessionEnd
    assert.equal(res.skipped, 0);
    const written = JSON.parse(readFileSync(sp, "utf-8"));
    assert.equal(written.hooks.PreToolUse.length, 2, "expected 2 PreToolUse entries");
    assert.equal(written.hooks.PostToolUse.length, 2, "expected 2 PostToolUse entries");
    assert.equal(written.hooks.SessionStart.length, 1, "expected 1 SessionStart entry");
    assert.equal(written.hooks.SessionEnd.length, 1, "expected 1 SessionEnd entry");
    // The coercion-outcome PostToolUse entry carries a matcher covering the
    // context-mode coercion tools.
    assert.ok(written.hooks.PostToolUse.some((e) =>
      e.hooks.some((h) => /thrift-posttool-coercion-outcome/.test(h.command))
      && /ctx_execute/.test(e.matcher || "")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: append-only — preserves existing hooks", () => {
  const dir = tmp();
  const sp = join(dir, "settings.local.json");
  try {
    writeFileSync(sp, JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "node existing-hook.mjs" }] },
        ],
      },
    }));
    const hooks = buildStandardThriftHooks({ hooksDir: ".claude/hooks" });
    patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    const written = JSON.parse(readFileSync(sp, "utf-8"));
    // Existing entry preserved first; thrift appended after.
    assert.equal(written.hooks.PreToolUse[0].hooks[0].command, "node existing-hook.mjs");
    assert.match(written.hooks.PreToolUse[1].hooks[0].command, /thrift-pretool-bash-telemetry/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: skips already-registered entries on re-run", () => {
  const dir = tmp();
  const sp = join(dir, "settings.local.json");
  try {
    const hooks = buildStandardThriftHooks({ hooksDir: ".claude/hooks" });
    patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    const res2 = patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    assert.equal(res2.applied, 0);
    assert.equal(res2.skipped, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: dry-run does not write", () => {
  const dir = tmp();
  const sp = join(dir, "settings.local.json");
  try {
    const hooks = buildStandardThriftHooks({ hooksDir: ".claude/hooks" });
    const res = patchSettings({ settingsPath: sp, hooksToAdd: hooks, dryRun: true });
    assert.equal(res.applied, 6);
    assert.ok(!existsSync(sp), "should not have written file in dry-run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: refuses to touch unparseable settings", () => {
  const dir = tmp();
  const sp = join(dir, "settings.local.json");
  try {
    writeFileSync(sp, "{ this isn't json ");
    const hooks = buildStandardThriftHooks({ hooksDir: ".claude/hooks" });
    assert.throws(
      () => patchSettings({ settingsPath: sp, hooksToAdd: hooks }),
      /cannot parse/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: unpatch removes only thrift entries", () => {
  const dir = tmp();
  const sp = join(dir, "settings.local.json");
  try {
    writeFileSync(sp, JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "node user-hook.mjs" }] },
        ],
      },
    }));
    const hooks = buildStandardThriftHooks({ hooksDir: ".claude/hooks" });
    patchSettings({ settingsPath: sp, hooksToAdd: hooks });
    const before = JSON.parse(readFileSync(sp, "utf-8"));
    assert.equal(before.hooks.PreToolUse.length, 3, `expected 3 entries before unpatch, got ${before.hooks.PreToolUse.length}`);
    const res = unpatchSettings({ settingsPath: sp });
    assert.equal(res.removed, 6);
    const after = JSON.parse(readFileSync(sp, "utf-8"));
    // User-hook entry preserved
    assert.equal(after.hooks.PreToolUse.length, 1);
    assert.match(after.hooks.PreToolUse[0].hooks[0].command, /user-hook/);
    // Empty event arrays cleaned up
    assert.equal(after.hooks.PostToolUse, undefined);
    assert.equal(after.hooks.SessionStart, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: unpatch on missing file is safe no-op", () => {
  const res = unpatchSettings({ settingsPath: "/tmp/nonexistent/settings.local.json" });
  assert.equal(res.removed, 0);
});

test("buildStandardThriftHooks: encodes hooksDir into commands", () => {
  const h = buildStandardThriftHooks({ hooksDir: "/abs/path/to/hooks" });
  for (const event of Object.values(h)) {
    for (const entry of event) {
      for (const hook of entry.hooks) {
        assert.match(hook.command, /\/abs\/path\/to\/hooks\/thrift-/);
      }
    }
  }
});
