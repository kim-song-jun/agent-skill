import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const runtimeFiles = [
  "plugins/harness-floor-copilot/bin/install-hooks.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/await-wave.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/dispatch-task.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/hooks/subagent-stop-dispatcher.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs",
];

test("agent-all-copilot shipped runtime files do not carry unresolved TODO markers", () => {
  for (const file of runtimeFiles) {
    const body = readFileSync(resolve(file), "utf-8");
    assert.doesNotMatch(body, /\bTODO\b/, `${file} must document a stable contract instead of shipping TODO debt`);
  }
});
