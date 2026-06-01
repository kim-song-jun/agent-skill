import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const phase3 = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/3-dispatch.md"), "utf8");
const phase4 = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/4-gate.md"), "utf8");

test("phase 3 records the pre-wave base commit before implementation", () => {
  const baseCommit = phase3.indexOf("baseCommit");
  const implementation = phase3.indexOf("3c — Implementation");
  const waveResult = phase3.indexOf("Capture wave result");

  assert.notEqual(baseCommit, -1);
  assert.notEqual(implementation, -1);
  assert.notEqual(waveResult, -1);
  assert.ok(baseCommit < implementation);
  assert.ok(waveResult > implementation);
  assert.match(phase3, /baseCommit.*git rev-parse HEAD/i);
  assert.match(phase3, /baseCommit.*startCommit.*endCommit/s);
});

test("phase 4 diffs from baseCommit and includes the first wave commit in fallback ranges", () => {
  assert.doesNotMatch(phase4, /git diff(?: --name-only)? <wave\.startCommit>\.\.<wave\.endCommit>/);
  assert.match(phase4, /git diff <wave\.baseCommit>\.\.<wave\.endCommit>/);
  assert.match(phase4, /git diff --name-only <wave\.baseCommit>\.\.<wave\.endCommit>/);
  assert.match(phase4, /older state without `baseCommit`/i);
  assert.match(phase4, /<wave\.startCommit>\^\.\.<wave\.endCommit>/);
  assert.match(phase4, /root commit/i);
  assert.match(phase4, /empty-tree/i);
});

test("phase 4 routes spec review through the generated reviewer persona", () => {
  assert.doesNotMatch(phase4, /spec-reviewer/);
  assert.match(phase4, /buildGatePlan/);
  assert.match(phase4, /classifyChangedFiles\(files\)/);
  assert.match(phase4, /mode=spec/i);
  assert.match(phase4, /Spec Review Task <N>: <title>/);
});
