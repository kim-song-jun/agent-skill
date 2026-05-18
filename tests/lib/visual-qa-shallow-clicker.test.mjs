// Tests the shallow-click expander: every clickable gets clicked, the
// resulting state is screenshotted, then the page reverts. Input
// elements (text/select/textarea) are skipped by default.

import { test } from "node:test";
import assert from "node:assert/strict";

import { shallowClick } from "../../plugins/harness-floor/skills/visual-qa/lib/shallow-clicker.mjs";

function makeHooks(overrides = {}) {
  const calls = { click: [], waitStable: [], screenshot: [], revert: [] };
  const hooks = {
    click: async (args) => { calls.click.push(args); return {}; },
    waitStable: async (args) => { calls.waitStable.push(args); },
    screenshot: async (args) => { calls.screenshot.push(args); return `/tmp/${args.suffix}.png`; },
    revert: async (args) => { calls.revert.push(args); },
    ...overrides,
  };
  return { hooks, calls };
}

test("shallowClick: clicks each button, screenshots after stable wait, reverts", async () => {
  const { hooks, calls } = makeHooks();
  const out = await shallowClick({
    pagePath: "/",
    clickables: [
      { selector: "#a", kind: "button", label: "A" },
      { selector: "#b", kind: "button", label: "B" },
    ],
    hooks,
  });
  assert.equal(out.captures.length, 2);
  assert.equal(calls.click.length, 2);
  assert.equal(calls.waitStable.length, 2);
  assert.equal(calls.screenshot.length, 2);
  assert.equal(calls.revert.length, 2);
  assert.match(out.captures[0].path, /clicked__/);
});

test("shallowClick: input / select / textarea skipped by default", async () => {
  const { hooks, calls } = makeHooks();
  const out = await shallowClick({
    pagePath: "/form",
    clickables: [
      { selector: "#text", kind: "input" },
      { selector: "#dropdown", kind: "select" },
      { selector: "#notes", kind: "textarea" },
      { selector: "#submit", kind: "button" },
    ],
    hooks,
  });
  assert.equal(out.captures.length, 1);
  assert.equal(out.captures[0].selector, "#submit");
  assert.equal(calls.click.length, 1);
});

test("shallowClick: link kind is NOT skipped (link click captures next-state)", async () => {
  const { hooks } = makeHooks({ click: async () => ({ navigated: true }) });
  const out = await shallowClick({
    pagePath: "/",
    clickables: [{ selector: "a#nav", kind: "link", label: "Nav" }],
    hooks,
  });
  assert.equal(out.captures.length, 1);
  assert.equal(out.captures[0].navigated, true);
});

test("shallowClick: dialog-triggering click is captured as an error, not retried", async () => {
  const { hooks, calls } = makeHooks({
    click: async () => ({ dialog: "Are you sure?" }),
  });
  const out = await shallowClick({
    pagePath: "/",
    clickables: [{ selector: "#delete", kind: "button" }],
    hooks,
  });
  assert.equal(out.captures.length, 1);
  assert.match(out.captures[0].error, /dialog triggered/);
  assert.equal(out.errors.length, 1);
  // No screenshot for dialog-triggering clicks.
  assert.equal(calls.screenshot.length, 0);
  // But we still revert.
  assert.equal(calls.revert.length, 1);
});

test("shallowClick: click throw is logged, run continues", async () => {
  let i = 0;
  const { hooks, calls } = makeHooks({
    click: async () => {
      i += 1;
      if (i === 1) throw new Error("element detached");
      return {};
    },
  });
  const out = await shallowClick({
    pagePath: "/",
    clickables: [
      { selector: "#flaky", kind: "button" },
      { selector: "#ok",    kind: "button" },
    ],
    hooks,
  });
  assert.equal(out.captures.length, 2);
  assert.match(out.captures[0].error, /element detached/);
  assert.equal(out.captures[1].error, undefined);
  assert.equal(calls.revert.length, 2);
});

test("shallowClick: revert failure recorded as blocker severity", async () => {
  const { hooks } = makeHooks({
    revert: async () => { throw new Error("page closed"); },
  });
  const out = await shallowClick({
    pagePath: "/",
    clickables: [{ selector: "#x", kind: "button" }],
    hooks,
  });
  const blocker = out.errors.find((e) => e.severity === "blocker");
  assert.ok(blocker, "expected a blocker-severity error");
  assert.match(blocker.error, /revert failed/);
});

test("shallowClick: throws on missing hooks", async () => {
  await assert.rejects(
    () => shallowClick({ pagePath: "/", clickables: [], hooks: {} }),
    /requires hooks/,
  );
});

test("shallowClick: invalid clickables array rejected", async () => {
  const { hooks } = makeHooks();
  await assert.rejects(
    () => shallowClick({ pagePath: "/", clickables: "not-an-array", hooks }),
    /clickables array/,
  );
});

test("shallowClick: options.skipKinds overrides default skip set", async () => {
  const { hooks, calls } = makeHooks();
  await shallowClick({
    pagePath: "/",
    clickables: [
      { selector: "#text", kind: "input" },
      { selector: "#btn",  kind: "button" },
    ],
    hooks,
    options: { skipKinds: ["button"] }, // skip buttons, click inputs
  });
  assert.equal(calls.click.length, 1);
  assert.equal(calls.click[0].selector, "#text");
});
