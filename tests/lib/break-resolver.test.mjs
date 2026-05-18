// Unit tests for lib/break-resolver.mjs (source-of-truth in
// plugins/harness-floor/skills/agent-all/lib/). Validates the spec
// normaliser, shell-command builder, stack auto-detection, and the
// preset catalogue used by the Phase 0 interactive prompt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  PRESET_TYPES,
  PRESET_CATALOGUE,
  detectStackTestCommand,
  normalizeBreakCondition,
  serializeBreakCondition,
  buildShellCommand,
  needsVisualQARunner,
  isDefaultOrMissing,
  DEFAULT_BREAK_STRING,
} from "../../plugins/harness-floor/skills/agent-all/lib/break-resolver.mjs";

function fixtureDir(seed) {
  const dir = mkdtempSync(resolve(tmpdir(), `break-resolver-${seed}-`));
  return dir;
}

test("PRESET_TYPES enumerates exactly the four supported shapes", () => {
  assert.deepEqual([...PRESET_TYPES].sort(), ["composite", "shell", "test-auto", "visual-qa"]);
});

test("PRESET_CATALOGUE exposes four entries with stable keys", () => {
  const keys = PRESET_CATALOGUE.map((e) => e.key);
  assert.deepEqual(keys, ["test-auto", "visual-qa", "custom", "composite"]);
  for (const e of PRESET_CATALOGUE) {
    assert.equal(typeof e.label, "string");
    assert.ok(e.label.length > 0);
    assert.equal(typeof e.description, "string");
    assert.equal(typeof e.build, "function");
  }
});

test("PRESET_CATALOGUE.build() for test-auto returns {type:'test-auto'}", () => {
  const entry = PRESET_CATALOGUE.find((e) => e.key === "test-auto");
  assert.deepEqual(entry.build(), { type: "test-auto" });
});

test("PRESET_CATALOGUE.build() for custom uses provided cmd", () => {
  const entry = PRESET_CATALOGUE.find((e) => e.key === "custom");
  assert.deepEqual(entry.build({ cmd: "make ci" }), { type: "shell", cmd: "make ci" });
});

test("PRESET_CATALOGUE.build() for visual-qa carries optional spec", () => {
  const entry = PRESET_CATALOGUE.find((e) => e.key === "visual-qa");
  assert.deepEqual(entry.build({ spec: "docs/ui.md" }), { type: "visual-qa", spec: "docs/ui.md" });
  assert.deepEqual(entry.build(), { type: "visual-qa" });
});

test("normalizeBreakCondition: plain string becomes {type:'shell', cmd:<string>}", () => {
  assert.deepEqual(normalizeBreakCondition("npm test"), { type: "shell", cmd: "npm test" });
});

test("normalizeBreakCondition: empty / null returns null", () => {
  assert.equal(normalizeBreakCondition(null), null);
  assert.equal(normalizeBreakCondition(""), null);
  assert.equal(normalizeBreakCondition("   "), null);
});

test("normalizeBreakCondition: shell with empty cmd returns null", () => {
  assert.equal(normalizeBreakCondition({ type: "shell", cmd: "" }), null);
  assert.equal(normalizeBreakCondition({ type: "shell" }), null);
});

test("normalizeBreakCondition: unknown type returns null", () => {
  assert.equal(normalizeBreakCondition({ type: "rocket" }), null);
});

test("normalizeBreakCondition: visual-qa with optional spec", () => {
  assert.deepEqual(normalizeBreakCondition({ type: "visual-qa" }), { type: "visual-qa" });
  assert.deepEqual(normalizeBreakCondition({ type: "visual-qa", spec: "x.md" }), { type: "visual-qa", spec: "x.md" });
});

test("normalizeBreakCondition: composite recursively normalises steps", () => {
  const out = normalizeBreakCondition({
    type: "composite",
    steps: [
      "npm test",
      { type: "visual-qa" },
      { type: "test-auto" },
    ],
  });
  assert.deepEqual(out, {
    type: "composite",
    steps: [
      { type: "shell", cmd: "npm test" },
      { type: "visual-qa" },
      { type: "test-auto" },
    ],
  });
});

test("normalizeBreakCondition: composite without steps returns null", () => {
  assert.equal(normalizeBreakCondition({ type: "composite" }), null);
  assert.equal(normalizeBreakCondition({ type: "composite", steps: [] }), null);
});

test("normalizeBreakCondition: composite forbids nesting", () => {
  const out = normalizeBreakCondition({
    type: "composite",
    steps: [{ type: "composite", steps: ["x"] }],
  });
  assert.equal(out, null);
});

test("serializeBreakCondition renders human-readable strings", () => {
  assert.equal(serializeBreakCondition("npm test"), "shell: npm test");
  assert.equal(serializeBreakCondition({ type: "test-auto" }), "auto-detected test command");
  assert.equal(serializeBreakCondition({ type: "visual-qa" }), "visual-qa skill");
  assert.equal(serializeBreakCondition({ type: "visual-qa", spec: "x.md" }), "visual-qa skill (spec: x.md)");
  assert.match(serializeBreakCondition({ type: "composite", steps: ["a", "b"] }), /composite \[shell: a && shell: b\]/);
});

test("detectStackTestCommand finds npm test for package.json", () => {
  const dir = fixtureDir("npm");
  writeFileSync(resolve(dir, "package.json"), JSON.stringify({ scripts: { test: "mocha" } }));
  assert.equal(detectStackTestCommand(dir), "npm test --silent");
});

test("detectStackTestCommand finds pytest for pyproject.toml", () => {
  const dir = fixtureDir("py");
  writeFileSync(resolve(dir, "pyproject.toml"), "[project]\nname='x'");
  assert.equal(detectStackTestCommand(dir), "pytest -q");
});

test("detectStackTestCommand finds cargo test for Cargo.toml", () => {
  const dir = fixtureDir("rs");
  writeFileSync(resolve(dir, "Cargo.toml"), "[package]\nname='x'");
  assert.equal(detectStackTestCommand(dir), "cargo test --quiet");
});

test("detectStackTestCommand finds go test for go.mod", () => {
  const dir = fixtureDir("go");
  writeFileSync(resolve(dir, "go.mod"), "module x");
  assert.equal(detectStackTestCommand(dir), "go test ./...");
});

test("detectStackTestCommand returns null when nothing recognised", () => {
  const dir = fixtureDir("empty");
  assert.equal(detectStackTestCommand(dir), null);
});

test("buildShellCommand: shell preset passes through", () => {
  assert.equal(buildShellCommand({ type: "shell", cmd: "echo hi" }), "echo hi");
});

test("buildShellCommand: test-auto expands at runtime", () => {
  const dir = fixtureDir("auto");
  writeFileSync(resolve(dir, "package.json"), "{}");
  assert.equal(buildShellCommand({ type: "test-auto" }, { cwd: dir }), "npm test --silent");
});

test("buildShellCommand: test-auto returns null when no stack detected", () => {
  const dir = fixtureDir("auto-empty");
  assert.equal(buildShellCommand({ type: "test-auto" }, { cwd: dir }), null);
});

test("buildShellCommand: visual-qa always returns null (needs subagent)", () => {
  assert.equal(buildShellCommand({ type: "visual-qa" }), null);
});

test("buildShellCommand: composite joins with && and parenthesises each", () => {
  const dir = fixtureDir("comp");
  writeFileSync(resolve(dir, "package.json"), "{}");
  const cmd = buildShellCommand(
    { type: "composite", steps: ["lint", { type: "test-auto" }] },
    { cwd: dir },
  );
  assert.equal(cmd, "(lint) && (npm test --silent)");
});

test("buildShellCommand: composite containing visual-qa returns null", () => {
  assert.equal(
    buildShellCommand({ type: "composite", steps: ["lint", { type: "visual-qa" }] }),
    null,
  );
});

test("needsVisualQARunner: true for visual-qa or composite-with-visual-qa", () => {
  assert.equal(needsVisualQARunner({ type: "visual-qa" }), true);
  assert.equal(needsVisualQARunner({ type: "composite", steps: ["lint", { type: "visual-qa" }] }), true);
  assert.equal(needsVisualQARunner({ type: "shell", cmd: "x" }), false);
  assert.equal(needsVisualQARunner("npm test"), false);
});

test("isDefaultOrMissing detects null, empty, and built-in default", () => {
  assert.equal(isDefaultOrMissing(null), true);
  assert.equal(isDefaultOrMissing(""), true);
  assert.equal(isDefaultOrMissing("npm test"), true);
  assert.equal(isDefaultOrMissing({ type: "shell", cmd: DEFAULT_BREAK_STRING }), true);
  assert.equal(isDefaultOrMissing("pytest"), false);
  assert.equal(isDefaultOrMissing({ type: "visual-qa" }), false);
});
