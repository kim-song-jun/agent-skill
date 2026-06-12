import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWaves } from "../../../plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs";
import { DEFAULTS } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

const waveConfig = { maxParallel: 2, rolesAllowed: ["dev", "reviewer"] };

test("single task → 1 wave with 1 task", () => {
  const tasks = [{ id: 1, files: ["a.ts"] }];
  const waves = buildWaves(tasks, waveConfig);
  assert.equal(waves.length, 1);
  assert.equal(waves[0].length, 1);
});

test("4 independent tasks, maxParallel=2 → 2 waves of 2", () => {
  const tasks = [
    { id: 1, files: ["a.ts"] },
    { id: 2, files: ["b.ts"] },
    { id: 3, files: ["c.ts"] },
    { id: 4, files: ["d.ts"] },
  ];
  const waves = buildWaves(tasks, waveConfig);
  assert.equal(waves.length, 2);
  assert.equal(waves[0].length, 2);
  assert.equal(waves[1].length, 2);
});

test("tasks sharing a file are serialized into separate waves", () => {
  const tasks = [
    { id: 1, files: ["shared.ts"] },
    { id: 2, files: ["shared.ts", "b.ts"] },
    { id: 3, files: ["c.ts"] },
  ];
  const waves = buildWaves(tasks, waveConfig);
  const wave1Ids = new Set(waves[0].map(t => t.id));
  const wave2Ids = new Set(waves[1].map(t => t.id));
  assert.ok(wave1Ids.has(1));
  assert.ok(wave2Ids.has(2));
});

test("empty plan → empty waves array", () => {
  const waves = buildWaves([], waveConfig);
  assert.deepEqual(waves, []);
});

test("rolesAllowed: tasks tagged with a role not in rolesAllowed are dropped", () => {
  const tasks = [
    { id: 1, files: ["a.ts"], role: "dev" },
    { id: 2, files: ["b.ts"], role: "frontend-dev" },
  ];
  const result = buildWaves(tasks, waveConfig);
  const allIds = result.flat().map(t => t.id);
  assert.deepEqual(allIds, [1]);
});

test("default large wave includes generic dev fallback role", () => {
  const tasks = [
    { id: 1, files: ["src/a.ts"], role: "dev" },
  ];
  const result = buildWaves(tasks, DEFAULTS.waves.large);
  assert.equal(result.length, 1);
  assert.equal(result[0][0].id, 1);
});
