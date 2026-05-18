import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_ROOT = "plugins/harness-floor-cursor/skills/agent-all-cursor";

test("agent-all-cursor: SKILL.md exists with name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: agent-all-cursor/);
  assert.ok(md.includes("prompt-template approach"));
});

test("agent-all-cursor: all 7 phase files exist", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6]) {
    const name = [
      "0-preflight.md",
      "1-intent.md",
      "2-plan.md",
      "3-dispatch.md",
      "4-gate.md",
      "5-pr.md",
      "6-loop.md",
    ][n];
    assert.ok(
      existsSync(resolve(SKILL_ROOT, "phases", name)),
      `phase file missing: ${name}`,
    );
  }
});

test("agent-all-cursor: phase headings match contract", () => {
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

test("agent-all-cursor: all template files exist", () => {
  const templates = [
    "templates/agent-all.config.json.hbs",
    "templates/pr-body.md.hbs",
    "templates/rules/agent-all.mdc.hbs",
    "templates/agents/agent-all-coordinator.md.hbs",
    "templates/agents/agent-all-implementer.md.hbs",
    "templates/agents/agent-all-reviewer.md.hbs",
  ];
  for (const t of templates) {
    assert.ok(existsSync(resolve(SKILL_ROOT, t)), `template missing: ${t}`);
  }
});

test("agent-all-cursor: implementer and reviewer have is_background: true", () => {
  for (const role of ["implementer", "reviewer"]) {
    const body = readFileSync(
      resolve(SKILL_ROOT, "templates/agents", `agent-all-${role}.md.hbs`),
      "utf-8",
    );
    assert.match(body, /is_background:\s*true/, `${role} must have is_background: true`);
  }
});

test("agent-all-cursor: coordinator has is_background: false", () => {
  const body = readFileSync(
    resolve(SKILL_ROOT, "templates/agents/agent-all-coordinator.md.hbs"),
    "utf-8",
  );
  assert.match(body, /is_background:\s*false/);
});

test("agent-all-cursor: rule has alwaysApply true", () => {
  const body = readFileSync(
    resolve(SKILL_ROOT, "templates/rules/agent-all.mdc.hbs"),
    "utf-8",
  );
  assert.match(body, /alwaysApply:\s*true/);
});

test("agent-all-cursor: porting-notes references source-of-truth Claude skill", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.ok(body.includes("Claude Code"));
  assert.ok(body.includes("description-match"));
});
