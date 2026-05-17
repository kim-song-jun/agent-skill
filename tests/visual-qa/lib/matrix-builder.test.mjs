import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatrix } from "../../../plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs";

test("page with no components yields one _page entry per breakpoint", () => {
  const cfg = {
    breakpoints: [{ name: "m", width: 1, height: 1 }, { name: "d", width: 2, height: 2 }],
    pages: [{ name: "home", path: "/", components: [] }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 2);
  assert.ok(m.every(e => e.kind === "page"));
});

test("component with no states yields default only", () => {
  const cfg = {
    breakpoints: [{ name: "d", width: 1, height: 1 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button" }],
    }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 2);
  assert.equal(m[1].state, "default");
});

test("component with states yields default + each state", () => {
  const cfg = {
    breakpoints: [{ name: "d", width: 1, height: 1 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button", states: ["hover", "focus"] }],
    }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 4);
  assert.deepEqual(m.filter(e => e.kind === "component").map(e => e.state).sort(), ["default", "focus", "hover"]);
});

test("flows produce flow_step entries per screenshot action", () => {
  const cfg = {
    breakpoints: [{ name: "d", width: 1, height: 1 }],
    pages: [],
    flows: [
      { name: "f", steps: [{ goto: "/x" }, { screenshot: "a" }, { click: "btn" }, { screenshot: "b" }] },
    ],
  };
  const m = buildMatrix(cfg);
  const flowSteps = m.filter(e => e.kind === "flow_step");
  assert.equal(flowSteps.length, 2);
  assert.deepEqual(flowSteps.map(e => e.label), ["a", "b"]);
});

test("matrix total: 2 bp × (1 page + 1 component × 2 states) = 6 + 2 flow_steps = 8", () => {
  const cfg = {
    breakpoints: [{ name: "m", width: 1, height: 1 }, { name: "d", width: 2, height: 2 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button", states: ["hover"] }],
    }],
    flows: [{ name: "f", steps: [{ screenshot: "a" }, { screenshot: "b" }] }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 8);
});
