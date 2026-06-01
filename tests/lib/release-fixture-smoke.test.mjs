import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runReleaseFixtureSmoke } from "../../scripts/release-fixture-smoke.mjs";

test("release fixture smoke validates Claude dry-run and Codex fresh fixtures", () => {
  const result = runReleaseFixtureSmoke({ root: process.cwd() });

  assert.equal(result.ok, true);
  assert.equal(result.checks.claudeMarketplace.ok, true);
  assert.equal(result.checks.codexOperational.ok, true);
  assert.equal(result.checks.codexLite.ok, true);
  assert.match(result.checks.claudeMarketplace.summary, /Claude marketplace dry-run: ok/);
  assert.match(result.checks.codexOperational.summary, /Codex operational fixture: ok/);
  assert.match(result.checks.codexLite.summary, /Codex lite fixture: ok/);
});

test("release fixture smoke CLI emits human-readable summaries", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-fixture-smoke.mjs")], {
    encoding: "utf-8",
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, output);
  assert.match(output, /release fixture smoke: ok/);
  assert.match(output, /Claude marketplace dry-run: ok/);
  assert.match(output, /Codex operational fixture: ok/);
  assert.match(output, /Codex lite fixture: ok/);
});

test("release fixture smoke CLI emits JSON", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-fixture-smoke.mjs"), "--json"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const data = JSON.parse(res.stdout);
  assert.equal(data.ok, true);
  assert.equal(data.checks.claudeMarketplace.ok, true);
  assert.equal(data.checks.codexOperational.ok, true);
  assert.equal(data.checks.codexLite.ok, true);
});
