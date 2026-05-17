import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildWaves } from "../../../plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs";
import { evaluateLoop } from "../../../plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parsePlan(path) {
  const text = readFileSync(path, "utf-8");
  const headings = [...text.matchAll(/^### Task (\d+):\s*(.+)$/gm)];
  return headings.map((m, i) => {
    const next = headings[i + 1]?.index ?? text.length;
    const section = text.slice(m.index, next);
    const files = [...section.matchAll(/^- (?:Create|Modify):\s*`([^`]+)`/gm)].map(x => x[1]);
    return { id: parseInt(m[1], 10), title: m[2].trim(), files, role: "dev" };
  });
}

test("single wave success: 3-task plan with file dep → 2 waves", () => {
  const tasks = parsePlan(resolve(here, "..", "fixtures", "plans", "simple-plan.md"));
  const waves = buildWaves(tasks, { maxParallel: 4, rolesAllowed: ["dev", "reviewer"] });
  assert.equal(waves.length, 2);
  assert.ok(waves[0].some(t => t.id === 1));
  assert.ok(waves[0].some(t => t.id === 2));
  assert.ok(waves[1].some(t => t.id === 3));
});

test("multi-wave partial fail: wave-builder is deterministic regardless of failures (failures handled at gate)", () => {
  const tasks = parsePlan(resolve(here, "..", "fixtures", "plans", "simple-plan.md"));
  const waves = buildWaves(tasks, { maxParallel: 4, rolesAllowed: ["dev", "reviewer"] });
  const wavesAgain = buildWaves(tasks, { maxParallel: 4, rolesAllowed: ["dev", "reviewer"] });
  assert.deepEqual(waves, wavesAgain);
});

test("--loop 3 iterations: breakCondition fails twice then passes", () => {
  let runs = 0;
  const exits = [1, 1, 0];
  const runner = () => ({ exitCode: exits[runs++] });
  let state = { iter: 0, consecutivePass: 0, costUSD: 0 };

  let v = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "continue");
  state = { ...state, iter: 1, consecutivePass: 0 };

  v = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "continue");
  state = { ...state, iter: 2, consecutivePass: 0 };

  v = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "break");
});

test("--max-iter=2 exhausted: 2 failing iters then 3rd evaluation says exhausted", () => {
  const runner = () => ({ exitCode: 1 });
  let state = { iter: 2, consecutivePass: 0, costUSD: 0 };
  const v = evaluateLoop(state, { stableIters: 1, maxIter: 2, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "exhausted");
  assert.equal(v.exitCode, 3);
});
