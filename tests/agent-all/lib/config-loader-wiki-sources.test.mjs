import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

function cfg(obj) {
  const dir = mkdtempSync(join(tmpdir(), "cl-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify(obj));
  return loadConfig(p);
}

test("wiki defaults include sources, exclude, maxImportUSD", () => {
  const { ok, config } = cfg({});
  assert.equal(ok, true);
  assert.ok(Array.isArray(config.wiki.sources) && config.wiki.sources.includes("docs/superpowers/specs"));
  assert.ok(Array.isArray(config.wiki.exclude) && config.wiki.exclude.some((g) => /process-archive/.test(g)));
  assert.equal(typeof config.wiki.maxImportUSD, "number");
});

test("custom wiki.sources is accepted", () => {
  const { ok, config } = cfg({ wiki: { sources: ["docs/tasks", "docs/design"] } });
  assert.equal(ok, true);
  assert.deepEqual(config.wiki.sources, ["docs/tasks", "docs/design"]);
  // deep-merge: a partial wiki override must retain the other wiki defaults.
  assert.ok(Array.isArray(config.wiki.exclude) && config.wiki.exclude.length > 0, "default exclude retained");
  assert.equal(typeof config.wiki.maxImportUSD, "number", "default maxImportUSD retained");
  assert.equal(config.wiki.auto, true, "default auto retained");
  assert.equal(config.wiki.model, "haiku", "default model retained");
});

test("wiki.sources must be an array of strings", () => {
  const { ok, errors } = cfg({ wiki: { sources: "docs" } });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.path === "wiki.sources"));
});
