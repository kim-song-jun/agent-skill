import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ADVISORY_HOOKS = [
  {
    name: "context-mode-router",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs",
  },
  {
    name: "cache-heal",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs",
  },
  {
    name: "session-summary",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs",
  },
  {
    name: "context-mode-cache-heal",
    path: "plugins/harness-builder/hooks/context-mode-cache-heal.mjs",
  },
];

for (const { name, path } of ADVISORY_HOOKS) {
  test(`${name} advisory hook has no silent catch blocks`, () => {
    const body = readFileSync(resolve(path), "utf-8");

    assert.doesNotMatch(
      body,
      /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
      `${path} must warn or explicitly no-op instead of silently swallowing hook errors`,
    );
  });

  test(`${name} advisory hook is valid JavaScript`, () => {
    const result = spawnSync(process.execPath, ["--check", resolve(path)], {
      encoding: "utf-8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}

for (const { name, path } of ADVISORY_HOOKS.filter((hook) =>
  ["context-mode-router", "session-summary"].includes(hook.name),
)) {
  test(`${name} advisory hook reports malformed JSON without blocking`, () => {
    const projectDir = mkdtempSync(resolve(tmpdir(), `${name}-malformed-json-`));
    const result = spawnSync(process.execPath, [resolve(path)], {
      input: "{not-json",
      encoding: "utf-8",
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
      },
    });

    assert.equal(result.status, 0);
    assert.match(
      result.stderr,
      new RegExp(`agent-skill hook warning: ${name}: parse hook payload:`),
    );
    assert.doesNotMatch(result.stdout, /agent-skill hook warning:/);
  });
}
