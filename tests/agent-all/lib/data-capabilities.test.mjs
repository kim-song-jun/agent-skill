import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { compareArtifacts } from "../../../plugins/harness-floor/skills/agent-all/lib/data/artifact-diff.mjs";
import { inspectNotebooks } from "../../../plugins/harness-floor/skills/agent-all/lib/data/notebook-runner.mjs";
import {
  evaluateSqlAssertions,
  validateSqlPlan,
} from "../../../plugins/harness-floor/skills/agent-all/lib/data/sql-validator.mjs";

function fixtureDir(seed) {
  return mkdtempSync(resolve(tmpdir(), `data-capabilities-${seed}-`));
}

test("notebook inspector reports cell error outputs", () => {
  const dir = fixtureDir("notebook");
  writeFileSync(resolve(dir, "analysis.ipynb"), JSON.stringify({
    cells: [
      { cell_type: "code", execution_count: 1, outputs: [{ output_type: "stream", text: "ok" }] },
      { cell_type: "code", execution_count: 2, outputs: [{ output_type: "error", ename: "ValueError", evalue: "bad data" }] },
    ],
  }));

  const result = inspectNotebooks({ cwd: dir, notebooks: ["analysis.ipynb"] });

  assert.equal(result.ok, false);
  assert.equal(result.notebooks[0].cellCount, 2);
  assert.equal(result.failures[0].id, "notebook-cell-error");
  assert.match(result.failures[0].message, /ValueError: bad data/);
});

test("artifact diff compares CSV shape and JSON metric thresholds", () => {
  const dir = fixtureDir("artifacts");
  mkdirSync(resolve(dir, "baseline"));
  mkdirSync(resolve(dir, "current"));
  writeFileSync(resolve(dir, "baseline/summary.csv"), "name,count\nok,1\n");
  writeFileSync(resolve(dir, "current/summary.csv"), "name,count\nok,1\nwarn,2\n");
  writeFileSync(resolve(dir, "current/metrics.json"), JSON.stringify({ accuracy: 0.98 }));

  const result = compareArtifacts({
    cwd: dir,
    requiredArtifacts: ["current/summary.csv"],
    artifactDiff: {
      pairs: [{ baseline: "baseline/summary.csv", current: "current/summary.csv", allowRowDelta: 1 }],
      metrics: [{ id: "accuracy", path: "current/metrics.json", jsonPath: "accuracy", min: 0.95 }],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.metadata.diffs[0].current.rows, 2);
  assert.equal(result.metadata.metrics[0].actual, 0.98);
});

test("SQL validator blocks destructive SQL and evaluates runner assertions", () => {
  const dir = fixtureDir("sql");
  mkdirSync(resolve(dir, "queries"));
  writeFileSync(resolve(dir, "queries/delete.sql"), "DELETE FROM events;\n");

  const blocked = validateSqlPlan({
    cwd: dir,
    files: ["queries/delete.sql"],
    allowDestructive: false,
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.failures[0].id, "destructive-sql");

  const assertions = evaluateSqlAssertions([
    { id: "users-row-count", type: "row-count", expected: 3 },
    { id: "users-schema", type: "schema", expected: ["id", "email"] },
    { id: "email-null-count", type: "null-count" },
  ], {
    rowCount: 3,
    schema: ["id", "email"],
    nullCounts: { "email-null-count": 0 },
  });

  assert.equal(assertions.ok, true);
  assert.equal(assertions.assertions.length, 3);
});
