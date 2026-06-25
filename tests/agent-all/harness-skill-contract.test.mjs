// tests/agent-all/harness-skill-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTING_TABLE } from "../../plugins/harness-floor/skills/harness/lib/routing-map.mjs";

const skill = readFileSync(resolve("plugins/harness-floor/skills/harness/SKILL.md"), "utf-8");
const doc = readFileSync(resolve("plugins/harness-floor/skills/harness/references/routing-map.md"), "utf-8");

test("SKILL.md has frontmatter name harness and documents confirm-before-invoke", () => {
  assert.match(skill, /^---\nname: harness\n/);
  assert.match(skill, /AskUserQuestion/);
  assert.match(skill, /confirm/i);
  assert.match(skill, /rankRoutes/);
});

test("SKILL.md never claims silent auto-routing", () => {
  assert.doesNotMatch(skill, /auto-?invoke without|automatically run/i);
});

test("routing-map.md lists every ROUTING_TABLE target (human doc ↔ data parity)", () => {
  for (const route of ROUTING_TABLE) {
    assert.ok(doc.includes(route.target), `routing-map.md must list ${route.target}`);
  }
});
