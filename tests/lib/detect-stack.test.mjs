import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  detectStack,
  detectProject,
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

test("detectProject: node-ts has no docker → runtime null", () => {
  assert.deepEqual(detectProject(fx("node-ts")),
    { stack: "typescript", runtime: null, services: [] });
});

test("detectProject: docker-only → stack unknown, runtime docker", () => {
  assert.deepEqual(detectProject(fx("docker-only")),
    { stack: "unknown", runtime: "docker", services: [] });
});

test("detectProject: node-ts-docker → services parsed and sorted", () => {
  assert.deepEqual(detectProject(fx("node-ts-docker")),
    { stack: "typescript", runtime: "docker", services: ["postgres", "redis"] });
});

test("detectProject: python-compose-only → compose.yaml is also detected", () => {
  assert.deepEqual(detectProject(fx("python-compose-only")),
    { stack: "python", runtime: "docker", services: ["db"] });
});

test("detectProject: python-requirements-only → minimal python project", () => {
  assert.deepEqual(detectProject(fx("python-requirements-only")),
    { stack: "python", runtime: null, services: [] });
});

test("detectProject: non-existent dir → all defaults", () => {
  assert.deepEqual(detectProject(fx("__nonexistent__")),
    { stack: "unknown", runtime: null, services: [] });
});

test("detectProject: Dockerfile + malformed compose → services []", () => {
  assert.deepEqual(detectProject(fx("dockerfile-bad-compose")),
    { stack: "unknown", runtime: "docker", services: [] });
});
