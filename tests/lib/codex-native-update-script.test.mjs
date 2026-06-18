import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const SCRIPT = resolve("scripts/update-codex-plugins.sh");
const CODEX_PLUGINS = [
  "harness-builder-codex@agent-skill",
  "harness-floor-codex@agent-skill",
  "harness-thrift-codex@agent-skill",
  "harness-debug-codex@agent-skill",
];

function requireScript() {
  assert.ok(existsSync(SCRIPT), "scripts/update-codex-plugins.sh must exist");
}

function writeExecutable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function makeTempHome(prefix) {
  const home = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(home, "bin"), { recursive: true });
  return home;
}

test("Codex native updater help and dry-run do not require the codex binary", () => {
  requireScript();

  const help = spawnSync("/bin/bash", [SCRIPT, "--help"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(help.status, 0, `stdout:\n${help.stdout}\nstderr:\n${help.stderr}`);
  assert.match(help.stdout, /Usage: .*update-codex-plugins\.sh/);
  assert.match(help.stdout, /codex plugin marketplace/);
  assert.match(help.stdout, /--dry-run/);

  const dryRun = spawnSync("/bin/bash", [SCRIPT, "--dry-run"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(dryRun.status, 0, `stdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
  assert.match(dryRun.stdout, /DRY-RUN: codex plugin marketplace upgrade agent-skill/);
  for (const plugin of CODEX_PLUGINS) {
    assert.match(dryRun.stdout, new RegExp(`DRY-RUN: codex plugin remove ${plugin}`));
    assert.match(dryRun.stdout, new RegExp(`DRY-RUN: codex plugin add ${plugin}`));
  }
  assert.doesNotMatch(dryRun.stderr, /codex' binary not found/i);
});

test("Codex native updater registers marketplace when upgrade is missing, refreshes all Codex plugins, and verifies enabled installs", () => {
  requireScript();
  const home = makeTempHome("agent-skill-codex-native-update-");
  const binDir = join(home, "bin");
  const log = join(home, "codex.log");
  const upgradeSeen = join(home, "upgrade-seen");

  try {
    writeExecutable(
      join(binDir, "codex"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${log}"
if [ "$*" = "plugin marketplace upgrade agent-skill" ] && [ ! -f "${upgradeSeen}" ]; then
  : > "${upgradeSeen}"
  exit 7
fi
if [ "$*" = "plugin list" ]; then
  cat <<'EOF'
harness-builder-codex@agent-skill installed, enabled 0.6.13
harness-floor-codex@agent-skill installed, enabled 0.6.13
harness-thrift-codex@agent-skill installed, enabled 0.6.13
harness-debug-codex@agent-skill installed, enabled 0.6.13
EOF
  exit 0
fi
exit 0
`,
    );

    const res = spawnSync("/bin/bash", [SCRIPT], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home, PATH: `${binDir}:/usr/bin:/bin` },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /registering agent-skill marketplace/);
    assert.match(res.stdout, /Codex native plugin update complete/);

    const calls = readFileSync(log, "utf-8").trim().split("\n");
    assert.deepEqual(calls.slice(0, 3), [
      "plugin marketplace upgrade agent-skill",
      "plugin marketplace add https://github.com/kim-song-jun/agent-skill",
      "plugin marketplace upgrade agent-skill",
    ]);
    for (const plugin of CODEX_PLUGINS) {
      const removeIndex = calls.indexOf(`plugin remove ${plugin}`);
      const addIndex = calls.indexOf(`plugin add ${plugin}`);
      assert.ok(removeIndex > 1, `missing remove for ${plugin}`);
      assert.ok(addIndex > removeIndex, `add must follow remove for ${plugin}`);
    }
    assert.equal(calls.at(-1), "plugin list");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Codex native updater fails verification when a refreshed plugin is not enabled", () => {
  requireScript();
  const home = makeTempHome("agent-skill-codex-native-update-missing-");
  const binDir = join(home, "bin");

  try {
    writeExecutable(
      join(binDir, "codex"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$*" = "plugin list" ]; then
  cat <<'EOF'
harness-builder-codex@agent-skill installed, enabled 0.6.13
harness-floor-codex@agent-skill installed, enabled 0.6.13
harness-thrift-codex@agent-skill installed, enabled 0.6.13
EOF
  exit 0
fi
exit 0
`,
    );

    const res = spawnSync("/bin/bash", [SCRIPT], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home, PATH: `${binDir}:/usr/bin:/bin` },
    });

    assert.notEqual(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stderr, /harness-debug-codex@agent-skill was not reported as installed, enabled/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
