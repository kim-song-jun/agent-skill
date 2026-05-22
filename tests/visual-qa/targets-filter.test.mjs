import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTarget, parseAction } from "../../plugins/harness-floor/skills/visual-qa/lib/targets-filter.mjs";

function makeCheck(matchingSelectors) {
  return {
    selector: "(stub)",
    isMatch: (sel) => matchingSelectors.includes(sel),
  };
}

test("excludeSelectors win: matching element is skipped before include is even checked", () => {
  const r = resolveTarget(makeCheck([".analytics", "button"]), {
    excludeSelectors: [".analytics"],
    includeSelectors: ["button"],
    actionsPerElement: { button: ["click"] },
  });
  assert.equal(r.capture, false);
  assert.match(r.reason, /excluded/);
});

test("includeSelectors non-empty requires a match", () => {
  const r = resolveTarget(makeCheck(["div"]), {
    includeSelectors: ["button", "a"],
    actionsPerElement: {},
  });
  assert.equal(r.capture, false);
  assert.match(r.reason, /no include/);
});

test("includeSelectors empty means everything passes (auto-discovery default)", () => {
  const r = resolveTarget(makeCheck(["button"]), {
    excludeSelectors: [],
    includeSelectors: [],
    actionsPerElement: { button: ["click"], default: ["click"] },
  });
  assert.equal(r.capture, true);
  assert.equal(r.action, "click");
});

test("actionsPerElement preserves declaration order: first matching key wins", () => {
  const r = resolveTarget(makeCheck(["[role=tab]", "button"]), {
    actionsPerElement: {
      "[role=tab]": ["click"],
      button: ["hover"],
      default: ["click"],
    },
  });
  assert.equal(r.action, "click"); // tab matched first, click wins over hover
  assert.match(r.reason, /\[role=tab\]/);
});

test("actionsPerElement default runs when no specific key matches", () => {
  const r = resolveTarget(makeCheck(["span"]), {
    actionsPerElement: { button: ["click"], default: ["hover"] },
  });
  assert.equal(r.action, "hover");
  assert.match(r.reason, /default/);
});

test("no actionsPerElement at all → built-in default click", () => {
  const r = resolveTarget(makeCheck(["button"]), { actionsPerElement: {} });
  assert.equal(r.action, "click");
});

test("parseAction handles 'fill:value' form", () => {
  assert.deepEqual(parseAction("fill:vqa-sample"), { kind: "fill", arg: "vqa-sample" });
});

test("parseAction handles colonless forms", () => {
  assert.deepEqual(parseAction("click"), { kind: "click", arg: null });
  assert.deepEqual(parseAction("blur"), { kind: "blur", arg: null });
  assert.deepEqual(parseAction("hover"), { kind: "hover", arg: null });
});

test("parseAction preserves multi-colon args (e.g. 'select:option:nth(2)')", () => {
  const r = parseAction("select:option:nth(2)");
  assert.equal(r.kind, "select");
  assert.equal(r.arg, "option:nth(2)");
});

test("parseAction defaults to click for empty/garbage input", () => {
  assert.deepEqual(parseAction(""), { kind: "click", arg: null });
  assert.deepEqual(parseAction(null), { kind: "click", arg: null });
  assert.deepEqual(parseAction(undefined), { kind: "click", arg: null });
});
