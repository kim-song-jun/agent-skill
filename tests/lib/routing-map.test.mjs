// tests/lib/routing-map.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTING_TABLE, rankRoutes } from "../../plugins/harness-floor/skills/harness/lib/routing-map.mjs";

const top = (intent) => rankRoutes(intent)[0];

test("routes representative intents to the right target", () => {
  assert.equal(top("debug the failing flaky test").target, "/debug");
  assert.equal(top("this run costs too much, tighten the budget").target, "/thrift");
  assert.equal(top("screenshot the dashboard ui for visual regression").target, "/visual-qa");
  assert.equal(top("set up the harness on a new project").target, "/agent-init");
  assert.equal(top("implement the feature and ship a pr").target, "/agent-all");
  assert.equal(top("audit all the configs and write a research report").target, "Workflow");
  assert.equal(top("map the codebase, where is Foo defined").target, "/explore");
  assert.equal(top("write this decision to the project wiki knowledge base").target, "/wiki");
});

test("empty/garbage intent yields all-zero scores (skill then clarifies)", () => {
  const ranked = rankRoutes("");
  assert.ok(ranked.every((r) => r.score === 0));
  assert.equal(rankRoutes("xyzzy qwerty").every((r) => r.score === 0), true);
});

test("coverage contract: every supported target is in the table", () => {
  const targets = new Set(ROUTING_TABLE.map((r) => r.target));
  for (const t of ["/agent-init","/agent-all","/debug","/explore","/thrift","/wiki","/visual-qa","/data-runner","/agent-handoff","Workflow"]) {
    assert.ok(targets.has(t), `routing table must cover ${t}`);
  }
});
