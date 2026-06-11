import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  emptyTaskRegistry,
  findTaskRecord,
  normalizeTaskRecord,
  readTaskRegistry,
  recordTask,
  taskRegistryPath,
  upsertTaskRecord,
} from "../../../plugins/harness-floor/skills/agent-all/lib/task-registry.mjs";

const RECORD = {
  id: "AS-TASK-01K7P8J7G00000000000000000",
  display_id: "T-20260611-001",
  path: ".agent-skill/tasks/T-20260611-001-alpha.md",
  github_issue: 18,
  status: "doing",
  artifact_root: ".agent-skill/",
};

test("task registry path follows artifact root", () => {
  assert.equal(taskRegistryPath(), ".agent-skill/registry/tasks.json");
  assert.equal(taskRegistryPath({ artifact: { root: ".ops" } }), ".ops/registry/tasks.json");
});

test("normalizes task registry records", () => {
  assert.deepEqual(normalizeTaskRecord({ ...RECORD, display_id: "t-20260611-001" }), RECORD);
});

test("rejects unsafe task registry records", () => {
  assert.throws(() => normalizeTaskRecord({ ...RECORD, github_issue: "abc" }), /github_issue/);
  assert.throws(() => normalizeTaskRecord({ ...RECORD, path: "/tmp/task.md" }), /relative task markdown path/);
  assert.throws(() => normalizeTaskRecord({ ...RECORD, artifact_root: "../ops" }), /relative artifact root/);
});

test("upsert task record enforces canonical/display id separation", () => {
  const registry = upsertTaskRecord(emptyTaskRegistry(), RECORD);
  assert.equal(registry.tasks.length, 1);
  assert.equal(findTaskRecord(registry, { id: RECORD.id })?.path, RECORD.path);
  assert.equal(findTaskRecord(registry, { displayId: RECORD.display_id })?.id, RECORD.id);
  assert.equal(findTaskRecord(registry, { path: RECORD.path })?.display_id, RECORD.display_id);

  assert.throws(
    () => upsertTaskRecord(registry, {
      ...RECORD,
      id: "AS-TASK-01K7P8J7G00000000000000001",
      path: ".agent-skill/tasks/T-20260611-001-beta.md",
    }),
    /already belongs/,
  );
});

test("recordTask writes registry atomically as JSON", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "agent-skill-task-registry-"));
  const path = resolve(dir, ".agent-skill", "registry", "tasks.json");
  try {
    const registry = recordTask({ registryPath: path, record: RECORD });
    assert.equal(registry.tasks.length, 1);
    assert.equal(existsSync(path), true);
    assert.deepEqual(readTaskRegistry(path), registry);
    assert.doesNotMatch(readFileSync(path, "utf-8"), /tmp-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recordTask suffixes display id conflicts while keeping canonical ids distinct", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "agent-skill-task-registry-"));
  const path = resolve(dir, ".agent-skill", "registry", "tasks.json");
  try {
    recordTask({ registryPath: path, record: RECORD });
    const registry = recordTask({
      registryPath: path,
      record: {
        ...RECORD,
        id: "AS-TASK-01K7P8J7G00000000000000001",
        path: ".agent-skill/tasks/T-20260611-001-beta.md",
      },
    });

    assert.equal(registry.tasks.length, 2);
    assert.equal(findTaskRecord(registry, { id: RECORD.id })?.display_id, "T-20260611-001");
    const second = findTaskRecord(registry, { id: "AS-TASK-01K7P8J7G00000000000000001" });
    assert.equal(second?.display_id, "T-20260611-001-2");
    assert.equal(second?.path, ".agent-skill/tasks/T-20260611-001-2-beta.md");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
