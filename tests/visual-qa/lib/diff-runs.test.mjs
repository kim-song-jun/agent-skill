import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { diffRuns, issueKey } from "../../../plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, "..", "fixtures", "runs", name), "utf-8"));

const baseIssue = { page: "home", component: "hero", state: "default", bp: "desktop", category: "alignment", description: "logo off-center", severity: "major" };

test("issueKey is stable for identical inputs", () => {
  assert.equal(issueKey(baseIssue), issueKey({ ...baseIssue }));
});

test("first run: all issues are new (no prior)", () => {
  const d = diffRuns([baseIssue], null);
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 0);
  assert.equal(d.unchanged.length, 0);
});

test("no changes: all issues are unchanged", () => {
  const prior = load("prior-issues.json").issues;
  const d = diffRuns(prior, { issues: prior });
  assert.equal(d.new.length, 0);
  assert.equal(d.resolved.length, 0);
  assert.equal(d.unchanged.length, 2);
});

test("issue added since prior: 1 new, 0 resolved", () => {
  const prior = load("prior-issues.json").issues;
  const current = [...prior, { page: "home", component: "footer", state: "default", bp: "mobile", category: "copy-quality", description: "typo", severity: "minor" }];
  const d = diffRuns(current, { issues: prior });
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 0);
  assert.equal(d.unchanged.length, 2);
});

test("issue removed since prior: 0 new, 1 resolved", () => {
  const prior = load("prior-issues.json").issues;
  const current = [prior[0]];
  const d = diffRuns(current, { issues: prior });
  assert.equal(d.new.length, 0);
  assert.equal(d.resolved.length, 1);
  assert.equal(d.unchanged.length, 1);
});
