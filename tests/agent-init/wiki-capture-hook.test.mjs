import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/wiki-capture.mjs";

function runHook(payload, dir) {
  try {
    const out = execFileSync("node", [HOOK], { input: JSON.stringify(payload), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, stdout: out.toString() };
  } catch (e) { return { code: e.status, stdout: (e.stdout || "").toString() }; }
}
function project({ config, state } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  if (config) writeFileSync(join(dir, ".agent-all.json"), JSON.stringify(config));
  if (state) writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify(state));
  return dir;
}
const ev = (fp) => ({ tool_name: "Write", tool_input: { file_path: fp } });

test("nudges /wiki import when a configured source doc is written", () => {
  const dir = project();
  const { stdout } = runHook(ev(join(dir, "docs/superpowers/specs/x-design.md")), dir);
  assert.match(stdout, /\/wiki import/);
  assert.match(stdout, /x-design\.md/);
});

test("silent for a non-source path", () => {
  const dir = project();
  const { stdout } = runHook(ev(join(dir, "src/app.ts")), dir);
  assert.equal(stdout.trim(), "");
});

test("silent for an excluded glob", () => {
  const dir = project();
  const { stdout } = runHook(ev(join(dir, "docs/superpowers/specs/raw/dump.md")), dir);
  assert.equal(stdout.trim(), "");
});

test("suppressed while an agent-all run is active", () => {
  const dir = project({ state: { status: "running" } });
  const { stdout } = runHook(ev(join(dir, "docs/superpowers/specs/x-design.md")), dir);
  assert.equal(stdout.trim(), "");
});

test("non-fatal on malformed config", () => {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  writeFileSync(join(dir, ".agent-all.json"), "{ not json");
  const { code } = runHook(ev(join(dir, "docs/superpowers/specs/x-design.md")), dir);
  assert.equal(code, 0);
});
