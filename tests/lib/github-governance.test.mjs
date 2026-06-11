import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildDocsStructureReport } from "../../scripts/docs-structure-check.mjs";
import { buildGithubGovernanceReport } from "../../scripts/github-governance-check.mjs";

function writeRel(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, content);
}

test("github governance check validates workflows, templates, labels, and docs", () => {
  const report = buildGithubGovernanceReport({ root: process.cwd() });

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  assert.ok(report.checks.some((check) => check.name === "public workflow contracts"));
  assert.ok(report.checks.some((check) => check.name === "issue template contracts"));
  assert.ok(report.checks.some((check) => check.name === "label taxonomy contract"));
});

test("github governance CLI emits machine-readable JSON", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/github-governance-check.mjs"), "--json"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const report = JSON.parse(res.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "GitHub governance files exist"));
});

test("docs structure check validates public docs and local links", () => {
  const report = buildDocsStructureReport({ root: process.cwd() });

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  assert.ok(report.checks.some((check) => check.name === "required public docs exist"));
  assert.ok(report.checks.some((check) => check.name === "local markdown links resolve"));
  assert.ok(report.checks.some((check) => check.name === "public CI does not replace local release gate"));
});

test("docs structure CLI emits machine-readable JSON", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/docs-structure-check.mjs"), "--json"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const report = JSON.parse(res.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.name === "required governance doc sections exist"));
});

test("github governance check fails when the public smoke workflow is missing", () => {
  const root = mkdtempSync(resolve(tmpdir(), "agent-skill-governance-"));

  writeRel(root, ".github/workflows/docs.yml", "name: Docs Structure CI\non:\n  pull_request:\n");
  writeRel(root, ".github/workflows/templates.yml", "name: Template Drift CI\non:\n  pull_request:\n");
  writeRel(root, ".github/labels.yml", "");
  writeRel(root, "docs/github-governance.md", "# GitHub Governance\n");

  const report = buildGithubGovernanceReport({ root });

  assert.equal(report.ok, false);
  assert.ok(
    report.checks.some(
      (check) => !check.ok && check.name === "GitHub governance files exist" && /smoke\.yml/.test(check.details),
    ),
    JSON.stringify(report.checks, null, 2),
  );
});

