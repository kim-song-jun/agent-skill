import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../../../plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "configs", name);

test("loads minimal config", () => {
  const result = loadConfig(fx("minimal.json"), {});
  assert.equal(result.ok, true);
  assert.equal(result.config.baseUrl, "http://localhost:3000");
  assert.equal(result.config.pages.length, 1);
});

test("loads full config and resolves env vars", () => {
  const result = loadConfig(fx("full.json"), { VQA_EMAIL: "user@example.com" });
  assert.equal(result.ok, true);
  const emailStep = result.config.auth.loginFlow.find(s => s.fill === "[name=email]");
  assert.equal(emailStep.value, "user@example.com");
});

test("rejects when baseUrl is missing", () => {
  const result = loadConfig(fx("invalid-missing-baseurl.json"), {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === "baseUrl" && /required/i.test(e.message)));
});

test("rejects when breakpoint missing width/height", () => {
  const result = loadConfig(fx("invalid-bad-breakpoint.json"), {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /breakpoints\[0\]/.test(e.path)));
});

test("rejects when ${env:VAR} is unresolved", () => {
  const result = loadConfig(fx("invalid-env-missing.json"), {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /MISSING_VAR_FOR_TEST/.test(e.message)));
});
