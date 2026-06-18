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
  assert.match(output, /release smoke: release readiness audit/);
  assert.match(output, /Claude: ok/);
  assert.match(output, /Codex: ok/);
  assert.match(output, /release smoke: GitHub governance check/);
  assert.match(output, /github governance check: ok/);
  assert.match(output, /release smoke: docs structure check/);
  assert.match(output, /docs structure check: ok/);
  assert.match(output, /release smoke: release provenance manifest smoke/);
  assert.match(output, /"schemaVersion": "agent-skill-release-manifest\/v1"/);
  assert.match(output, /"pluginCount": 19/);
  assert.match(output, /release smoke: fresh release fixtures/);
  assert.match(output, /release fixture smoke: ok/);
  assert.match(output, /Claude rendered fixture: ok/);
  assert.match(output, /Claude lite fixture: ok/);
  assert.match(output, /Claude uninstall fixture: ok/);
  assert.match(output, /Claude force-root uninstall fixture: ok/);
  assert.match(output, /Codex operational fixture: ok/);
  assert.match(output, /Codex lite fixture: ok/);
  assert.match(output, /Codex builder fixture: ok/);
  assert.match(output, /Codex floor fixture: ok/);
  assert.match(output, /Codex thrift fixture: ok/);
  assert.match(output, /Codex uninstall fixture: ok/);
  assert.match(output, /Codex force-root uninstall fixture: ok/);
  assert.match(output, /release smoke: skill utility eval smoke/);
  assert.match(output, /"schemaVersion": "agent-skill-eval-report\/v1"/);
  assert.match(output, /"runCount": 6/);
  assert.match(output, /release smoke: Claude marketplace dry-run/);
  assert.match(output, /DRY-RUN: claude plugin install harness-builder@agent-skill/);
  assert.match(output, /release smoke: Codex marketplace dry-run/);
  assert.match(output, /DRY-RUN: install harness-builder-codex@agent-skill for Codex CLI/);
  assert.match(output, /DRY-RUN: install harness-debug-codex@agent-skill for Codex CLI/);
  assert.match(output, /release smoke: Codex native plugin updater dry-run/);
  assert.match(output, /DRY-RUN: codex plugin marketplace upgrade agent-skill/);
  assert.match(output, /DRY-RUN: codex plugin add harness-debug-codex@agent-skill/);
  assert.match(output, /release smoke: focused release contracts/);
  assert.match(output, /ℹ tests 479\b/);
  assert.match(output, /ℹ pass 479\b/);
  assert.doesNotMatch(output, /ℹ tests (424|425|427|428|429|430|431|432|433|435|450|452|461|470|480|492|495|498|500|501|504|505)\b/);
  assert.match(output, /Claude native plugin manifests expose all release skills/);
  assert.match(output, /agent-init Codex CLI help documents canonical release flags/);
  assert.match(output, /install-hook: planMerge is a no-op while Codex agent hooks are unsupported/);
  assert.match(output, /\/agent-all Codex hook snippet does not emit unsupported agent hook/);
  assert.match(output, /dispatch-strategy: missing config falls back to sequential/);
  assert.match(output, /vqa dispatch-strategy: missing config falls back to sequential/);
  assert.match(output, /release smoke: vendored libs/);
  assert.match(output, /release smoke: support matrix/);
  assert.match(output, /release smoke complete/);
  assert.doesNotMatch(res.stderr, /claude' binary not found|codex' binary not found/i);
});

test("release-smoke --fast --with-live-cli probes Claude and Codex binaries", () => {
  const binDir = mkdtempSync(resolve(tmpdir(), "agent-skill-live-cli-"));
  const claude = resolve(binDir, "claude");
  const codex = resolve(binDir, "codex");
  writeFileSync(claude, [
    "#!/usr/bin/env bash",
    "case \"$*\" in",
    "  \"--version\")",
    "    echo '2.1.158 (Claude Code)'",
    "    ;;",
    "  \"plugin --help\")",
    "    echo 'Usage: claude plugin|plugins [options] [command]'",
    "    echo 'Commands:'",
    "    echo '  install|i [options] <plugin>         Install a plugin from available marketplaces'",
    "    echo '  marketplace                          Manage Claude Code marketplaces'",
    "    ;;",
    "  \"plugin marketplace --help\")",
    "    echo 'Usage: claude plugin marketplace [options] [command]'",
    "    echo 'Commands:'",
    "    echo '  add [options] <source>      Add a marketplace from a URL, path, or GitHub repo'",
    "    echo '  update [options] [name]     Update marketplace(s) from their source'",
    "    ;;",
    "  \"plugin install --help\")",
    "    echo 'Usage: claude plugin install|i [options] <plugin>'",
    "    echo 'Options:'",
    "    echo '  -s, --scope <scope>   Installation scope: user, project, or local'",
    "    ;;",
    "  *)",
    "    echo \"unexpected claude args: $*\" >&2",
    "    exit 64",
    "    ;;",
    "esac",
    "",
  ].join("\n"));
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
  assert.match(output, /claude plugin: marketplace\/install surface/);
  assert.match(output, /codex exec: positional prompt interface/);
});
