import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { detectStack } from "../../plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs";

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
