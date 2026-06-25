#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeCostTelemetry } from "../plugins/harness-floor/skills/agent-all/lib/cost-telemetry.mjs";
import { buildRunRecord, writeRunRecordAtomic } from "../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";

export const EVAL_FIXTURE_SCHEMA_VERSION = "agent-skill-eval-fixture/v1";
export const EVAL_REPORT_SCHEMA_VERSION = "agent-skill-eval-report/v1";

export const DEFAULT_EVAL_MODES = [
  "baseline",
  "agent-all",
  "agent-all+visual-qa",
  "agent-all+quality-gate",
  "agent-all+dynamic-orchestration",
  "agent-all+verification-adapters",
];

export const SMOKE_EVAL_MODES = ["baseline", "agent-all"];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FIXTURES_DIR = "tests/fixtures/evals";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertNumber(value, label) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

function validateModeResult(fixture, mode, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${fixture.id}.${mode} must be an object`);
  }
  if (typeof result.passed !== "boolean") {
    throw new Error(`${fixture.id}.${mode}.passed must be boolean`);
  }
  for (const key of [
    "iterations",
    "wallClockMs",
    "manualInterventions",
    "failedReviewerGates",
    "qualityDebtFindings",
    "rollbackCount",
  ]) {
    assertNumber(result[key] ?? 0, `${fixture.id}.${mode}.${key}`);
  }
  const telemetry = result.telemetryRecords ?? result.telemetry ?? [];
  if (!Array.isArray(telemetry)) {
    throw new Error(`${fixture.id}.${mode}.telemetryRecords must be an array`);
  }
}

export function validateEvalFixture(fixture, source = "fixture") {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new Error(`${source} must be a JSON object`);
  }
  if (fixture.schemaVersion !== EVAL_FIXTURE_SCHEMA_VERSION) {
    throw new Error(`${source} must use schemaVersion ${EVAL_FIXTURE_SCHEMA_VERSION}`);
  }
  for (const key of ["id", "title", "category", "baselineFailure"]) {
    assertString(fixture[key], `${source}.${key}`);
  }
  if (!Array.isArray(fixture.acceptanceCriteria) || fixture.acceptanceCriteria.length === 0) {
    throw new Error(`${source}.acceptanceCriteria must be a non-empty array`);
  }
  if (!fixture.modes || typeof fixture.modes !== "object" || Array.isArray(fixture.modes)) {
    throw new Error(`${source}.modes must be an object`);
  }
  for (const required of ["baseline", "agent-all"]) {
    if (!fixture.modes[required]) {
      throw new Error(`${source}.modes.${required} is required`);
    }
  }
  for (const [mode, result] of Object.entries(fixture.modes)) {
    validateModeResult(fixture, mode, result);
  }
  if (fixture.executable === true) {
    assertString(fixture.taskPrompt, `${source}.taskPrompt`);
    assertString(fixture.checkerCmd, `${source}.checkerCmd`);
  }
  return fixture;
}

export function loadEvalFixtures({
  root = ROOT,
  fixturesDir = resolve(root, DEFAULT_FIXTURES_DIR),
  fixtureIds = [],
} = {}) {
  const dir = resolve(fixturesDir);
  if (!existsSync(dir)) {
    throw new Error(`Eval fixture directory does not exist: ${dir}`);
  }
  const wanted = new Set(asList(fixtureIds));
  const fixtures = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const path = resolve(dir, file);
      return validateEvalFixture({ ...readJson(path), sourceFile: path }, path);
    })
    .filter((fixture) => wanted.size === 0 || wanted.has(fixture.id));

  if (fixtures.length === 0) {
    throw new Error(wanted.size > 0
      ? `No eval fixtures matched: ${[...wanted].join(", ")}`
      : `No eval fixtures found in ${dir}`);
  }
  return fixtures;
}

function selectedModes({ suite = "smoke", modes = [] } = {}) {
  const explicit = asList(modes);
  if (explicit.length > 0) return explicit;
  return suite === "full" ? DEFAULT_EVAL_MODES : SMOKE_EVAL_MODES;
}

function selectedFixtures(fixtures, { suite = "smoke" } = {}) {
  return suite === "full" ? fixtures : fixtures.filter((fixture) => fixture.smoke !== false);
}

function metricNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function rounded(value, places = 6) {
  return Number(Number(value || 0).toFixed(places));
}

function buildRun(fixture, mode, options = {}) {
  const result = fixture.modes[mode];
  if (!result) return null;

  const telemetryRecords = result.telemetryRecords ?? result.telemetry ?? [];
  const costSummary = summarizeCostTelemetry(telemetryRecords, options.costTelemetry ?? {});
  const metrics = {
    passed: result.passed,
    iterations: metricNumber(result.iterations),
    tokenEstimate: costSummary.totalTokens,
    costUSD: costSummary.totalUSD,
    wallClockMs: metricNumber(result.wallClockMs),
    manualInterventions: metricNumber(result.manualInterventions),
    failedReviewerGates: metricNumber(result.failedReviewerGates),
    qualityDebtFindings: metricNumber(result.qualityDebtFindings),
    rollbackCount: metricNumber(result.rollbackCount),
  };

  return {
    schemaVersion: `${EVAL_REPORT_SCHEMA_VERSION}-run`,
    runId: `${fixture.id}:${mode}`,
    fixtureId: fixture.id,
    fixtureTitle: fixture.title,
    category: fixture.category,
    mode,
    passed: metrics.passed,
    metrics,
    costTelemetry: {
      summary: costSummary,
    },
    notes: Array.isArray(result.notes) ? result.notes : [],
  };
}

function mean(values) {
  const nums = values.map(Number).filter((value) => Number.isFinite(value));
  if (nums.length === 0) return 0;
  return rounded(nums.reduce((sum, value) => sum + value, 0) / nums.length, 3);
}

function buildModeSummary(runs, modes) {
  const baselineCostByFixture = new Map(
    runs
      .filter((run) => run.mode === "baseline")
      .map((run) => [run.fixtureId, run.metrics.costUSD]),
  );

  return modes.map((mode) => {
    const modeRuns = runs.filter((run) => run.mode === mode);
    const baselineComparableCost = modeRuns.reduce(
      (sum, run) => sum + (baselineCostByFixture.get(run.fixtureId) ?? 0),
      0,
    );
    const totalCost = rounded(modeRuns.reduce((sum, run) => sum + run.metrics.costUSD, 0));
    const passed = modeRuns.filter((run) => run.passed).length;
    const costOverheadUSD = rounded(totalCost - baselineComparableCost);

    return {
      mode,
      runs: modeRuns.length,
      passed,
      passRate: modeRuns.length > 0 ? rounded(passed / modeRuns.length, 4) : null,
      meanIterations: mean(modeRuns.map((run) => run.metrics.iterations)),
      meanWallClockMs: mean(modeRuns.map((run) => run.metrics.wallClockMs)),
      totalTokens: modeRuns.reduce((sum, run) => sum + run.metrics.tokenEstimate, 0),
      totalCostUSD: totalCost,
      costOverheadUSD,
      costOverheadRatio: baselineComparableCost > 0
        ? rounded(totalCost / baselineComparableCost, 4)
        : null,
      manualInterventions: modeRuns.reduce((sum, run) => sum + run.metrics.manualInterventions, 0),
      failedReviewerGates: modeRuns.reduce((sum, run) => sum + run.metrics.failedReviewerGates, 0),
      qualityDebtFindings: modeRuns.reduce((sum, run) => sum + run.metrics.qualityDebtFindings, 0),
      rollbackCount: modeRuns.reduce((sum, run) => sum + run.metrics.rollbackCount, 0),
    };
  });
}

function attachRunOverhead(runs) {
  const baselineCostByFixture = new Map(
    runs
      .filter((run) => run.mode === "baseline")
      .map((run) => [run.fixtureId, run.metrics.costUSD]),
  );
  for (const run of runs) {
    const baseline = baselineCostByFixture.get(run.fixtureId) ?? 0;
    run.metrics.costOverheadUSD = rounded(run.metrics.costUSD - baseline);
    run.metrics.costOverheadRatio = baseline > 0
      ? rounded(run.metrics.costUSD / baseline, 4)
      : null;
  }
  return runs;
}

export function buildEvalReport({
  fixtures,
  suite = "smoke",
  modes = [],
  now = new Date(),
  costTelemetry = {},
} = {}) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    throw new Error("fixtures must be a non-empty array");
  }
  const generatedAt = now instanceof Date ? now.toISOString() : String(now);
  const chosenModes = selectedModes({ suite, modes });
  const chosenFixtures = selectedFixtures(fixtures, { suite });
  const runs = attachRunOverhead(
    chosenFixtures.flatMap((fixture) => chosenModes.map((mode) => buildRun(fixture, mode, { costTelemetry })))
      .filter(Boolean),
  );
  if (runs.length === 0) {
    throw new Error("No eval runs were produced; check selected fixtures and modes");
  }

  const modeSummary = buildModeSummary(runs, chosenModes);
  return {
    schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
    generatedAt,
    suite,
    modes: chosenModes,
    fixtures: chosenFixtures.map((fixture) => ({
      id: fixture.id,
      title: fixture.title,
      category: fixture.category,
      smoke: fixture.smoke !== false,
      acceptanceCriteria: fixture.acceptanceCriteria,
      baselineFailure: fixture.baselineFailure,
    })),
    summary: {
      fixtureCount: chosenFixtures.length,
      runCount: runs.length,
      modeSummary,
    },
    runs,
  };
}

function markdownEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function percent(value) {
  return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function usd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

export function renderEvalMarkdown(report) {
  const lines = [
    "# Skill Utility Eval Summary",
    "",
    `- Schema: \`${report.schemaVersion}\``,
    `- Suite: \`${report.suite}\``,
    `- Generated: ${report.generatedAt}`,
    `- Fixtures: ${report.summary.fixtureCount}`,
    `- Runs: ${report.summary.runCount}`,
    `- Modes: ${report.modes.map((mode) => `\`${mode}\``).join(", ")}`,
    "",
    "## Mode Summary",
    "",
    "| Mode | Pass Rate | Mean Iterations | Cost | Cost Overhead vs Baseline | Manual Interventions | Failed Reviewer Gates | Quality Debt Findings |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const mode of report.summary.modeSummary) {
    lines.push([
      markdownEscape(mode.mode),
      percent(mode.passRate),
      mode.meanIterations,
      usd(mode.totalCostUSD),
      `${usd(mode.costOverheadUSD)} (${mode.costOverheadRatio === null ? "n/a" : `${mode.costOverheadRatio}x`})`,
      mode.manualInterventions,
      mode.failedReviewerGates,
      mode.qualityDebtFindings,
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Fixture Runs",
    "",
    "| Fixture | Mode | Result | Iterations | Tokens | Cost | Overhead |",
    "|---|---|---:|---:|---:|---:|---:|",
  );

  for (const run of report.runs) {
    lines.push([
      markdownEscape(run.fixtureId),
      markdownEscape(run.mode),
      run.passed ? "pass" : "fail",
      run.metrics.iterations,
      run.metrics.tokenEstimate,
      usd(run.metrics.costUSD),
      `${usd(run.metrics.costOverheadUSD)} (${run.metrics.costOverheadRatio === null ? "n/a" : `${run.metrics.costOverheadRatio}x`})`,
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Scope",
    "",
    "Smoke evals use representative fixtures and the baseline/agent-all modes only.",
    "Full evals include the extended visual QA, quality gate, dynamic orchestration, and verification-adapter modes.",
    "The runner consumes numeric cost telemetry records and does not call model APIs by itself.",
    "",
  );

  return `${lines.join("\n")}`;
}

export function writeEvalReport(report, outputDir) {
  const dir = resolve(outputDir);
  const artifactsDir = join(dir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  const paths = {
    summaryMd: join(dir, "summary.md"),
    summaryJson: join(dir, "summary.json"),
    runsJsonl: join(dir, "runs.jsonl"),
    artifactManifest: join(artifactsDir, "fixture-manifest.json"),
  };
  writeFileSync(paths.summaryMd, renderEvalMarkdown(report), "utf-8");
  writeFileSync(paths.summaryJson, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  writeFileSync(paths.runsJsonl, `${report.runs.map((run) => JSON.stringify(run)).join("\n")}\n`, "utf-8");
  writeFileSync(paths.artifactManifest, `${JSON.stringify({
    schemaVersion: `${EVAL_REPORT_SCHEMA_VERSION}-fixture-manifest`,
    generatedAt: report.generatedAt,
    fixtures: report.fixtures,
  }, null, 2)}\n`, "utf-8");
  return paths;
}

export function runSkillUtilityEval({
  root = ROOT,
  fixturesDir = resolve(root, DEFAULT_FIXTURES_DIR),
  fixtureIds = [],
  suite = "smoke",
  modes = [],
  now = new Date(),
  date = null,
  outputDir = null,
  write = true,
  costTelemetry = {},
} = {}) {
  const fixtures = loadEvalFixtures({ root, fixturesDir, fixtureIds });
  const report = buildEvalReport({ fixtures, suite, modes, now, costTelemetry });
  const day = date || report.generatedAt.slice(0, 10);
  const dir = outputDir || resolve(root, ".agent-skill/evals", day);
  const output = write ? writeEvalReport(report, dir) : null;
  return {
    ok: true,
    outputDir: dir,
    output,
    report,
  };
}

function parseFlagValue(arg, argv, index) {
  const eq = arg.indexOf("=");
  if (eq !== -1) return { value: arg.slice(eq + 1), nextIndex: index };
  if (index + 1 >= argv.length) {
    throw new Error(`Missing value for ${arg}`);
  }
  return { value: argv[index + 1], nextIndex: index + 1 };
}

export function parseArgs(argv = []) {
  const options = {
    root: ROOT,
    suite: "smoke",
    fixtureIds: [],
    modes: [],
    write: true,
    json: false,
    help: false,
    record: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--smoke" || arg === "--ci-smoke") {
      options.suite = "smoke";
    } else if (arg === "--full") {
      options.suite = "full";
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-write") {
      options.write = false;
    } else if (arg.startsWith("--root")) {
      const parsed = parseFlagValue(arg, argv, i);
      options.root = resolve(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith("--fixtures-dir")) {
      const parsed = parseFlagValue(arg, argv, i);
      options.fixturesDir = resolve(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith("--out-dir")) {
      const parsed = parseFlagValue(arg, argv, i);
      options.outputDir = resolve(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith("--date")) {
      const parsed = parseFlagValue(arg, argv, i);
      options.date = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith("--fixture")) {
      const parsed = parseFlagValue(arg, argv, i);
      options.fixtureIds.push(...asList(parsed.value));
      i = parsed.nextIndex;
    } else if (arg.startsWith("--mode")) {
      const parsed = parseFlagValue(arg, argv, i);
      options.modes.push(...asList(parsed.value));
      i = parsed.nextIndex;
    } else if (arg === "--record") {
      options.record = true;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!options.fixturesDir) {
    options.fixturesDir = resolve(options.root, DEFAULT_FIXTURES_DIR);
  }
  return options;
}

// Default production runner: run the mode against the fixture's taskPrompt in an
// isolated temp dir. Opt-in only — never invoked by smoke CI. (Heavy; injected in tests.)
function defaultRunMode(fixture, mode) {
  const work = mkdtempSync(join(tmpdir(), `eval-${fixture.id}-${mode}-`));
  // baseline = plain prompt; agent-all = the skill. The orchestrator wires the
  // actual CLI invocation here; it must NOT touch the live working tree.
  // Returns real telemetry + outcome scraped from the run's artifacts.
  // (Implementation invokes `claude -p` / the agent-all skill in `work`.)
  return { telemetryRecords: [], outcome: {}, workDir: work };
}

function defaultChecker(fixture, workDir) {
  try {
    execFileSync("sh", ["-c", fixture.checkerCmd], { cwd: workDir, stdio: "ignore" });
    return true;
  } catch { return false; }
}

export function recordCanonicalRun(fixture, mode, { runMode = defaultRunMode, checker = defaultChecker, cwd = process.cwd(), now = new Date() } = {}) {
  validateEvalFixture(fixture);
  const { telemetryRecords = [], outcome = {}, workDir } = runMode(fixture, mode) ?? {};
  const passed = checker(fixture, workDir ?? cwd);
  const record = buildRunRecord({
    runId: `${fixture.id}:${mode}`,
    ts: now instanceof Date ? now.toISOString() : String(now),
    source: "eval-live",
    taskCategory: fixture.category,
    scaffold: { profile: mode === "baseline" ? "lite" : "operational", roster: [] },
    outcome: { ...outcome, passed },
    telemetryRecords,
  });
  writeRunRecordAtomic(record, { cwd });
  return { passed, telemetryRecords, outcome: record.outcome };
}

function usage() {
  return [
    "Usage: node scripts/skill-eval.mjs [--smoke|--full] [--json] [--no-write]",
    "",
    "Options:",
    "  --smoke, --ci-smoke       Run the small CI-safe fixture/mode subset (default).",
    "  --full                    Run all available fixture modes.",
    "  --fixture=<id[,id]>       Limit to one or more fixture ids.",
    "  --mode=<name[,name]>      Limit to one or more modes.",
    "  --fixtures-dir=<path>     Read fixture JSON files from a custom directory.",
    "  --out-dir=<path>          Write summary.md, summary.json, runs.jsonl, artifacts/.",
    "  --date=<YYYY-MM-DD>       Use a stable default .agent-skill/evals/<date>/ directory.",
    "  --no-write                Build the report without writing files.",
    "  --json                    Print the report payload as JSON.",
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = runSkillUtilityEval(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`skill eval: ok (${result.report.suite}, ${result.report.summary.runCount} runs)`);
    if (result.output) {
      console.log(`summary: ${result.output.summaryMd}`);
      console.log(`runs: ${result.output.runsJsonl}`);
    } else {
      console.log("no files written");
    }
  }
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
