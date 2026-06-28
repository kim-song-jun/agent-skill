import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeGitCommand } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/hooks/git-safety.mjs";

test("blocks shared-worktree git-safety violations (rules 6/7/8 + destructive)", () => {
  for (const cmd of [
    "git stash",
    "git stash push -m wip",
    "git checkout -b feature",
    "git switch main",
    "git clean -fd",
    "git clean -fdx",
    "git reset --hard HEAD~1",
    "git add -A",
    "git add --all",
    "git commit -am wip",
    "git commit -m x",
    "git push --force",
    "git push --force-with-lease origin main",
    "git checkout -- src/app.ts",
  ]) {
    const r = analyzeGitCommand(cmd);
    assert.equal(r.blocked, true, `must block: ${cmd}`);
    assert.ok(r.reason && r.reason.length > 0, `must give a reason: ${cmd}`);
  }
});

test("allows safe git and read-only forms", () => {
  for (const cmd of [
    "git status",
    "git stash list",
    "git stash show",
    "git clean -n",
    "git clean --dry-run",
    "git commit -m x -- src/a.ts",
    "git push origin main",
    "git add -- src/a.ts",
    "git log --oneline",
    "git diff HEAD",
  ]) {
    const r = analyzeGitCommand(cmd);
    assert.equal(r.blocked, false, `must allow: ${cmd}: ${r.reason ?? ""}`);
  }
});

test("inspects compound commands (&&, ;, |) and blocks if any git segment is dangerous", () => {
  assert.equal(analyzeGitCommand("npm test && git stash").blocked, true);
  assert.equal(analyzeGitCommand("git fetch ; git reset --hard origin/main").blocked, true);
  assert.equal(analyzeGitCommand("git add -- src/a.ts && echo done").blocked, false);
});

test("a non-git command is out of scope (allowed by git-safety)", () => {
  assert.equal(analyzeGitCommand("rm -rf node_modules").blocked, false);
  assert.equal(analyzeGitCommand("").blocked, false);
});
