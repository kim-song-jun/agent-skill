import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const STALE_RELEASE_COPY = /\b(?:future|MVP|placeholder|follow-up|deferred|TBD)\b/i;

const PLUGINS = [
  // harness-builder and harness-floor MUST keep their manifest at
  // .claude-plugin/plugin.json (not the plugin root): Claude Code ignores a
  // root-level plugin.json, dropping the declared version/hooks. They were the
  // two that regressed to root; listing them here gates against it recurring.
  "harness-builder",
  "harness-floor",
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
  "harness-floor-codex",
  "harness-floor-copilot",
  "harness-floor-gemini",
  "harness-floor-cursor",
  "harness-thrift",
  "harness-thrift-cursor",
  "harness-thrift-copilot",
  "harness-thrift-codex",
  "harness-debug-codex",
  "harness-thrift-gemini",
  "harness-explore",
  "harness-debug",
  "harness-data",
];

for (const p of PLUGINS) {
  test(`${p}: plugin.json is valid and has required fields`, () => {
    const path = resolve("plugins", p, ".claude-plugin", "plugin.json");
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw);
    assert.equal(data.name, p);
    assert.ok(data.version, "version present");
    assert.ok(data.description, "description present");
  });
}

test("harness-builder-gemini: gemini-extension.json is valid", () => {
  const path = resolve("plugins", "harness-builder-gemini", "gemini-extension.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  assert.equal(data.name, "harness-builder-gemini");
  assert.equal(data.contextFileName, "GEMINI.md");
});

test("harness-floor-gemini: gemini-extension.json is valid", () => {
  const path = resolve("plugins", "harness-floor-gemini", "gemini-extension.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  assert.equal(data.name, "harness-floor-gemini");
});

test("harness-thrift-gemini: gemini-extension.json is valid", () => {
  const path = resolve("plugins", "harness-thrift-gemini", "gemini-extension.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  assert.equal(data.name, "harness-thrift-gemini");
});

test("marketplace.json lists all nineteen plugins", () => {
  const data = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf-8"));
  const names = data.plugins.map((p) => p.name).sort();
  assert.deepEqual(names, [
    "harness-builder",
    "harness-builder-codex",
    "harness-builder-copilot",
    "harness-builder-cursor",
    "harness-builder-gemini",
    "harness-data",
    "harness-debug",
    "harness-debug-codex",
    "harness-explore",
    "harness-floor",
    "harness-floor-codex",
    "harness-floor-copilot",
    "harness-floor-cursor",
    "harness-floor-gemini",
    "harness-thrift",
    "harness-thrift-codex",
    "harness-thrift-copilot",
    "harness-thrift-cursor",
    "harness-thrift-gemini",
  ]);
});

test("marketplace entries resolve to installable plugin manifests with skill surfaces", () => {
  const data = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf-8"));
  assert.doesNotMatch(data.description, STALE_RELEASE_COPY);

  const seen = new Set();
  for (const plugin of data.plugins) {
    assert.ok(plugin.name, "plugin name present");
    assert.ok(plugin.description, `${plugin.name} description present`);
    assert.doesNotMatch(plugin.description, STALE_RELEASE_COPY, `${plugin.name} has release-ready marketplace copy`);
    assert.ok(plugin.source.startsWith("./plugins/"), `${plugin.name} uses a local plugin source`);

    const source = resolve(plugin.source);
    assert.ok(existsSync(source), `${plugin.name} source directory exists`);

    const manifestPath = manifestFor(source, plugin.name);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(manifest.name, plugin.name, `${plugin.name} manifest name matches marketplace`);
    assert.ok(manifest.version, `${plugin.name} manifest version present`);
    assert.ok(manifest.description, `${plugin.name} manifest description present`);
    assert.doesNotMatch(
      manifest.description,
      STALE_RELEASE_COPY,
      `${plugin.name} manifest description is release-ready`,
    );

    const skillFiles = listSkillFiles(resolve(source, "skills"));
    assert.ok(skillFiles.length > 0, `${plugin.name} exposes at least one SKILL.md`);
    assert.equal(seen.has(plugin.name), false, `${plugin.name} appears once`);
    seen.add(plugin.name);
  }
});

function manifestFor(source, name) {
  const candidates = [
    join(source, "plugin.json"),
    join(source, ".claude-plugin", "plugin.json"),
  ];
  const manifestPath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(manifestPath, `${name} has plugin.json or .claude-plugin/plugin.json`);
  return manifestPath;
}

function listSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSkillFiles(path));
    } else if (entry === "SKILL.md") {
      files.push(path);
    }
  }
  return files;
}
