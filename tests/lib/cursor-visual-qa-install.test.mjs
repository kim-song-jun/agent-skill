// Integration: invoke `harness-floor-cursor/bin/init.mjs --only=visual-qa`
// against a tmpdir and verify the kit (templates + lib modules + MCP
// snippet output) lands at expected paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BIN = resolve("plugins/harness-floor-cursor/bin/init.mjs");

function runInit(args) {
  return spawnSync("node", [BIN, ...args], { encoding: "utf-8" });
}

test("visual-qa install: ships template files + vendored lib modules", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-vqa-install-"));
  try {
    const res = runInit([target, "--only=visual-qa"]);
    assert.equal(res.status, 0, res.stderr);

    const expected = [
      ".visual-qa.json",
      ".cursor/agents/visual-qa-page.md",
      ".cursor/visual-qa/lib/config-loader.mjs",
      ".cursor/visual-qa/lib/matrix-builder.mjs",
      ".cursor/visual-qa/lib/cost-estimator.mjs",
      ".cursor/visual-qa/lib/diff-runs.mjs",
      ".cursor/visual-qa/lib/state-rw.mjs",
      ".cursor/visual-qa/lib/report-renderer.mjs",
      ".cursor/visual-qa/lib/page-result-collector.mjs",
    ];
    for (const f of expected) {
      assert.ok(existsSync(resolve(target, f)), `missing ${f}`);
    }

    // MCP snippet still printed to stdout.
    assert.match(res.stdout, /Merge the following into .cursor\/mcp.json/);
    assert.match(res.stdout, /@playwright\/mcp@latest/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("visual-qa install: idempotency — second run without --force bails", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-vqa-install-"));
  try {
    let res = runInit([target, "--only=visual-qa"]);
    assert.equal(res.status, 0, res.stderr);

    res = runInit([target, "--only=visual-qa"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Refusing to overwrite/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("visual-qa install: installed report-renderer renders fixture report", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-vqa-install-"));
  try {
    runInit([target, "--only=visual-qa"]);
    const renderer = resolve(target, ".cursor/visual-qa/lib/report-renderer.mjs");
    const fx = resolve("tests/fixtures/cursor-visual-qa/report.json");
    const r = spawnSync("node", [renderer, fx], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
    // Assert that the installed renderer actually expands the template — not just
    // that it emits the literal template text (which would also include "Visual QA Report").
    assert.match(r.stdout, /^# Visual QA Report — 2026-05-18-abc1234/m);
    assert.ok(r.stdout.includes("http://localhost:3000"), "baseUrl must be expanded");
    assert.match(r.stdout, /Total issues:\*\* 2/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
