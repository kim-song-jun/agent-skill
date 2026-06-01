import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_ROOT = "plugins/harness-floor-codex/skills/agent-all-codex";

test("agent-all-codex: SKILL.md exists with name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: agent-all-codex/);
  assert.ok(md.includes("Codex CLI port"));
  assert.ok(md.includes("current Codex hooks"));
  assert.ok(md.includes("sequential"));
});

test("agent-all-codex: all 7 phase files exist", () => {
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

test("agent-all-codex: phase headings match contract", () => {
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

test("agent-all-codex: phase 3 documents sequential dispatch", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/3-dispatch.md"), "utf-8");
  assert.ok(body.includes("sequential"), "sequential dispatch");
  assert.ok(body.includes(".codex/skills/<role>/SKILL.md"), "role skill invocation");
  assert.ok(!body.includes("[[hooks.agent]]"), "must not document legacy agent hook");
});

test("agent-all-codex: phase 0 detects dispatch strategy", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/0-preflight.md"), "utf-8");
  assert.ok(body.includes("Detect dispatch strategy"));
  assert.ok(body.includes("current Codex hooks"));
});

test("agent-all-codex: all template files exist", () => {
  for (const t of [
    "templates/agent-all.config.json.hbs",
    "templates/pr-body.md.hbs",
    "templates/codex-hooks-snippet.toml.hbs",
  ]) {
    assert.ok(existsSync(resolve(SKILL_ROOT, t)), `template missing: ${t}`);
  }
});

test("agent-all-codex: hook snippet does not emit unsupported agent hook", () => {
  const body = readFileSync(
    resolve(SKILL_ROOT, "templates/codex-hooks-snippet.toml.hbs"),
    "utf-8",
  );
  assert.ok(body.includes("current Codex hooks"));
  assert.ok(body.includes("sequential dispatch"));
  assert.ok(!body.includes("[[hooks.agent]]"));
  assert.ok(!body.includes("timeout_seconds"));
});

test("agent-all-codex: user prompt invoker surface has no unimplemented exec_command path", () => {
  for (const rel of ["lib/host-invoker.mjs", "lib/ask-user-adapter.mjs"]) {
    const body = readFileSync(resolve(SKILL_ROOT, rel), "utf-8");
    assert.ok(body.includes("exec_command") || body.includes("ask_user"), `${rel} should document prompt primitives`);
    assert.doesNotMatch(body, /not yet implemented|not implemented here/i);
  }
});

test("agent-all-codex: porting-notes flags unsupported legacy hook schema", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.ok(body.includes("current Codex hooks"));
  assert.ok(body.includes("unsupported"));
  assert.ok(body.includes("sequential"));
});
