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

test("Phase 0 resume branch restores dirtySnapshot from checkpoint and re-exports AGENT_ALL_DIRTY_SNAPSHOT", () => {
  const body = read("0-preflight.md");
  assert.match(body, /resume[\s\S]{0,300}dirtySnapshot/i,
    "5b resume branch must reference dirtySnapshot to restore PROTECT mode");
});

test("Phase 3c injects dirtySnapshot as forbidden + excludes it from the commit pathspec", () => {
  const body = readFileSync(resolve(PHASES, "3-dispatch.md"), "utf-8");
  assert.match(body, /dirtySnapshot/, "3-dispatch references the protected set");
  assert.match(body, /[Ff]orbidden[\s\S]{0,200}dirtySnapshot/, "lists dirtySnapshot under Forbidden files for implementers");
  assert.match(body, /dirtySnapshot[\s\S]{0,200}(exclude|complement|not stage)/i, "excludes protected paths from the commit pathspec");
});
