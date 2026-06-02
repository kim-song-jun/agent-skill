import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeShellCommand } from "../../../plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs";

test("blocks destructive git commands", () => {
  assert.equal(analyzeShellCommand("git reset --hard").blocked, true);
  assert.equal(analyzeShellCommand("git checkout -- src/app.js").blocked, true);
  assert.equal(analyzeShellCommand("git commit --amend").blocked, true);
  assert.equal(analyzeShellCommand("git push --force").blocked, true);
  assert.equal(analyzeShellCommand("git push --force-with-lease").blocked, true);
});

test("blocks git reset --hard after newline command boundary", () => {
  assert.equal(analyzeShellCommand("echo ok\ngit reset --hard").blocked, true);
});

test("blocks git commit without pathspec after newline command boundary", () => {
  assert.equal(analyzeShellCommand("echo ok\ngit commit -m msg").blocked, true);
});

test("blocks docker volume removal after newline command boundary", () => {
  assert.equal(analyzeShellCommand("echo ok\ndocker volume rm data").blocked, true);
});

test("blocks destructive git commands after global options", () => {
  assert.equal(analyzeShellCommand("git -C . commit -m msg").blocked, true);
  assert.equal(analyzeShellCommand("git -C . commit -a -m msg").blocked, true);
  assert.equal(analyzeShellCommand("git -C . commit --amend").blocked, true);
  assert.equal(analyzeShellCommand("git -C . reset --hard").blocked, true);
});

test("blocks git add -A and git commit -a", () => {
  assert.equal(analyzeShellCommand("git add -A").blocked, true);
  assert.equal(analyzeShellCommand("git add --all").blocked, true);
  assert.equal(analyzeShellCommand("git commit -am msg").blocked, true);
  assert.equal(analyzeShellCommand("git commit --all -m msg").blocked, true);
});

test("requires pathspec for git commit in operational mode", () => {
  assert.equal(analyzeShellCommand("git commit -m msg").blocked, true);
  assert.equal(analyzeShellCommand('git commit -m "msg -- text"').blocked, true);
  assert.equal(analyzeShellCommand("git commit -m msg -- docs/a.md").blocked, false);
});

test("allows scoped add and pathspec commit", () => {
  assert.equal(analyzeShellCommand("git add docs/tasks/1-x.md plugins/x.mjs").blocked, false);
  assert.equal(analyzeShellCommand("git commit -m msg -- docs/tasks/1-x.md plugins/x.mjs").blocked, false);
});

test("ignores destructive git prose inside quoted arguments", () => {
  assert.equal(analyzeShellCommand('git commit -m "avoid git reset --hard" -- docs/a.md').blocked, false);
  assert.equal(analyzeShellCommand('git commit -m "explain -a option" -- docs/a.md').blocked, false);
  assert.equal(analyzeShellCommand('echo "git reset --hard"').blocked, false);
  assert.equal(analyzeShellCommand('echo "ok\ngit reset --hard"').blocked, false);
});

test("blocks destructive docker volume removal", () => {
  assert.equal(analyzeShellCommand("docker volume rm data").blocked, true);
});

test("blocks project-configured destructive commands", () => {
  assert.equal(
    analyzeShellCommand("pnpm deploy --prod", { destructiveCommands: ["pnpm deploy"] }).blocked,
    true,
  );
  assert.equal(
    analyzeShellCommand("rm -rf build", { destructiveCommands: [/^rm\s+-rf\b/] }).blocked,
    true,
  );
});

test("blocks project-configured destructive confirmation flags", () => {
  assert.deepEqual(analyzeShellCommand("deploy --yes", { destructiveConfirmFlags: ["--yes"] }), {
    blocked: true,
    reason: "destructive confirmation flag: --yes",
  });
  assert.deepEqual(analyzeShellCommand("deploy --confirm", { destructiveConfirmFlags: ["--confirm"] }), {
    blocked: true,
    reason: "destructive confirmation flag: --confirm",
  });
});
