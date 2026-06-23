import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs";

function runHook(payload, env) {
  try {
    execFileSync("node", [HOOK, "PreToolUse"], { input: JSON.stringify(payload), env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    return 0;
  } catch (e) { return e.status; }
}

test("Edit on a protected (pre-existing dirty) file is blocked exit 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "fg-"));
  const snap = join(dir, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "src/wip.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap },
  );
  assert.equal(code, 2);
});

test("Edit on a non-protected file passes (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fg-"));
  const snap = join(dir, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "src/new.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap },
  );
  assert.equal(code, 0);
});

test("Write without AGENT_ALL_DIRTY_SNAPSHOT set passes (no protection)", () => {
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "src/anything.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: "" },
  );
  assert.equal(code, 0);
});

test("Edit with dot-slash prefix matches protected path", () => {
  const dir = mkdtempSync(join(tmpdir(), "fg-"));
  const snap = join(dir, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "./src/wip.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap },
  );
  assert.equal(code, 2);
});
