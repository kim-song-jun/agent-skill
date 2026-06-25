// tests/agent-init/prior-panel-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const phase1 = readFileSync(resolve("plugins/harness-builder/skills/agent-init/phases/1-discover.md"), "utf-8");

test("Phase 1 invokes derivePriors before brainstorming", () => {
  assert.match(phase1, /derivePriors/);
  assert.match(phase1, /AskUserQuestion/);
  const idxPriors = phase1.indexOf("derivePriors");
  const idxBrainstorm = phase1.indexOf("superpowers:brainstorming");
  assert.ok(idxPriors < idxBrainstorm, "derivePriors must be called before brainstorming");
});

test("Phase 1 ctx carries the derived priors forward", () => {
  assert.match(phase1, /priors,\s*\/\//);
});

test("SKILL.md documents the derive-priors lib module", () => {
  const skill = readFileSync(resolve("plugins/harness-builder/skills/agent-init/SKILL.md"), "utf-8");
  assert.match(skill, /derive-priors\.mjs/);
});
