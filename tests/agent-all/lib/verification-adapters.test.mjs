import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  normalizeAdapterId,
  normalizeEvidence,
  validateEvidence,
  summarizeEvidence,
} from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/schema.mjs";
import {
  appendVerificationEvidence,
  verificationEvidencePath,
} from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/evidence-writer.mjs";
import {
  detectVerificationAdapters,
  getVerificationAdapter,
  runVerificationAdapterSpec,
  supportedVerificationAdapterIds,
} from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/registry.mjs";

function fixtureDir(seed) {
  return mkdtempSync(resolve(tmpdir(), `verification-adapters-${seed}-`));
}

test("schema normalizes adapter aliases and validates evidence", () => {
  assert.equal(normalizeAdapterId("cli"), "verify:cli");
  assert.equal(normalizeAdapterId("visual-qa"), "verify:web-ui");
  assert.equal(normalizeAdapterId("verify:sql-db"), "verify:sql-db");
  assert.equal(normalizeAdapterId("rocket"), null);

  const evidence = normalizeEvidence({
    adapter: "cli",
    status: "passed",
    summary: "CLI passed",
    failures: [{ message: "not used" }],
  });
  assert.equal(evidence.adapter, "verify:cli");
  assert.equal(evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(validateEvidence(evidence).length, 0);
  assert.equal(summarizeEvidence(evidence), "verify:cli passed: CLI passed; failures=1");
});

test("registry exposes the required MVP adapters", () => {
  assert.deepEqual(supportedVerificationAdapterIds(), [
    "verify:web-ui",
    "verify:cli",
    "verify:api-contract",
    "verify:notebook-data",
    "verify:sql-db",
    "verify:batch-job",
  ]);
  for (const id of supportedVerificationAdapterIds()) {
    const adapter = getVerificationAdapter(id);
    assert.equal(adapter.id, id);
    assert.equal(typeof adapter.detect, "function");
    assert.equal(typeof adapter.plan, "function");
    assert.equal(typeof adapter.run, "function");
    assert.equal(typeof adapter.summarize, "function");
  }
});

test("detectVerificationAdapters ranks project-specific adapters", async () => {
  const dir = fixtureDir("detect");
  writeFileSync(resolve(dir, ".visual-qa.json"), "{}\n");
  writeFileSync(resolve(dir, "package.json"), JSON.stringify({ bin: { demo: "bin/demo.js" } }));
  writeFileSync(resolve(dir, "openapi.json"), JSON.stringify({ openapi: "3.1.0", paths: {} }));
  writeFileSync(resolve(dir, "analysis.ipynb"), "{}\n");

  const results = await detectVerificationAdapters({ cwd: dir });
  assert.ok(results.some((result) => result.adapter === "verify:web-ui"));
  assert.ok(results.some((result) => result.adapter === "verify:cli"));
  assert.ok(results.some((result) => result.adapter === "verify:api-contract"));
  assert.ok(results.some((result) => result.adapter === "verify:notebook-data"));
});

test("verify:cli checks exit code and golden stdout", async () => {
  const dir = fixtureDir("cli");
  writeFileSync(resolve(dir, "golden.txt"), "hello\n");
  const runner = async () => ({ exitCode: 0, stdout: "hello\n", stderr: "" });
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "cli",
    config: { command: "demo --help", goldenStdoutPath: "golden.txt" },
  }, { cwd: dir }, runner);

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.status, "passed");
  assert.equal(result.evidence.command, "demo --help");
  assert.match(result.verifierSummary, /golden stdout passed/);
});

test("verify:cli fails on golden stdout mismatch", async () => {
  const dir = fixtureDir("cli-mismatch");
  writeFileSync(resolve(dir, "golden.txt"), "expected\n");
  const runner = async () => ({ exitCode: 0, stdout: "actual\n", stderr: "" });
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "verify:cli",
    config: { command: "demo", golden: "golden.txt" },
  }, { cwd: dir }, runner);

  assert.equal(result.exitCode, 1);
  assert.equal(result.evidence.status, "failed");
  assert.equal(result.evidence.failures[0].id, "golden-diff");
});

test("verify:api-contract validates a minimal OpenAPI JSON spec", async () => {
  const dir = fixtureDir("api");
  writeFileSync(resolve(dir, "openapi.json"), JSON.stringify({ openapi: "3.1.0", paths: { "/health": { get: {} } } }));
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "api-contract",
    config: { spec: "openapi.json" },
  }, { cwd: dir });

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.status, "passed");
  assert.deepEqual(result.evidence.artifacts, ["openapi.json"]);
});

test("verify:notebook-data passes when required notebook artifacts exist", async () => {
  const dir = fixtureDir("notebook");
  mkdirSync(resolve(dir, "outputs"));
  writeFileSync(resolve(dir, "analysis.ipynb"), JSON.stringify({ cells: [] }));
  writeFileSync(resolve(dir, "outputs/summary.csv"), "name,count\nok,1\n");
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "notebook-data",
    config: {
      notebooks: ["analysis.ipynb"],
      requiredArtifacts: ["outputs/summary.csv"],
      seed: "42",
      dataSnapshot: "fixture-v1",
    },
  }, { cwd: dir });

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.status, "passed");
  assert.equal(result.evidence.reproducibility.seed, "42");
  assert.equal(result.evidence.reproducibility.dataSnapshot, "fixture-v1");
  assert.equal(result.evidence.metadata.notebooks[0].errorCount, 0);
});

test("verify:notebook-data records command, artifact diff, and environment evidence", async () => {
  const dir = fixtureDir("notebook-evidence");
  mkdirSync(resolve(dir, "baseline"));
  mkdirSync(resolve(dir, "outputs"));
  writeFileSync(resolve(dir, "analysis.ipynb"), JSON.stringify({ cells: [{ cell_type: "code", execution_count: 1, outputs: [] }] }));
  writeFileSync(resolve(dir, "baseline/summary.csv"), "name,count\nok,1\n");
  writeFileSync(resolve(dir, "outputs/summary.csv"), "name,count\nok,1\n");
  const runner = async () => ({
    exitCode: 0,
    stdout: JSON.stringify({
      summary: "notebook clean run passed",
      seed: "123",
      dataSnapshot: "snapshot-a",
      artifacts: ["outputs/summary.csv"],
    }),
    stderr: "",
  });

  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "notebook-data",
    config: {
      command: "jupyter nbconvert --execute analysis.ipynb",
      notebooks: ["analysis.ipynb"],
      artifactDiff: {
        pairs: [{ baseline: "baseline/summary.csv", current: "outputs/summary.csv" }],
      },
    },
  }, { cwd: dir, runId: "data-run", writeEvidence: true }, runner);

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.command, "jupyter nbconvert --execute analysis.ipynb");
  assert.equal(result.evidence.summary, "notebook clean run passed");
  assert.equal(result.evidence.reproducibility.environment.node, process.version);
  assert.equal(result.evidence.metadata.artifactDiff.diffs[0].current.rows, 1);
  assert.equal(existsSync(result.evidenceLog.path), true);
});

test("verify:sql-db blocks destructive SQL without explicit opt-in", async () => {
  const dir = fixtureDir("sql");
  mkdirSync(resolve(dir, "queries"));
  writeFileSync(resolve(dir, "queries/validate.sql"), "DELETE FROM users;\n");
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "sql-db",
    config: { files: ["queries/validate.sql"] },
  }, { cwd: dir });

  assert.equal(result.exitCode, 1);
  assert.equal(result.evidence.status, "blocked");
  assert.equal(result.evidence.failures[0].id, "destructive-sql");
});

test("verify:sql-db records validation assertions and explain artifacts", async () => {
  const dir = fixtureDir("sql-evidence");
  mkdirSync(resolve(dir, "queries"));
  mkdirSync(resolve(dir, "reports"));
  writeFileSync(resolve(dir, "queries/validate.sql"), "SELECT COUNT(*) FROM users;\n");
  writeFileSync(resolve(dir, "reports/explain.txt"), "Seq Scan users\n");
  const runner = async () => ({
    exitCode: 0,
    stdout: JSON.stringify({
      summary: "SQL validation passed",
      rowCount: 2,
      schema: ["id", "email"],
      explainPlanPath: "reports/explain.txt",
    }),
    stderr: "",
  });

  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "sql-db",
    config: {
      files: ["queries/validate.sql"],
      command: "npm run validate:sql",
      assertions: [
        { id: "users-row-count", type: "row-count", expected: 2 },
        { id: "users-schema", type: "schema", expected: ["id", "email"] },
      ],
    },
  }, { cwd: dir, runId: "sql-run", writeEvidence: true }, runner);

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.status, "passed");
  assert.equal(result.evidence.summary, "SQL validation passed");
  assert.deepEqual(result.evidence.artifacts.sort(), ["queries/validate.sql", "reports/explain.txt"].sort());
  assert.equal(result.evidence.metadata.assertions[0].passed, true);
  assert.equal(existsSync(result.evidenceLog.path), true);
});

test("verify:batch-job runs command and checks required artifacts", async () => {
  const dir = fixtureDir("batch");
  mkdirSync(resolve(dir, "out"));
  writeFileSync(resolve(dir, "out/done.txt"), "ok\n");
  const runner = async () => ({ exitCode: 0, stdout: "done\n", stderr: "" });
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "batch-job",
    config: { command: "make batch", requiredArtifacts: ["out/done.txt"] },
  }, { cwd: dir }, runner);

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.status, "passed");
  assert.deepEqual(result.evidence.artifacts, ["out/done.txt"]);
});

test("legacy web-ui adapter wraps visual-qa result evidence", async () => {
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "visual-qa",
    config: { slug: "loop-iter-1" },
  }, {
    visualQaResult: {
      exitCode: 0,
      summary: "visual QA passed",
      artifacts: [".agent-skill/reports/visual-qa/loop-iter-1/report.md"],
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.adapter, "verify:web-ui");
  assert.equal(result.evidence.status, "passed");
  assert.deepEqual(result.evidence.artifacts, [".agent-skill/reports/visual-qa/loop-iter-1/report.md"]);
});

test("runVerificationAdapterSpec appends standard evidence JSONL when requested", async () => {
  const dir = fixtureDir("evidence");
  writeFileSync(resolve(dir, "golden.txt"), "ok\n");
  const runner = async () => ({ exitCode: 0, stdout: "ok\n", stderr: "" });
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "cli",
    config: { command: "demo", golden: "golden.txt" },
  }, { cwd: dir, runId: "run/1", writeEvidence: true }, runner);

  assert.equal(result.exitCode, 0);
  assert.equal(result.evidenceLog.path, verificationEvidencePath({ cwd: dir, runId: "run/1" }));
  assert.equal(existsSync(result.evidenceLog.path), true);
  const lines = readFileSync(result.evidenceLog.path, "utf-8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).schemaVersion, "verification-evidence/v1");
});

test("runVerificationAdapterSpec emits before and after verification policy audit events", async () => {
  const dir = fixtureDir("policy-audit");
  const runner = async () => ({ exitCode: 0, stdout: "ok\n", stderr: "" });
  const result = await runVerificationAdapterSpec({
    type: "verification-adapter",
    adapter: "cli",
    config: { command: "demo" },
  }, {
    cwd: dir,
    runId: "verify-run",
    platform: "codex",
    writeEvidence: true,
  }, runner);

  assert.equal(result.exitCode, 0);
  const policyLog = readFileSync(resolve(dir, ".agent-skill/runs/verify-run/policy-log.jsonl"), "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(policyLog.map((entry) => entry.event), ["BeforeVerification", "AfterVerification"]);
  assert.deepEqual(policyLog.map((entry) => entry.platform), ["codex", "codex"]);
  assert.equal(policyLog[1].payloadKeys.includes("verificationEvidence"), true);
});

test("appendVerificationEvidence writes normalized evidence entries", () => {
  const dir = fixtureDir("append");
  const entry = appendVerificationEvidence({
    adapter: "api",
    status: "passed",
    summary: "contract passed",
  }, { cwd: dir, runId: "abc", timestamp: "2026-06-11T00:00:00.000Z" });

  assert.equal(entry.evidence.adapter, "verify:api-contract");
  assert.equal(entry.evidence.timestamp, "2026-06-11T00:00:00.000Z");
  const writtenEntry = JSON.parse(readFileSync(entry.path, "utf-8").trim().split("\n").at(-1));
  assert.equal(writtenEntry.summary, "contract passed");
  assert.equal(writtenEntry.schemaVersion, "verification-evidence/v1");
});

test("appendVerificationEvidence masks medium privacy findings before JSONL write", () => {
  const dir = fixtureDir("append-redact-medium");
  const entry = appendVerificationEvidence({
    adapter: "cli",
    status: "passed",
    summary: "Contact jane.doe@example.com for the runbook.",
  }, { cwd: dir, runId: "abc", timestamp: "2026-06-11T00:00:00.000Z" });

  const text = readFileSync(entry.path, "utf-8");
  assert.match(text, /\[REDACTED:email-address\]/);
  assert.doesNotMatch(text, /jane\.doe@example\.com/);
  assert.equal(entry.redactionAudit.entry.redactions[0].rule, "email-address");
});

test("appendVerificationEvidence blocks high severity secrets and writes sanitized audit", () => {
  const dir = fixtureDir("append-redact-high");

  assert.throws(
    () => appendVerificationEvidence({
      adapter: "cli",
      status: "failed",
      summary: "Authorization failed with Bearer abcdefghijklmnopqrstuvwxyz123456",
    }, { cwd: dir, runId: "secret-run", timestamp: "2026-06-11T00:00:00.000Z" }),
    /redaction gate blocked/,
  );

  const evidencePath = verificationEvidencePath({ cwd: dir, runId: "secret-run" });
  assert.equal(existsSync(evidencePath), false);
  const auditPath = resolve(dir, ".agent-skill/runs/secret-run/redaction-audit.jsonl");
  assert.equal(existsSync(auditPath), true);
  const auditText = readFileSync(auditPath, "utf-8");
  assert.match(auditText, /"rule":"bearer-token"/);
  assert.doesNotMatch(auditText, /abcdefghijklmnopqrstuvwxyz123456/);
});
