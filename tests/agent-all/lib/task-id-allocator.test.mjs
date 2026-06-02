import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateTaskId } from "../../../plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs";

test("allocates next integer from index and filenames", () => {
  const result = allocateTaskId({
    indexText: "- [ ] 7-old: docs/tasks/7-old.md\n- [ ] 12-new: docs/tasks/12-new.md\n",
    filenames: ["001-first.md", "09-nine.md"],
  });
  assert.equal(result, 13);
});

test("rejects explicit collision", () => {
  assert.throws(() => allocateTaskId({ indexText: "", filenames: ["3-x.md"], requestedId: 3 }), /collides/);
});

test("rejects invalid explicit task ids", () => {
  assert.throws(() => allocateTaskId({ requestedId: 0 }), /positive integer/);
  assert.throws(() => allocateTaskId({ requestedId: "4.5" }), /positive integer/);
});
