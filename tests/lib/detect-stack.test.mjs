import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  detectStack,
  parseComposeServices,
} from "../../plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "stacks", name);

test("detects typescript when package.json + tsconfig.json present", () => {
  assert.equal(detectStack(fx("node-ts")), "typescript");
});

test("detects python when pyproject.toml present", () => {
  assert.equal(detectStack(fx("python")), "python");
});

test("detects rust when Cargo.toml present", () => {
  assert.equal(detectStack(fx("rust")), "rust");
});

test("detects go when go.mod present", () => {
  assert.equal(detectStack(fx("go")), "go");
});

test("detects javascript when package.json without tsconfig.json", () => {
  assert.equal(detectStack(fx("monorepo")), "javascript");
});

test("returns 'unknown' when no recognized manifest", () => {
  assert.equal(detectStack(fx("__nonexistent__")), "unknown");
});

test("parseComposeServices: standard 2-space indent returns sorted keys", () => {
  const text = [
    "services:",
    "  redis:",
    "    image: redis:7",
    "  postgres:",
    "    image: postgres:16",
  ].join("\n");
  assert.deepEqual(parseComposeServices(text), ["postgres", "redis"]);
});

test("parseComposeServices: no services section returns []", () => {
  const text = "version: \"3\"\nnetworks:\n  default: {}\n";
  assert.deepEqual(parseComposeServices(text), []);
});

test("parseComposeServices: tolerates comments and blank lines", () => {
  const text = [
    "# top comment",
    "version: \"3\"",
    "",
    "services:",
    "  # leading comment",
    "  app:",
    "    image: myapp",
    "",
    "  worker:",
    "    image: myapp",
    "",
    "volumes:",
    "  data: {}",
  ].join("\n");
  assert.deepEqual(parseComposeServices(text), ["app", "worker"]);
});

test("parseComposeServices: tab-indented services falls back to []", () => {
  const text = "services:\n\tpostgres:\n\t\timage: postgres\n";
  assert.deepEqual(parseComposeServices(text), []);
});

test("parseComposeServices: hyphenated service names are captured", () => {
  const text = [
    "services:",
    "  my-service:",
    "    image: x",
    "  nginx-proxy:",
    "    image: y",
  ].join("\n");
  assert.deepEqual(parseComposeServices(text), ["my-service", "nginx-proxy"]);
});
