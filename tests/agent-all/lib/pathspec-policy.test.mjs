import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeShellCommand } from "../../../plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs";

test("blocks destructive git commands", () => {
  assert.equal(analyzeShellCommand("git reset --hard").blocked, true);
  assert.equal(analyzeShellCommand("git checkout -- src/app.js").blocked, true);
  assert.equal(analyzeShellCommand("git push --force").blocked, true);
  assert.equal(analyzeShellCommand("git push --force-with-lease").blocked, true);
});

test("blocks git add -A and git commit -a", () => {
  assert.equal(analyzeShellCommand("git add -A").blocked, true);
  assert.equal(analyzeShellCommand("git add --all").blocked, true);
  assert.equal(analyzeShellCommand("git commit -am msg").blocked, true);
  assert.equal(analyzeShellCommand("git commit --all -m msg").blocked, true);
});

test("requires pathspec for git commit in operational mode", () => {
  assert.equal(analyzeShellCommand("git commit -m msg").blocked, true);
  assert.equal(analyzeShellCommand("git commit -m msg -- docs/a.md").blocked, false);
});
