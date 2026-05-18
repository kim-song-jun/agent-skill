// Tests for the result-collector lib (agent-all-gemini and visual-qa-gemini).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const AGENT_ALL_COLLECTOR = "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/result-collector.mjs";
const VISUAL_QA_COLLECTOR = "plugins/harness-floor-gemini/skills/visual-qa-gemini/lib/result-collector.mjs";

function makeTmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("vendored copies of result-collector match byte-for-byte", () => {
  const a = readFileSync(resolve(AGENT_ALL_COLLECTOR), "utf-8");
  const b = readFileSync(resolve(VISUAL_QA_COLLECTOR), "utf-8");
  assert.equal(a, b, "agent-all-gemini and visual-qa-gemini copies of result-collector diverged");
});

test("parseResultFile: valid JSON returns normalised ParsedResult", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-valid-");
  try {
    const p = join(dir, "task.json");
    writeFileSync(p, JSON.stringify({
      status: "completed",
      agentId: "dev-1",
      commits: ["abc123"],
      costUSD: 0.42,
      exitCode: 0,
      errors: [],
    }));
    const r = parseResultFile(p, 1);
    assert.equal(r.ok, true);
    assert.equal(r.status, "completed");
    assert.equal(r.agentId, "dev-1");
    assert.deepEqual(r.commits, ["abc123"]);
    assert.equal(r.costUSD, 0.42);
    assert.equal(r.taskId, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseResultFile: missing file → status:failed with 'no result file'", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const r = parseResultFile("/nonexistent/does/not/exist.json", "x");
  assert.equal(r.ok, false);
  assert.equal(r.status, "failed");
  assert.ok(r.errors.some((e) => /no result file/.test(e)));
  assert.equal(r.taskId, "x");
});

test("parseResultFile: empty file → status:failed", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-empty-");
  try {
    const p = join(dir, "task.json");
    writeFileSync(p, "");
    const r = parseResultFile(p, 1);
    assert.equal(r.status, "failed");
    assert.ok(r.errors.some((e) => /empty result file/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseResultFile: corrupt JSON → status:failed; raw preserved", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-corrupt-");
  try {
    const p = join(dir, "task.json");
    writeFileSync(p, '{"status":"complete'); // truncated
    const r = parseResultFile(p, 7);
    assert.equal(r.status, "failed");
    assert.ok(r.errors.some((e) => /corrupt JSON/.test(e)));
    assert.equal(r.raw, '{"status":"complete');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseResultFile: non-object payload (array/null) → status:failed", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-shape-");
  try {
    const p = join(dir, "a.json");
    writeFileSync(p, "[1,2,3]");
    const r = parseResultFile(p, "a");
    assert.equal(r.status, "failed");
    assert.ok(r.errors.some((e) => /payload not an object/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseResultFile: unknown status normalised to 'completed'", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-unknown-");
  try {
    const p = join(dir, "a.json");
    writeFileSync(p, JSON.stringify({ status: "weirdness" }));
    const r = parseResultFile(p, 1);
    assert.equal(r.status, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectBatch: aggregates summary across multiple results", async () => {
  const { collectBatch } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-batch-");
  try {
    const p1 = join(dir, "1.json");
    const p2 = join(dir, "2.json");
    const p3 = join(dir, "3.json");
    writeFileSync(p1, JSON.stringify({ status: "completed", costUSD: 0.10 }));
    writeFileSync(p2, JSON.stringify({ status: "blocked", costUSD: 0.05 }));
    // p3 missing → counted as failed
    const { results, summary } = collectBatch([
      { id: 1, outputFile: p1 },
      { id: 2, outputFile: p2 },
      { id: 3, outputFile: p3 },
    ]);
    assert.equal(results.length, 3);
    assert.equal(summary.completed, 1);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.failed, 1);
    assert.equal(Number(summary.totalCostUSD.toFixed(4)), 0.15);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseResultFile: accepts snake_case alternates (agent_id, cost_usd)", async () => {
  const { parseResultFile } = await import(`../../${AGENT_ALL_COLLECTOR}`);
  const dir = makeTmp("rc-snake-");
  try {
    const p = join(dir, "task.json");
    writeFileSync(p, JSON.stringify({
      status: "completed",
      agent_id: "snake-1",
      cost_usd: 0.99,
    }));
    const r = parseResultFile(p, 1);
    assert.equal(r.agentId, "snake-1");
    assert.equal(r.costUSD, 0.99);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
