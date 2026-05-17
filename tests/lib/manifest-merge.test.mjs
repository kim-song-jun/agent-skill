import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings } from "../../plugins/harness-builder/skills/agent-init/lib/manifest-merge.mjs";

test("creates fresh settings when current is empty", () => {
  const out = mergeSettings({}, {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node a.mjs" }] }] },
  });
  assert.deepEqual(out.hooks.SessionStart, [{ hooks: [{ type: "command", command: "node a.mjs" }] }]);
});

test("appends new event entries without dropping existing ones", () => {
  const current = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node existing.mjs" }] }] },
  };
  const additions = {
    hooks: { Stop: [{ hooks: [{ type: "command", command: "node stop.mjs" }] }] },
  };
  const out = mergeSettings(current, additions);
  assert.equal(out.hooks.SessionStart.length, 1);
  assert.equal(out.hooks.Stop.length, 1);
  assert.equal(out.hooks.SessionStart[0].hooks[0].command, "node existing.mjs");
});

test("appends to same event without duplicating identical commands", () => {
  const current = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node a.mjs" }] }] },
  };
  const additions = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node a.mjs" }, { type: "command", command: "node b.mjs" }] }] },
  };
  const out = mergeSettings(current, additions);
  const commands = out.hooks.SessionStart.flatMap(g => g.hooks.map(h => h.command));
  assert.deepEqual(commands.sort(), ["node a.mjs", "node b.mjs"]);
});

test("preserves non-hook fields verbatim", () => {
  const current = { statusLine: { type: "command", command: "echo x" }, hooks: {} };
  const out = mergeSettings(current, { hooks: { Stop: [{ hooks: [{ type: "command", command: "node s.mjs" }] }] } });
  assert.deepEqual(out.statusLine, { type: "command", command: "echo x" });
});
