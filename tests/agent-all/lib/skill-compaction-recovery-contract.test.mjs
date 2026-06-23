import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/SKILL.md"), "utf-8");

test("SKILL documents in-session compaction recovery", () => {
  const body = read();
  assert.match(body, /## Compaction recovery/i, "has a Compaction recovery section");
  assert.match(body, /session-resume/i, "references the re-injection hook directive");
  assert.match(body, /max\(.*phase.*\)|max phase|max\(phases/i, "self-heal: resume after max completed phase");
  assert.match(body, /never restart from Phase 0/i, "forbids Phase 0 restart on a running state");
  assert.match(body, /do not stop after[\s\S]{0,40}plan|never stop after Phase 2/i, "forbids stopping after the plan");
});
