import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_ROOT = "plugins/harness-floor-gemini/skills/agent-all-gemini";

test("agent-all-gemini: SKILL.md exists with name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: agent-all/);
  assert.ok(md.includes("Gemini port"));
  assert.match(md, /subprocess-based/i);
  assert.ok(md.includes("run_shell_command"));
});

test("agent-all-gemini: all 7 phase files exist", () => {
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

test("agent-all-gemini: phase headings match contract", () => {
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

test("agent-all-gemini: phase 3 uses subprocess dispatch pattern", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/3-dispatch.md"), "utf-8");
  assert.ok(body.includes("run_shell_command"), "uses run_shell_command");
  assert.ok(body.includes("gemini -p"), "spawns Gemini headless subprocesses");
  assert.ok(body.includes("--output-format json"), "captures JSON output");
  assert.ok(!body.includes("gemini chat"), "Gemini CLI has no chat subcommand");
  assert.ok(!body.includes("--output-json"), "Gemini CLI uses --output-format json");
  assert.ok(!body.includes("--skill-roster"), "Gemini CLI has no --skill-roster flag");
  assert.ok(body.includes("background: true"), "background flag for parallelism");
  assert.ok(body.includes("/tmp/agent-all"), "tmp dir for IPC");
});

test("agent-all-gemini: phase 0 probes subprocess health", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/0-preflight.md"), "utf-8");
  assert.match(body, /Probe subprocess sanity/, "subprocess sanity probe");
  assert.ok(body.includes("command -v gemini"), "gemini binary check");
});

test("agent-all-gemini: all template files exist", () => {
  for (const t of [
    "templates/agent-all.config.json.hbs",
    "templates/pr-body.md.hbs",
  ]) {
    assert.ok(existsSync(resolve(SKILL_ROOT, t)), `template missing: ${t}`);
  }
});

test("agent-all-gemini: config includes dispatch.subprocessTimeout/maxSubprocesses", () => {
  const body = readFileSync(
    resolve(SKILL_ROOT, "templates/agent-all.config.json.hbs"),
    "utf-8",
  );
  assert.ok(body.includes("subprocessTimeout"));
  assert.ok(body.includes("maxSubprocesses"));
  assert.ok(body.includes("subprocessTmpDir"));
  assert.ok(body.includes("\"maxRuntimeSec\": null"));
});

test("agent-all-gemini: porting-notes explains why it's the heaviest port", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.ok(body.includes("1.5 weeks"));
  assert.ok(body.includes("No native subagent"));
  assert.ok(body.includes("IPC complexity"));
  assert.ok(body.includes("subprocess"));
});
