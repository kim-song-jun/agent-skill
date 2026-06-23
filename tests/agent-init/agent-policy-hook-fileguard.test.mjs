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

// --- Original tests (relative file_path, no CLAUDE_PROJECT_DIR) ---

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

// --- New tests for C1: absolute file_path vs relative snapshot (production contract) ---

test("[C1] absolute file_path blocked when snapshot holds relative path (production contract)", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  // Claude Code sends absolute file_path; snapshot holds relative paths
  const absoluteFilePath = join(projectRoot, "src/wip.py");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: absoluteFilePath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 2, "absolute file_path matching relative snapshot entry must be blocked (exit 2)");
});

test("[C1] absolute file_path for non-protected file passes (exit 0)", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const absoluteFilePath = join(projectRoot, "src/other.py");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: absoluteFilePath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 0);
});

// --- New tests for C2: path traversal normalization ---

test("[C2] path with a/../ traversal canonicalizes and is blocked", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  // a/../src/wip.py should resolve to src/wip.py
  const traversalPath = join(projectRoot, "a/../src/wip.py");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: traversalPath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 2, "path with ../ traversal that resolves to protected file must be blocked");
});

test("[C2] relative path with ../ traversal canonicalizes and is blocked", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  // relative path with traversal — resolved against projectRoot
  const traversalRelPath = "src/subdir/../wip.py";
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: traversalRelPath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 2, "relative path with ../ traversal that resolves to protected file must be blocked");
});

// --- New tests for I1: MultiEdit and NotebookEdit coverage ---

test("[I1] MultiEdit on a protected file is blocked exit 2", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const absoluteFilePath = join(projectRoot, "src/wip.py");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "MultiEdit", tool_input: { file_path: absoluteFilePath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 2, "MultiEdit on protected file must be blocked (exit 2)");
});

test("[I1] NotebookEdit on a protected file is blocked exit 2", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["notebooks/analysis.ipynb"]));
  const absoluteFilePath = join(projectRoot, "notebooks/analysis.ipynb");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "NotebookEdit", tool_input: { file_path: absoluteFilePath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 2, "NotebookEdit on protected file must be blocked (exit 2)");
});

test("[I1] MultiEdit on a non-protected file passes (exit 0)", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "fg-proj-"));
  const snap = join(projectRoot, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const absoluteFilePath = join(projectRoot, "src/safe.py");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "MultiEdit", tool_input: { file_path: absoluteFilePath } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap, CLAUDE_PROJECT_DIR: projectRoot },
  );
  assert.equal(code, 0);
});

// --- New test for M1: broken snapshot warns but allows ---

test("[M1] broken/malformed snapshot file silently allows (fail-open)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fg-"));
  const snap = join(dir, "dirty.json");
  writeFileSync(snap, "THIS IS NOT JSON {{{{");
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "src/wip.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap },
  );
  assert.equal(code, 0, "malformed snapshot must fail-open (exit 0)");
});
