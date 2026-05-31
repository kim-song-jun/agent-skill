import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = "scripts/update.sh";
const script = readFileSync(scriptPath, "utf-8");

function indexOfRequired(text) {
  const index = script.indexOf(text);
  assert.notEqual(index, -1, `${scriptPath} must include ${text}`);
  return index;
}

test("update script supports dry-run, codex platform selection, and install-all delegation", () => {
  assert.match(script, /--dry-run/);
  assert.match(script, /--cli=codex/);
  assert.match(script, /exec bash "\$REPO_ROOT\/scripts\/install-all\.sh"/);
});

test("update script describes the foundation update plan before changing state", () => {
  const planIndex = indexOfRequired("foundation update plan");
  for (const mutation of [
    "git -C \"$REPO_ROOT\" pull",
    "claude plugin marketplace update",
    "claude plugin uninstall",
    "claude plugin install",
    "exec bash \"$REPO_ROOT/scripts/install-all.sh\"",
  ]) {
    const mutationIndex = indexOfRequired(mutation);
    assert.ok(
      planIndex < mutationIndex,
      `foundation update plan must be printed before ${mutation}`,
    );
  }
});

test("dry-run exits before git pull, marketplace update, uninstall, or install commands", () => {
  const dryRunIndex = indexOfRequired("DRY_RUN=0");
  const dryRunGuardIndex = indexOfRequired("Dry run requested; no git pull");
  const dryRunExitIndex = script.indexOf("exit 0", dryRunGuardIndex);
  assert.notEqual(dryRunExitIndex, -1, "dry-run guard must exit 0");
  assert.ok(dryRunIndex < dryRunGuardIndex, "dry-run must be parsed before the guard");

  for (const mutation of [
    "git -C \"$REPO_ROOT\" pull",
    "claude plugin marketplace update",
    "claude plugin uninstall",
    "claude plugin install",
    "exec bash \"$REPO_ROOT/scripts/install-all.sh\"",
  ]) {
    const mutationIndex = indexOfRequired(mutation);
    assert.ok(dryRunExitIndex < mutationIndex, `dry-run exit must precede ${mutation}`);
  }
});

test("selected platform flags are passed through with sanitized PASSTHROUGH array", () => {
  assert.match(script, /PASSTHROUGH=\(\)/);
  for (const flag of [
    "--all",
    "--cli=codex",
    "--cli=copilot",
    "--cli=gemini",
    "--cli=cursor",
    "--claude-code",
  ]) {
    assert.match(script, new RegExp(flag.replace("=", "=")), `must preserve ${flag}`);
  }
  assert.match(script, /PASSTHROUGH\+=\("\$arg"\)/);
  assert.doesNotMatch(
    script,
    /install-all\.sh" "\$@"/,
    "install-all.sh delegation must not forward raw $@",
  );
});

test("no-argument update delegates to install-all with no passthrough args", () => {
  const fakeRepo = mkdtempSync(join(tmpdir(), "agent-skill-update-test-"));
  const scriptsDir = join(fakeRepo, "scripts");
  const binDir = join(fakeRepo, "bin");
  const argsFile = join(fakeRepo, "install-args.txt");

  mkdirSync(scriptsDir);
  mkdirSync(binDir);
  mkdirSync(join(fakeRepo, ".git"));
  copyFileSync(scriptPath, join(scriptsDir, "update.sh"));

  writeExecutable(
    join(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "-C" ]; then
  shift 2
fi
case "\${1:-}" in
  pull)
    exit 0
    ;;
  rev-parse)
    echo main
    exit 0
    ;;
esac
exit 0
`,
  );
  writeExecutable(join(binDir, "node"), "#!/usr/bin/env bash\nexit 0\n");
  writeExecutable(join(binDir, "claude"), "#!/usr/bin/env bash\necho ok\n");
  writeExecutable(
    join(scriptsDir, "install-all.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
: > "${argsFile}"
if [ "$#" -gt 0 ]; then
  printf '%s\\n' "$@" > "${argsFile}"
fi
`,
  );

  const result = spawnSync("bash", [join(scriptsDir, "update.sh")], {
    cwd: fakeRepo,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      HOME: fakeRepo,
    },
    encoding: "utf-8",
  });

  assert.equal(
    result.status,
    0,
    `update.sh should exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.equal(readFileSync(argsFile, "utf-8"), "");
});

function writeExecutable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}
