import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectGuideDirs } from "../../plugins/harness-builder/skills/agent-init/lib/folder-guides.mjs";

test("detects common project folders and package directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "folder-guides-"));
  try {
    mkdirSync(join(dir, "frontend"), { recursive: true });
    mkdirSync(join(dir, "backend"), { recursive: true });
    mkdirSync(join(dir, "packages/api"), { recursive: true });
    mkdirSync(join(dir, "node_modules/ignored"), { recursive: true });
    writeFileSync(join(dir, "packages/api/package.json"), "{}");
    const dirs = detectGuideDirs(dir).map((x) => x.path);
    assert.deepEqual(dirs, ["backend", "frontend", "packages", "packages/api"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("includes top-level workspace containers and nested packages", () => {
  const dir = mkdtempSync(join(tmpdir(), "folder-guides-"));
  try {
    mkdirSync(join(dir, "apps/web"), { recursive: true });
    mkdirSync(join(dir, "packages/api"), { recursive: true });
    writeFileSync(join(dir, "apps/web/package.json"), "{}");
    writeFileSync(join(dir, "packages/api/package.json"), "{}");

    const dirs = detectGuideDirs(dir).map((x) => x.path);

    assert.deepEqual(dirs, ["apps", "apps/web", "packages", "packages/api"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
