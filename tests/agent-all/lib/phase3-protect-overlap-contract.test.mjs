import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/phases/3-dispatch.md"), "utf-8");

test("Phase 3 detects dirtySnapshot ∩ plan target files", () => {
  const body = read();
  assert.match(body, /overlap/i, "computes an overlap set");
  assert.match(body, /dirtySnapshot[\s\S]{0,200}(target|Create|Modify|plan)/i,
    "intersects the protected set with the plan's target files");
});

test("Phase 3 surfaces an adopt vs keep-protected decision (default keep)", () => {
  const body = read();
  assert.match(body, /agent-interaction/i, "uses a decision (no auto-approve)");
  assert.match(body, /adopt/i, "offers adopt (un-protect + commit together)");
  assert.match(body, /keep protected[\s\S]{0,80}default/i, "default arm is keep-protected");
  assert.match(body, /AGENT_ALL_DIRTY_SNAPSHOT/, "re-exports the env contract after adopt");
  assert.match(body, /awaitingUser/, "marks awaitingUser while the decision is pending");
});
