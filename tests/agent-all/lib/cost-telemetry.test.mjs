import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCostTelemetry,
  budgetStatus,
  costTelemetryLogPath,
  createCostTelemetry,
  enrichUsageRecord,
  summarizeCostTelemetry,
} from "../../../plugins/harness-floor/skills/agent-all/lib/cost-telemetry.mjs";

function tempProject() {
  return mkdtempSync(join(tmpdir(), "cost-telemetry-"));
}

test("reported platform cost wins over estimates", () => {
  const record = enrichUsageRecord({
    platform: "codex",
    model: "gpt-test",
    costUSD: 1.25,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }, {
    modelRates: { "gpt-test": { input: 100, output: 100 } },
  });

  assert.equal(record.costUSD, 1.25);
  assert.equal(record.estimateSource, "reported");
});

test("estimates token cost from project-owned model rates", () => {
  const record = enrichUsageRecord({
    platform: "claude",
    model: "local-rate",
    promptTokens: 1000,
    cachedInputTokens: 200,
    completionTokens: 500,
  }, {
    modelRates: {
      "local-rate": { input: 2, cachedInput: 0.2, output: 8 },
    },
  });

  assert.equal(record.estimateSource, "estimated_tokens");
  assert.equal(record.costUSD, 0.00564);
  assert.deepEqual(record.estimateBreakdown, {
    inputUSD: 0.0016,
    cachedInputUSD: 0.00004,
    outputUSD: 0.004,
  });
});

test("falls back to output size estimate without storing raw text", () => {
  const record = enrichUsageRecord({
    platform: "copilot",
    output: "x".repeat(2000),
  }, {
    fallbackUSDPerKChar: 0.01,
  });

  assert.equal(record.estimateSource, "estimated_chars");
  assert.equal(record.costUSD, 0.02);
  assert.equal(record.output, undefined);
  assert.equal(record.outputChars, 2000);
});

test("summarizes budget status and source breakdown", () => {
  const telemetry = createCostTelemetry({ maxCostUSD: 1, warnAtRatio: 0.8 });
  telemetry.recordUsage({ platform: "claude", costUSD: 0.5 });
  telemetry.recordUsage({ platform: "codex", costUSD: 0.31 });

  const summary = telemetry.summary();
  assert.equal(summary.totalUSD, 0.81);
  assert.equal(summary.budget.status, "near_limit");
  assert.equal(summary.budget.nearLimit, true);
  assert.deepEqual(summary.byPlatform, { claude: 0.5, codex: 0.31 });
  assert.deepEqual(summary.bySource, { reported: 0.81 });
});

test("budgetStatus reports hard budget exceedance", () => {
  assert.deepEqual(budgetStatus({ totalUSD: 10, maxCostUSD: 10, warnAtRatio: 0.8 }), {
    status: "exceeded",
    maxCostUSD: 10,
    remainingUSD: 0,
    usedRatio: 1,
    warnAtRatio: 0.8,
    nearLimit: false,
    exceeded: true,
  });
});

test("appendCostTelemetry writes JSONL without raw transcript content", () => {
  const cwd = tempProject();
  try {
    const path = appendCostTelemetry({
      cwd,
      runId: "run/1",
      records: [
        { platform: "claude", model: "m", costUSD: 0.25, transcript: "SECRET RAW TRANSCRIPT" },
      ],
      summary: summarizeCostTelemetry([{ platform: "claude", costUSD: 0.25 }], { maxCostUSD: 1 }),
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    assert.equal(path, costTelemetryLogPath({ cwd, runId: "run/1" }));
    const text = readFileSync(path, "utf-8");
    assert.doesNotMatch(text, /SECRET RAW TRANSCRIPT/);
    const entry = JSON.parse(text.trim());
    assert.equal(entry.timestamp, "2026-06-11T00:00:00.000Z");
    assert.equal(entry.summary.totalUSD, 0.25);
    assert.equal(entry.records[0].transcript, undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
