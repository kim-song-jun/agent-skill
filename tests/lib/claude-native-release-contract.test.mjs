import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(path), "utf-8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

test("Claude native plugin manifests expose all release skills", () => {
  assert.equal(readJson("plugins/harness-builder/plugin.json").name, "harness-builder");
  assert.equal(readJson("plugins/harness-floor/plugin.json").name, "harness-floor");
  assert.equal(readJson("plugins/harness-thrift/.claude-plugin/plugin.json").name, "harness-thrift");

  for (const rel of [
    "plugins/harness-builder/skills/agent-init/SKILL.md",
    "plugins/harness-floor/skills/agent-all/SKILL.md",
    "plugins/harness-floor/skills/visual-qa/SKILL.md",
    "plugins/harness-thrift/skills/thrift/SKILL.md",
  ]) {
    assert.ok(existsSync(resolve(rel)), `missing ${rel}`);
  }
});

test("Claude native release skills document production surfaces without scaffold language", () => {
  const skillPaths = [
    "plugins/harness-builder/skills/agent-init/SKILL.md",
    "plugins/harness-floor/skills/agent-all/SKILL.md",
    "plugins/harness-floor/skills/visual-qa/SKILL.md",
    "plugins/harness-thrift/skills/thrift/SKILL.md",
  ];

  const combined = skillPaths.map((path) => read(path)).join("\n\n");
  assert.match(combined, /Default \(no theme flag\) is operational\/heavy/);
  assert.match(combined, /\/agent-all[\s\S]*--qa[\s\S]*visual-qa \(comprehensive mode\)/);
  assert.match(combined, /\/visual-qa[\s\S]*comprehensive/);
  assert.match(combined, /\/thrift[\s\S]*Append-only hook patches/);
  assert.doesNotMatch(
    combined,
    /MVP scope|scaffold-only|not implemented|no-op stub|design pending|Theme B planned/i,
  );
});

test("Claude native hook entrypoints are syntax-valid JavaScript", () => {
  for (const rel of [
    "plugins/harness-builder/hooks/context-mode-cache-heal.mjs",
    "plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs",
    "plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs",
    "plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs",
    "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
    "plugins/harness-floor/bin/floor-policy-hook.mjs",
    "plugins/harness-floor/bin/install-floor-policy.mjs",
    "plugins/harness-thrift/bin/install.mjs",
  ]) {
    const res = spawnSync(process.execPath, ["--check", resolve(rel)], {
      encoding: "utf-8",
    });
    assert.equal(res.status, 0, `${rel}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  }
});
