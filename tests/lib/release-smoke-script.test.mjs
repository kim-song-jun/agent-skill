import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const SCRIPT = resolve("scripts/release-smoke.sh");

test("release-smoke --fast runs Claude and Codex release gates without live CLIs", () => {
  const res = spawnSync("/bin/bash", [SCRIPT, "--fast"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /release smoke: Claude marketplace dry-run/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install harness-builder@agent-skill/);
  assert.match(res.stdout, /release smoke: Codex marketplace dry-run/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install harness-builder-codex@agent-skill/);
  assert.match(res.stdout, /release smoke: focused release contracts/);
  assert.match(res.stdout, /release smoke: vendored libs/);
  assert.match(res.stdout, /release smoke complete/);
  assert.doesNotMatch(res.stderr, /claude' binary not found|codex' binary not found/i);
});
