// tests/lib/emit-run-record.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEmitArgs, gatherScaffold, emitRunRecord } from "../../scripts/emit-run-record.mjs";

test("parseEmitArgs reads outcome flags", () => {
  const o = parseEmitArgs(["--run-id=feat-1", "--passed=true", "--iterations=2", "--roles-invoked=planner,dev", "--category=backend-api"]);
  assert.equal(o.runId, "feat-1");
  assert.equal(o.passed, true);
  assert.equal(o.iterations, 2);
  assert.deepEqual(o.rolesInvoked, ["planner", "dev"]);
  assert.equal(o.category, "backend-api");
});

test("gatherScaffold reads agent-init state + .claude/agents roster", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-scaffold-"));
  try {
    mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
    writeFileSync(join(dir, ".claude", "agents", "planner.md"), "x");
    writeFileSync(join(dir, ".claude", "agents", "dev.md"), "x");
    writeFileSync(join(dir, ".claude", ".agent-init-state.json"), JSON.stringify({
      discovery: { size: "medium", qa_personas: ["auth"], operationalProfile: true },
    }));
    const s = gatherScaffold({ cwd: dir });
    assert.equal(s.size, "medium");
    assert.equal(s.profile, "operational");
    assert.deepEqual(s.roster.sort(), ["dev", "planner"]);
    assert.deepEqual(s.qaPersonas, ["auth"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("emitRunRecord writes one valid agent-all record", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-write-"));
  try {
    mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
    writeFileSync(join(dir, ".claude", "agents", "planner.md"), "x");
    const path = emitRunRecord({ cwd: dir, runId: "feat-1", passed: true, iterations: 1, rolesInvoked: ["planner"], category: "docs-only" });
    const files = readdirSync(join(dir, ".agent-skill", "runs", "records"));
    assert.deepEqual(files, ["feat-1.json"]);
    const rec = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(rec.source, "agent-all");
    assert.equal(rec.outcome.passed, true);
    assert.deepEqual(rec.outcome.rolesActuallyInvoked, ["planner"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
