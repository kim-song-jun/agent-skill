import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runReleaseFixtureSmoke } from "../../scripts/release-fixture-smoke.mjs";

test("release fixture smoke validates Claude dry-run and Codex fresh fixtures", () => {
  const result = runReleaseFixtureSmoke({ root: process.cwd() });

  assert.equal(result.ok, true);
  assert.equal(result.checks.claudeMarketplace.ok, true);
  assert.equal(result.checks.claudeRendered.ok, true);
  assert.equal(result.checks.claudeLite.ok, true);
  assert.equal(result.checks.claudePlatform.ok, true);
  assert.equal(result.checks.claudePlatformBuilder.ok, true);
  assert.equal(result.checks.claudePlatformLite.ok, true);
  assert.equal(result.checks.claudeUninstall.ok, true);
  assert.equal(result.checks.claudeForceRootClean.ok, true);
  assert.equal(result.checks.codexOperational.ok, true);
  assert.equal(result.checks.codexLite.ok, true);
  assert.equal(result.checks.codexBuilder.ok, true);
  assert.equal(result.checks.codexFloor.ok, true);
  assert.equal(result.checks.codexThrift.ok, true);
  assert.equal(result.checks.codexDebug.ok, true);
  assert.equal(result.checks.codexUninstall.ok, true);
  assert.equal(result.checks.codexForceRootClean.ok, true);
  assert.match(result.checks.claudeMarketplace.summary, /Claude marketplace dry-run: ok/);
  assert.match(result.checks.claudeRendered.summary, /Claude rendered fixture: ok/);
  assert.match(result.checks.claudeRendered.details, /QA and base\/specialized reviewer audit tokens/);
  assert.match(result.checks.claudeLite.summary, /Claude lite fixture: ok/);
  assert.match(result.checks.claudePlatform.summary, /Claude platform fixture: ok \(25\/25 artifacts\)/);
  assert.match(result.checks.claudePlatform.details, /executable generated hooks and task checker/);
  assert.match(result.checks.claudePlatform.details, /QA and base\/specialized reviewer audit tokens/);
  assert.match(result.checks.claudePlatform.details, /post-install Claude platform doctor coverage/);
  assert.match(result.checks.claudePlatform.details, /no HOME patching/);
  assert.match(result.checks.claudePlatformBuilder.summary, /Claude platform builder fixture: ok \(27\/27 file checks\)/);
  assert.match(result.checks.claudePlatformBuilder.details, /only builder-heavy artifacts/);
  assert.match(result.checks.claudePlatformBuilder.details, /post-install Claude builder doctor coverage/);
  assert.match(result.checks.claudePlatformBuilder.details, /no floor configs/);
  assert.match(result.checks.claudePlatformBuilder.details, /no HOME patching/);
  assert.match(result.checks.claudePlatformLite.summary, /Claude platform lite fixture: ok \(25\/25 file checks\)/);
  assert.match(result.checks.claudePlatformLite.details, /executable non-policy hooks/);
  assert.match(result.checks.claudePlatformLite.details, /post-install Claude platform lite doctor coverage/);
  assert.match(result.checks.claudePlatformLite.details, /only lite scaffold files/);
  assert.match(result.checks.claudeUninstall.summary, /Claude uninstall fixture: ok \(13\/13 removals\)/);
  assert.match(result.checks.claudeUninstall.details, /uninstall roundtrip removed generated agents, hooks, task ledger, and floor configs/);
  assert.match(result.checks.claudeUninstall.details, /preserving root guidance/);
  assert.match(result.checks.claudeForceRootClean.summary, /Claude force-root uninstall fixture: ok \(15\/15 removals\)/);
  assert.match(result.checks.claudeForceRootClean.details, /--uninstall --force-root-clean removed generated agents, hooks, task ledger, floor configs, and generated-looking root guidance/);
  assert.match(result.checks.codexOperational.summary, /Codex operational fixture: ok \(26\/26 artifacts\)/);
  assert.match(result.checks.codexOperational.details, /executable hooks\/task checker/);
  assert.match(result.checks.codexOperational.details, /role gate matrix, QA personas/);
  assert.match(result.checks.codexOperational.details, /base\/specialized reviewer audit tokens/);
  assert.match(result.checks.codexOperational.details, /floor, thrift, debug, executable hooks\/task checker, configs/);
  assert.match(result.checks.codexOperational.details, /post-install operational doctor coverage/);
  assert.match(result.checks.codexOperational.details, /sequential agent-all-codex prompt helper runs from the installed fixture/);
  assert.match(result.checks.codexOperational.details, /sequential visual-qa-codex page helper runs from the installed fixture/);
  assert.match(result.checks.codexOperational.details, /positional argv omits unsupported --prompt\/--skill flags/);
  assert.match(result.checks.codexLite.summary, /Codex lite fixture: ok/);
  assert.match(result.checks.codexLite.details, /no hook\/task checker side effects/);
  assert.match(result.checks.codexLite.details, /floor-conditional language guidance/);
  assert.match(result.checks.codexLite.details, /post-install lite doctor coverage/);
  assert.match(result.checks.codexBuilder.summary, /Codex builder fixture: ok \(28\/28 file checks\)/);
  assert.match(result.checks.codexBuilder.details, /executable hook\/task checker/);
  assert.match(result.checks.codexBuilder.details, /post-install builder doctor coverage/);
  assert.match(result.checks.codexBuilder.details, /QA and base\/specialized reviewer audit tokens/);
  assert.match(result.checks.codexBuilder.details, /only Codex builder artifacts/);
  assert.match(result.checks.codexBuilder.details, /floor-conditional language guidance/);
  assert.match(result.checks.codexFloor.summary, /Codex floor fixture: ok \(19\/19 file checks\)/);
  assert.match(result.checks.codexFloor.details, /only Codex floor artifacts/);
  assert.match(result.checks.codexFloor.details, /sequential agent-all-codex helper runtime/);
  assert.match(result.checks.codexFloor.details, /sequential visual-qa-codex helper runtime/);
  assert.match(result.checks.codexThrift.summary, /Codex thrift fixture: ok \(19\/19 file checks\)/);
  assert.match(result.checks.codexThrift.details, /only Codex thrift artifacts/);
  assert.match(result.checks.codexThrift.details, /no-instrument command-hook snippets/);
  assert.match(result.checks.codexDebug.summary, /Codex debug fixture: ok/);
  assert.match(result.checks.codexDebug.details, /only debug-codex artifacts/);
  assert.match(result.checks.codexDebug.details, /post-install debug doctor coverage/);
  assert.match(result.checks.codexUninstall.summary, /Codex uninstall fixture: ok \(15\/15 removals\)/);
  assert.match(result.checks.codexUninstall.details, /uninstall roundtrip removed generated skills, hooks, task ledger, and floor\/thrift configs/);
  assert.match(result.checks.codexUninstall.details, /preserving root guidance, debug evidence, and global config/);
  assert.match(result.checks.codexForceRootClean.summary, /Codex force-root uninstall fixture: ok \(16\/16 removals\)/);
  assert.match(result.checks.codexForceRootClean.details, /--uninstall --force-root-clean removed generated skills, hooks, task ledger, floor\/thrift configs, and generated-looking root guidance/);
});

test("release fixture smoke CLI emits human-readable summaries", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-fixture-smoke.mjs")], {
    encoding: "utf-8",
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, output);
  assert.match(output, /release fixture smoke: ok/);
  assert.match(output, /Claude marketplace dry-run: ok/);
  assert.match(output, /Claude rendered fixture: ok/);
  assert.match(output, /Claude lite fixture: ok/);
  assert.match(output, /Claude platform fixture: ok/);
  assert.match(output, /Claude platform builder fixture: ok/);
  assert.match(output, /Claude platform lite fixture: ok/);
  assert.match(output, /Claude uninstall fixture: ok/);
  assert.match(output, /Claude force-root uninstall fixture: ok/);
  assert.match(output, /Codex operational fixture: ok/);
  assert.match(output, /Codex lite fixture: ok/);
  assert.match(output, /Codex builder fixture: ok/);
  assert.match(output, /Codex floor fixture: ok/);
  assert.match(output, /Codex thrift fixture: ok/);
  assert.match(output, /Codex debug fixture: ok/);
  assert.match(output, /Codex uninstall fixture: ok/);
  assert.match(output, /Codex force-root uninstall fixture: ok/);
});

test("release fixture smoke CLI emits JSON", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-fixture-smoke.mjs"), "--json"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const data = JSON.parse(res.stdout);
  assert.equal(data.ok, true);
  assert.equal(data.checks.claudeMarketplace.ok, true);
  assert.equal(data.checks.claudeRendered.ok, true);
  assert.equal(data.checks.claudeLite.ok, true);
  assert.equal(data.checks.claudePlatform.ok, true);
  assert.equal(data.checks.claudePlatformBuilder.ok, true);
  assert.equal(data.checks.claudePlatformLite.ok, true);
  assert.equal(data.checks.claudeUninstall.ok, true);
  assert.equal(data.checks.claudeForceRootClean.ok, true);
  assert.equal(data.checks.codexOperational.ok, true);
  assert.equal(data.checks.codexLite.ok, true);
  assert.equal(data.checks.codexBuilder.ok, true);
  assert.equal(data.checks.codexFloor.ok, true);
  assert.equal(data.checks.codexThrift.ok, true);
  assert.equal(data.checks.codexDebug.ok, true);
  assert.equal(data.checks.codexUninstall.ok, true);
  assert.equal(data.checks.codexForceRootClean.ok, true);
});
