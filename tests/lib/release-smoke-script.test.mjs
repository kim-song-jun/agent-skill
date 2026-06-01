import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const SCRIPT = resolve("scripts/release-smoke.sh");

test("release-smoke --fast runs Claude and Codex release gates without live CLIs", () => {
  const env = {
    ...process.env,
    PATH: `${dirname(process.execPath)}:${process.env.PATH || "/usr/bin:/bin"}`,
  };
  delete env.NODE_TEST_CONTEXT;

  const res = spawnSync("/bin/bash", [SCRIPT, "--fast"], {
    encoding: "utf-8",
    env,
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(output, /release smoke: Claude marketplace dry-run/);
  assert.match(output, /DRY-RUN: claude plugin install harness-builder@agent-skill/);
  assert.match(output, /release smoke: Codex marketplace dry-run/);
  assert.match(output, /DRY-RUN: claude plugin install harness-builder-codex@agent-skill/);
  assert.match(output, /release smoke: focused release contracts/);
  assert.match(output, /Claude native plugin manifests expose all release skills/);
  assert.match(output, /dispatch-strategy: missing config falls back to sequential/);
  assert.match(output, /vqa dispatch-strategy: missing config falls back to sequential/);
  assert.match(output, /release smoke: vendored libs/);
  assert.match(output, /release smoke complete/);
  assert.doesNotMatch(res.stderr, /claude' binary not found|codex' binary not found/i);
});
