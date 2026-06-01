import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  assert.match(output, /install-hook: planMerge is a no-op while Codex agent hooks are unsupported/);
  assert.match(output, /agent-all-codex: hook snippet does not emit unsupported agent hook/);
  assert.match(output, /dispatch-strategy: missing config falls back to sequential/);
  assert.match(output, /vqa dispatch-strategy: missing config falls back to sequential/);
  assert.match(output, /release smoke: vendored libs/);
  assert.match(output, /release smoke complete/);
  assert.doesNotMatch(res.stderr, /claude' binary not found|codex' binary not found/i);
});

test("release-smoke --fast --with-live-cli probes Claude and Codex binaries", () => {
  const binDir = mkdtempSync(resolve(tmpdir(), "agent-skill-live-cli-"));
  const claude = resolve(binDir, "claude");
  const codex = resolve(binDir, "codex");
  writeFileSync(claude, "#!/usr/bin/env bash\necho '2.1.158 (Claude Code)'\n");
  writeFileSync(codex, [
    "#!/usr/bin/env bash",
    "if [ \"$1\" = \"exec\" ] && [ \"$2\" = \"--help\" ]; then",
    "  echo 'Usage: codex exec [OPTIONS] [PROMPT]'",
    "  exit 0",
    "fi",
    "echo 'codex-cli 0.135.0'",
    "",
  ].join("\n"));
  chmodSync(claude, 0o755);
  chmodSync(codex, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${dirname(process.execPath)}:${process.env.PATH || "/usr/bin:/bin"}`,
  };
  delete env.NODE_TEST_CONTEXT;

  let res;
  try {
    res = spawnSync("/bin/bash", [SCRIPT, "--fast", "--with-live-cli"], {
      encoding: "utf-8",
      env,
    });
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(output, /release smoke: live Claude\/Codex CLI probes/);
  assert.match(output, /claude: 2\.1\.158 \(Claude Code\)/);
  assert.match(output, /codex: codex-cli 0\.135\.0/);
  assert.match(output, /codex exec: positional prompt interface/);
});
