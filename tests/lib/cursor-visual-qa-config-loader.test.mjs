import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "visual-qa", "fixtures", "configs", name);

const SOURCE = resolve("plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs");
const VENDORED = resolve("plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/config-loader.mjs");

test("vendored copy retains all source-of-truth code (header-comment tolerant)", () => {
  const src = readFileSync(SOURCE, "utf-8");
  const ven = readFileSync(VENDORED, "utf-8");
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    assert.ok(ven.includes(line), `vendored config-loader.mjs missing source line: ${line}`);
  }
});

test("loads minimal config", () => {
  const r = loadConfig(fx("minimal.json"), {});
  assert.equal(r.ok, true);
  assert.equal(r.config.baseUrl, "http://localhost:3000");
  assert.equal(r.config.pages.length, 1);
});

test("loads full config and resolves env vars", () => {
  const r = loadConfig(fx("full.json"), { VQA_EMAIL: "user@example.com" });
  assert.equal(r.ok, true);
  const step = r.config.auth.loginFlow.find((s) => s.fill === "[name=email]");
  assert.equal(step.value, "user@example.com");
});

test("rejects when baseUrl missing", () => {
  const r = loadConfig(fx("invalid-missing-baseurl.json"), {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "baseUrl"));
});

test("rejects when ${env:VAR} unresolved", () => {
  const r = loadConfig(fx("invalid-env-missing.json"), {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /MISSING_VAR_FOR_TEST/.test(e.message)));
});
