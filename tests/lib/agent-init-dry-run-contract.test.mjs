import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readPhase(name) {
  return readFileSync(
    resolve("plugins/harness-builder/skills/agent-init/phases", name),
    "utf-8",
  );
}

function assertDryRunGuardBeforeMutation({ phaseFile, mutationPattern }) {
  const text = readPhase(phaseFile);
  const guardIndex = text.indexOf("If `--dry-run` is set");
  assert.notEqual(guardIndex, -1, `${phaseFile} must define an early dry-run guard`);

  const mutationMatch = text.match(mutationPattern);
  assert.ok(mutationMatch, `${phaseFile} must still describe the mutation step`);
  assert.ok(
    guardIndex < mutationMatch.index,
    `${phaseFile} dry-run guard must appear before mutation steps`,
  );
}

test("agent-init phase docs guard dry-run before phase 1 through 4 mutations", () => {
  assertDryRunGuardBeforeMutation({
    phaseFile: "1-discover.md",
    mutationPattern: /Update `\.claude\/\.agent-init-state\.json`/,
  });
  assertDryRunGuardBeforeMutation({
    phaseFile: "2-claude-md.md",
    mutationPattern: /\bWrite `CLAUDE\.md`/,
  });
  assertDryRunGuardBeforeMutation({
    phaseFile: "3-agents.md",
    mutationPattern: /\bFan out\b/,
  });
  assertDryRunGuardBeforeMutation({
    phaseFile: "4-hooks.md",
    mutationPattern: /`mkdir -p \.claude\/hooks`/,
  });
});

test("phase 5 dry-run summary covers all planned write and wiring categories", () => {
  const phase5 = readPhase("5-wire.md");
  const dryRunSectionStart = phase5.indexOf("If `--dry-run` is set");
  assert.notEqual(dryRunSectionStart, -1, "Phase 5 must describe dry-run output");
  const dryRunSection = phase5.slice(dryRunSectionStart, phase5.indexOf("\n5.", dryRunSectionStart));

  for (const phrase of [
    "planned root files",
    "local guide files",
    "agent files",
    "hook files",
    "settings changes",
    "task ledger files",
    "platform wiring",
    "planned global config patches",
    "foundation update plan",
    "commit plan",
  ]) {
    assert.match(dryRunSection, new RegExp(phrase), `Phase 5 dry-run summary must include ${phrase}`);
  }
});

test("phase 5 handles dry-run before reading persisted plugin scan state", () => {
  const phase5 = readPhase("5-wire.md");
  const dryRunIndex = phase5.indexOf("If `--dry-run` is set");
  assert.notEqual(dryRunIndex, -1, "Phase 5 must describe dry-run output");

  const stateReadMatch = phase5.match(/Re-read `plugin_scan` from `\.agent-init-state\.json`/);
  assert.ok(stateReadMatch, "Phase 5 must still describe the normal-mode plugin_scan state read");

  const dryRunSection = phase5.slice(dryRunIndex, phase5.indexOf("\n5.", dryRunIndex));
  const usesInMemoryPluginScan =
    /in-memory (?:dry-run )?context/.test(dryRunSection) &&
    /plugin_scan/.test(dryRunSection);

  assert.ok(
    dryRunIndex < stateReadMatch.index || usesInMemoryPluginScan,
    "Phase 5 dry-run must run before .agent-init-state.json reads or explicitly use in-memory plugin_scan context",
  );
});
