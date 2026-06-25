import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_EVAL_MODES,
  EVAL_REPORT_SCHEMA_VERSION,
  loadEvalFixtures,
  renderEvalMarkdown,
  runSkillUtilityEval,
  validateEvalFixture,
} from "../../scripts/skill-eval.mjs";

const NOW = new Date("2026-06-11T00:00:00.000Z");

test("skill eval loads documented fixture schema", () => {
  const fixtures = loadEvalFixtures({ root: process.cwd() });
  assert.equal(fixtures.length, 3);
  assert.deepEqual(fixtures.map((fixture) => fixture.id).sort(), [
    "backend-api-task",
    "docs-only-task",
    "small-web-ui-task",
  ]);
  for (const fixture of fixtures) {
    assert.equal(fixture.schemaVersion, "agent-skill-eval-fixture/v1");
    assert.ok(fixture.acceptanceCriteria.length > 0);
    assert.ok(fixture.modes.baseline);
    assert.ok(fixture.modes["agent-all"]);
  }
});

test("validateEvalFixture requires taskPrompt and checkerCmd when executable", () => {
  const base = {
    schemaVersion: "agent-skill-eval-fixture/v1",
    id: "x", title: "X", category: "docs-only", baselineFailure: "b",
    acceptanceCriteria: ["c"],
    modes: {
      baseline: { passed: false, iterations: 0, wallClockMs: 0, manualInterventions: 0, failedReviewerGates: 0, qualityDebtFindings: 0, rollbackCount: 0 },
      "agent-all": { passed: true, iterations: 0, wallClockMs: 0, manualInterventions: 0, failedReviewerGates: 0, qualityDebtFindings: 0, rollbackCount: 0 },
    },
    executable: true,
  };
  assert.throws(() => validateEvalFixture({ ...base }), /taskPrompt/);
  assert.throws(() => validateEvalFixture({ ...base, taskPrompt: "do it" }), /checkerCmd/);
  assert.doesNotThrow(() => validateEvalFixture({ ...base, taskPrompt: "do it", checkerCmd: "true" }));
});

test("skill eval smoke compares baseline and agent-all with cost telemetry summaries", () => {
  const result = runSkillUtilityEval({
    root: process.cwd(),
    suite: "smoke",
    now: NOW,
    write: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.report.schemaVersion, EVAL_REPORT_SCHEMA_VERSION);
  assert.equal(result.report.suite, "smoke");
  assert.deepEqual(result.report.modes, ["baseline", "agent-all"]);
  assert.equal(result.report.summary.fixtureCount, 3);
  assert.equal(result.report.summary.runCount, 6);

  const baseline = result.report.summary.modeSummary.find((mode) => mode.mode === "baseline");
  const agentAll = result.report.summary.modeSummary.find((mode) => mode.mode === "agent-all");
  assert.equal(baseline.passRate, 0.3333);
  assert.equal(agentAll.passRate, 1);
  assert.ok(agentAll.costOverheadUSD > 0);
  assert.ok(agentAll.costOverheadRatio > 1);

  const run = result.report.runs.find(
    (candidate) => candidate.fixtureId === "small-web-ui-task" && candidate.mode === "agent-all",
  );
  assert.equal(run.costTelemetry.summary.schemaVersion, "agent-cost-telemetry/v1-summary");
  assert.equal(run.metrics.tokenEstimate, 6300);
  assert.equal(run.metrics.costUSD, 0.0124);
});

test("skill eval full mode includes extended A/B modes", () => {
  const result = runSkillUtilityEval({
    root: process.cwd(),
    suite: "full",
    now: NOW,
    write: false,
  });

  assert.deepEqual(result.report.modes, DEFAULT_EVAL_MODES);
  assert.equal(result.report.summary.fixtureCount, 3);
  assert.equal(result.report.summary.runCount, 18);
  assert.ok(result.report.summary.modeSummary.some(
    (mode) => mode.mode === "agent-all+visual-qa" && mode.passRate === 1,
  ));
  assert.ok(result.report.summary.modeSummary.some(
    (mode) => mode.mode === "agent-all+verification-adapters" && mode.failedReviewerGates === 0,
  ));
});

test("skill eval writes summary, JSON, JSONL, and artifact manifest", () => {
  const root = process.cwd();
  const outDir = mkdtempSync(resolve(tmpdir(), "skill-eval-output-"));
  try {
    const result = runSkillUtilityEval({
      root,
      suite: "smoke",
      now: NOW,
      outputDir: outDir,
      write: true,
    });

    assert.equal(result.outputDir, outDir);
    assert.ok(existsSync(result.output.summaryMd));
    assert.ok(existsSync(result.output.summaryJson));
    assert.ok(existsSync(result.output.runsJsonl));
    assert.ok(existsSync(result.output.artifactManifest));
    const manifest = JSON.parse(readFileSync(result.output.artifactManifest, "utf-8"));
    assert.match(manifest.schemaVersion, /^agent-skill-eval-report\/v1-fixture-manifest/);
    assert.ok(Array.isArray(manifest.fixtures), "artifact manifest must have a fixtures array");
    assert.equal(manifest.fixtures.length, 3, "fixture manifest should list all 3 smoke fixtures");

    const summary = readFileSync(result.output.summaryMd, "utf-8");
    assert.match(summary, /Skill Utility Eval Summary/);
    assert.match(summary, /Cost Overhead vs Baseline/);

    const json = JSON.parse(readFileSync(result.output.summaryJson, "utf-8"));
    assert.equal(json.schemaVersion, EVAL_REPORT_SCHEMA_VERSION);
    assert.equal(json.runs.length, 6);

    const jsonl = readFileSync(result.output.runsJsonl, "utf-8").trim().split("\n");
    assert.equal(jsonl.length, 6);
    assert.equal(JSON.parse(jsonl[0]).schemaVersion, `${EVAL_REPORT_SCHEMA_VERSION}-run`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("skill eval CLI supports CI-safe JSON no-write mode", () => {
  const outDir = resolve(tmpdir(), `skill-eval-cli-${Date.now()}`);
  const res = spawnSync(process.execPath, [
    resolve("scripts/skill-eval.mjs"),
    "--smoke",
    "--no-write",
    "--json",
    "--date=2026-06-11",
    `--out-dir=${outDir}`,
  ], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.equal(existsSync(outDir), false);
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.output, null);
  assert.equal(payload.report.summary.runCount, 6);
  assert.match(renderEvalMarkdown(payload.report), /Smoke evals use representative fixtures/);
});
