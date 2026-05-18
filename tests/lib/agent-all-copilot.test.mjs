import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_ROOT = "plugins/harness-floor-copilot/skills/agent-all-copilot";

test("agent-all-copilot: SKILL.md exists with name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: agent-all-copilot/);
  assert.ok(md.includes("Copilot CLI port"));
  assert.ok(md.includes("`task` tool"));
  assert.ok(md.includes("`store_memory`"));
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
  assert.ok(body.includes("subagentStop") || body.includes("list_agents"), "awaiter strategy");
  assert.ok(body.includes("read_agent"), "must use read_agent for status");
});

test("agent-all-copilot: phase 0 preflight checks Copilot version", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/0-preflight.md"), "utf-8");
  assert.ok(body.includes("v0.0.380"), "version requirement documented");
  assert.ok(body.includes("store_memory"), "memory probe present");
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
  assert.ok(body.includes("task"));
  assert.ok(body.includes("1 week"));
});
