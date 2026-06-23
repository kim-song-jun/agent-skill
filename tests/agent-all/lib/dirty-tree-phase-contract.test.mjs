// tests/agent-all/lib/dirty-tree-phase-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const PHASES = resolve("plugins/harness-floor/skills/agent-all/phases");
const read = (f) => readFileSync(resolve(PHASES, f), "utf-8");

test("Phase 0 enters PROTECT mode on a dirty tree instead of aborting", () => {
  const body = read("0-preflight.md");
  assert.match(body, /parseDirtyPaths/, "uses parseDirtyPaths to snapshot");
  assert.match(body, /dirtySnapshot/, "stores state.dirtySnapshot");
  assert.match(body, /AGENT_ALL_DIRTY_SNAPSHOT/, "exports the env contract for the Edit/Write guard");
  assert.match(body, /break-condition|test result/i, "warns dirty files can influence the break-condition");
  assert.match(body, /PROTECT/, "names PROTECT mode");
});
