import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFoundationState } from "../../plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs";

test("marks harness as healthy when superpowers and context-mode are installed", () => {
  const result = scanFoundationState({
    installedPluginIds: ["superpowers@claude-plugins-official", "context-mode@context-mode"],
  });
  assert.equal(result.degraded, false);
  assert.deepEqual(result.missing, []);
});

test("reports missing foundations without aborting", () => {
  const result = scanFoundationState({ installedPluginIds: ["harness-builder@agent-skill"] });
  assert.equal(result.degraded, true);
  assert.deepEqual(result.missing, ["superpowers", "context-mode"]);
  assert.match(result.updateCommand, /scripts\/update\.sh.*--foundations-only/);
  assert.match(result.instructions.join("\n"), /plugin install superpowers/);
});
