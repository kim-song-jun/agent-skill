import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirtyPaths } from "../../../plugins/harness-floor/skills/agent-all/lib/git-state-reader.mjs";

test("parseDirtyPaths extracts paths, strips XY status, resolves renames to new path", () => {
  assert.deepEqual(
    parseDirtyPaths([" M src/a.py", "?? new.txt", "R  old.py -> renamed.py", "MM staged-and-dirty.js"]),
    ["src/a.py", "new.txt", "renamed.py", "staged-and-dirty.js"],
  );
});

test("parseDirtyPaths returns [] for an empty/clean status", () => {
  assert.deepEqual(parseDirtyPaths([]), []);
});
