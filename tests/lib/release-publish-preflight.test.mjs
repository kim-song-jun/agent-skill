import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReleasePublishPreflightReport } from "../../scripts/release-publish-preflight.mjs";

function makeRoot() {
  return mkdtempSync(resolve(tmpdir(), "release-publish-preflight-"));
}

function makeRunner({ changedFiles = "", scopes = "'gist', 'read:org', 'repo'", dirty = "" } = {}) {
  return (call) => {
    if (call.label === "git head") return { status: 0, stdout: "abc123def456abc123def456abc123def456abcd\n", stderr: "" };
    if (call.label === "git branch") return { status: 0, stdout: "feat/release-gate-ci\n", stderr: "" };
    if (call.label === "git status") return { status: 0, stdout: dirty, stderr: "" };
    if (call.label === "git remote") return { status: 0, stdout: "https://github.com/example/agent-skill.git\n", stderr: "" };
    if (call.label === "git upstream") return { status: 0, stdout: "origin/feat/release-gate-ci\n", stderr: "" };
    if (call.label === "git changed files") return { status: 0, stdout: changedFiles, stderr: "" };
    if (call.label === "gh auth status") {
      return {
        status: 0,
        stdout: [
          "github.com",
          "  ✓ Logged in to github.com account kim-song-jun (keyring)",
          "  - Active account: true",
          `  - Token scopes: ${scopes}`,
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    throw new Error(`unexpected call: ${call.label}`);
  };
}

test("publish preflight fails workflow changes when gh token lacks workflow scope", () => {
  const report = buildReleasePublishPreflightReport({
    root: makeRoot(),
    runner: makeRunner({ changedFiles: ".github/workflows/release.yml\nREADME.md\n" }),
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.workflowChanges, [".github/workflows/release.yml"]);
  assert.equal(report.gh.hasWorkflowScope, false);
  assert.match(report.recommendation, /gh auth refresh -h github\.com -s workflow/);
  const workflowScope = report.checks.find((check) => check.name.includes("workflow scope"));
  assert.equal(workflowScope.ok, false);
  assert.match(workflowScope.details, /missing workflow scope/);
});

test("publish preflight passes workflow changes when gh token has workflow scope", () => {
  const report = buildReleasePublishPreflightReport({
    root: makeRoot(),
    runner: makeRunner({
      changedFiles: ".github/workflows/release.yml\nscripts/release-audit.mjs\n",
      scopes: "'gist', 'read:org', 'repo', 'workflow'",
    }),
  });

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  assert.equal(report.gh.hasWorkflowScope, true);
  assert.equal(report.pushCommand, "git push -u origin feat/release-gate-ci");
});

test("publish preflight does not require workflow scope when workflow files are unchanged", () => {
  const report = buildReleasePublishPreflightReport({
    root: makeRoot(),
    runner: makeRunner({ changedFiles: "README.md\nscripts/release-audit.mjs\n" }),
  });

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  assert.deepEqual(report.workflowChanges, []);
  assert.match(report.recommendation, /Publish preflight passed/);
});

test("publish preflight fails dirty worktrees unless explicitly allowed", () => {
  const report = buildReleasePublishPreflightReport({
    root: makeRoot(),
    runner: makeRunner({ dirty: " M README.md\n" }),
  });
  assert.equal(report.ok, false);

  const allowed = buildReleasePublishPreflightReport({
    root: makeRoot(),
    allowDirty: true,
    runner: makeRunner({ dirty: " M README.md\n" }),
  });
  assert.equal(allowed.ok, true, JSON.stringify(allowed.checks, null, 2));
});
