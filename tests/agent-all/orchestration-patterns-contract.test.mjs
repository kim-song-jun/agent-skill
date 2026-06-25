// tests/agent-all/orchestration-patterns-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const doc = readFileSync(resolve("plugins/harness-floor/skills/agent-all/references/orchestration-patterns.md"), "utf-8");

test("names the patterns agent-all embodies and states the topology is fixed", () => {
  for (const pat of ["fan-out", "generate-verify", "supervisor", "pipeline"]) {
    assert.ok(doc.toLowerCase().includes(pat), `must name the ${pat} pattern`);
  }
  assert.match(doc, /not (selectable|configurable)/i);
});
