import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { render } from "../../plugins/harness-builder/skills/agent-init/lib/render.mjs";
import { loadConfig } from "../../plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs";
import { QA_AUTOSCAFFOLD_CONFIG } from "../../plugins/harness-floor/skills/agent-all/lib/break-resolver.mjs";

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

test("Claude native /agent-init floor seed config matches --qa comprehensive contract", () => {
  const tpl = read("plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs");
  const rendered = render(tpl, {
    baseUrl: QA_AUTOSCAFFOLD_CONFIG.baseUrl,
    model: QA_AUTOSCAFFOLD_CONFIG.analysis.model,
  });
  const cfg = JSON.parse(rendered);

  assert.equal(cfg.mode, "comprehensive");
  assert.deepEqual(cfg.comprehensive.scope, QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope);
  assert.deepEqual(cfg.comprehensive.interactions, QA_AUTOSCAFFOLD_CONFIG.comprehensive.interactions);
  assert.deepEqual(cfg.comprehensive.cache, QA_AUTOSCAFFOLD_CONFIG.comprehensive.cache);
  assert.deepEqual(cfg.comprehensive.verdict, QA_AUTOSCAFFOLD_CONFIG.comprehensive.verdict);

  const dir = mkdtempSync(resolve(tmpdir(), "claude-native-visual-qa-seed-"));
  const path = resolve(dir, ".visual-qa.json");
  writeFileSync(path, rendered);
  const loaded = loadConfig(path, {});
  assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
  assert.equal(loaded.config.mode, "comprehensive");
});
