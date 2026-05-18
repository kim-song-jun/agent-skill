import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diffRuns, issueKey } from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/diff-runs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, "..", "visual-qa", "fixtures", "runs", name), "utf-8"));

const SOURCE = resolve("plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs");
const VENDORED = resolve("plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/diff-runs.mjs");

test("vendored copy retains source code", () => {
  const src = readFileSync(SOURCE, "utf-8");
  const ven = readFileSync(VENDORED, "utf-8");
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    assert.ok(ven.includes(line), `vendored diff-runs.mjs missing: ${line}`);
  }
});

const base = { page: "home", component: "hero", state: "default", bp: "desktop", category: "alignment", description: "logo off-center", severity: "major" };

test("issueKey is stable for identical inputs", () => {
  assert.equal(issueKey(base), issueKey({ ...base }));
});

test("first run: all issues new", () => {
  const d = diffRuns([base], null);
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 0);
});

test("unchanged baseline", () => {
  const prior = load("prior-issues.json").issues;
  const d = diffRuns(prior, { issues: prior });
  assert.equal(d.unchanged.length, 2);
  assert.equal(d.new.length, 0);
});
