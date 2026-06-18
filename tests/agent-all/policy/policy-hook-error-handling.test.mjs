import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const POLICY_HOOKS = [
  {
    platform: "claude",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
  },
  {
    platform: "codex",
    path: "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
  },
];

for (const { platform, path } of POLICY_HOOKS) {
  test(`${platform} generated policy hook has no silent catch blocks`, () => {
    const body = readFileSync(resolve(path), "utf-8");

    assert.doesNotMatch(
      body,
      /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
      `${path} must report or fail closed instead of silently swallowing hook errors`,
    );
  });

  test(`${platform} generated policy hook rejects malformed JSON payload`, () => {
    const result = spawnSync(process.execPath, [resolve(path)], {
      input: "{not-json",
      encoding: "utf-8",
      env: { ...process.env, AGENT_POLICY_AUDIT: "0" },
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /malformed hook JSON payload/i);
  });
}
