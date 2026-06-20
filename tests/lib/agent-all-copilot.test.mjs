import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_ROOT = "plugins/harness-floor-copilot/skills/agent-all-copilot";

test("agent-all-copilot: SKILL.md exists with name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: agent-all/);
  assert.ok(md.includes("Copilot port"));
  assert.ok(md.includes("`task`"));
  assert.ok(md.includes("file-backed") || md.includes("State lives in files"));
  assert.ok(md.includes("does not expose"));
  assert.ok(!md.includes("store_memory("));
  assert.ok(!md.includes("read_agent("));
  assert.ok(!md.includes("list_agents("));
});

test("agent-all-copilot: all 7 phase files exist", () => {
  for (const name of [
    "0-preflight.md",
    "1-intent.md",
    "2-plan.md",
    "3-dispatch.md",
    "4-gate.md",
    "5-pr.md",
    "6-loop.md",
  ]) {
    assert.ok(
      existsSync(resolve(SKILL_ROOT, "phases", name)),
      `phase file missing: ${name}`,
    );
  }
});

test("agent-all-copilot: phase headings match contract", () => {
  const cases = [
    ["0-preflight.md", "# Phase 0 — Preflight"],
    ["1-intent.md", "# Phase 1 — Intent"],
    ["2-plan.md", "# Phase 2 — Plan"],
    ["3-dispatch.md", "# Phase 3 — Dispatch"],
    ["4-gate.md", "# Phase 4 — Gate"],
    ["5-pr.md", "# Phase 5 — PR"],
    ["6-loop.md", "# Phase 6 — Loop"],
  ];
  for (const [file, heading] of cases) {
    const body = readFileSync(resolve(SKILL_ROOT, "phases", file), "utf-8");
    assert.ok(body.startsWith(heading), `${file} should start with "${heading}"`);
  }
});

test("agent-all-copilot: phase 3 references Copilot task primitive", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/3-dispatch.md"), "utf-8");
  assert.ok(body.includes("task("), "must call task(...)");
  assert.ok(body.includes("subagentStop"), "optional lifecycle hook strategy");
  assert.ok(body.includes("agentName"), "must correlate lifecycle records by official hook identity");
  assert.ok(!body.includes("store_memory("), "must not call nonexistent Copilot memory tool");
  assert.ok(!body.includes("list_agents()"), "must not call nonexistent Copilot polling tool");
  assert.ok(!body.includes("read_agent("), "must not call nonexistent Copilot agent-read tool");
});

test("agent-all-copilot: phase 0 preflight checks Copilot task surface", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/0-preflight.md"), "utf-8");
  assert.ok(body.includes("Copilot CLI"), "Copilot CLI check documented");
  assert.ok(body.includes("task"), "task support check documented");
  assert.ok(body.includes("file-backed"), "file-backed state is documented");
  assert.ok(!body.includes("store_memory"), "no memory probe should remain");
});

test("agent-all-copilot: all template files exist", () => {
  for (const t of [
    "templates/agent-all.config.json.hbs",
    "templates/pr-body.md.hbs",
  ]) {
    assert.ok(existsSync(resolve(SKILL_ROOT, t)), `template missing: ${t}`);
  }
});

test("agent-all-copilot: porting-notes references source-of-truth", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.ok(body.includes("Claude Code"));
  assert.match(body, /`task` tool/);
  assert.ok(body.includes("1 week"));
  assert.ok(body.includes("agentName"));
  assert.ok(body.includes("does not assume public"));
  assert.ok(!body.includes("read_agent("));
  assert.ok(!body.includes("list_agents("));
  assert.ok(!body.includes("store_memory("));
});
