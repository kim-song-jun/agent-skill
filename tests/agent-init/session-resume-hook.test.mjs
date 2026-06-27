import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs";

// Returns { code, stdout } — never throws on non-zero (hooks always exit 0 here).
function runHook(payload, projectDir) {
  try {
    const stdout = execFileSync("node", [HOOK], {
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stdout: stdout.toString() };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout || "").toString() };
  }
}

function project(stateObj) {
  const dir = mkdtempSync(join(tmpdir(), "sr-"));
  if (stateObj) writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify(stateObj));
  return dir;
}

const running = (extra = {}) => ({
  status: "running", runId: "R1", sessionId: null,
  updatedAt: new Date().toISOString(),
  phases: [{ phase: 0 }, { phase: 1 }, { phase: 2 }], ...extra,
});

function gitProject(headContent, stateObj) {
  const dir = project(stateObj);
  mkdirSync(join(dir, ".git"), { recursive: true });
  if (headContent !== null) writeFileSync(join(dir, ".git", "HEAD"), headContent);
  return dir;
}

test("git integrity: healthy .git/HEAD (symbolic ref) emits no warning", () => {
  const dir = gitProject("ref: refs/heads/main\n", null);
  const { stdout } = runHook({ source: "startup", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("git integrity: detached-HEAD sha is healthy (no warning)", () => {
  const dir = gitProject("a1b2c3d4e5f60718293a4b5c6d7e8f9012345678\n", null);
  const { stdout } = runHook({ source: "startup", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("git integrity: missing .git/HEAD (the incident signature) emits a warning", () => {
  const dir = gitProject(null, null); // .git dir exists, HEAD deleted
  const { code, stdout } = runHook({ source: "startup", session_id: "S1" }, dir);
  assert.equal(code, 0);
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /GIT INTEGRITY/);
  assert.match(ctx, /HEAD is missing/i);
});

test("git integrity: malformed .git/HEAD emits a warning", () => {
  const dir = gitProject("garbage not a ref\n", null);
  const { stdout } = runHook({ source: "startup", session_id: "S1" }, dir);
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /GIT INTEGRITY/);
  assert.match(ctx, /malformed/i);
});

test("git integrity: a non-git project (no .git) is not flagged", () => {
  const dir = project(null);
  const { stdout } = runHook({ source: "startup", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("git integrity warning combines with the in-flight resume directive", () => {
  const dir = gitProject(null, running()); // broken HEAD + a running agent-all run
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /GIT INTEGRITY/);
  assert.match(ctx, /Phase 3/);
});

test("compact + running[0,1,2] injects a continue-from-Phase-3 directive", () => {
  const dir = project(running());
  const { code, stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Phase 3/);
  assert.match(ctx, /do NOT stop/i);
  assert.match(ctx, /do NOT restart from Phase 0/i);
  assert.match(ctx, /3-dispatch\.md/);
});

test("wiki pointer is included when state.wikiPage is set", () => {
  const dir = project(running({ wikiPage: ".wiki/add-signup-form.md" }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Relevant wiki: \.wiki\/add-signup-form\.md/);
});

test("wiki pointer is omitted when state.wikiPage is absent", () => {
  const dir = project(running());
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(ctx, /Relevant wiki/);
});

test("every source writes current-session.json", () => {
  const dir = project(running());
  runHook({ source: "clear", session_id: "S9" }, dir);
  const cur = JSON.parse(readFileSync(join(dir, ".agent-skill/runs/current-session.json"), "utf-8"));
  assert.equal(cur.sessionId, "S9");
});

test("clear source emits no directive", () => {
  const dir = project(running());
  const { stdout } = runHook({ source: "clear", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("status done emits no directive", () => {
  const dir = project(running({ status: "done" }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("no state file emits no directive", () => {
  const dir = project(null);
  const { code, stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
});

test("stale updatedAt emits no directive", () => {
  const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  const dir = project(running({ updatedAt: old }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("malformed state is non-fatal (exit 0, no directive)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-"));
  writeFileSync(join(dir, ".agent-all-state.json"), "{ not json");
  const { code, stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
});

test("nextPhase > 6 emits no directive", () => {
  const dir = project(running({ phases: [{ phase: 6 }] }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("foreign session ownership: state.sessionId != payload → no directive", () => {
  const dir = project(running({ sessionId: "OWNER" }));
  const { stdout } = runHook({ source: "compact", session_id: "OTHER" }, dir);
  assert.equal(stdout.trim(), "");
});
