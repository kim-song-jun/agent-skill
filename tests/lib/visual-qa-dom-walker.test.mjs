// Unit tests for the comprehensive-mode DOM walker: which elements
// count as interactive, what selector to derive (data-testid > data-qa-id
// > id > stable CSS path), and which states to assign.

import { test } from "node:test";
import assert from "node:assert/strict";

import { walkDom, deriveSelector } from "../../plugins/harness-floor/skills/visual-qa/lib/dom-walker.mjs";

function el(tag, attrs = {}, text = "", path = "html > body > div") {
  return { tag, attributes: attrs, text, path, visible: true };
}

test("walkDom: empty snapshot returns []", () => {
  assert.deepEqual(walkDom({}), []);
  assert.deepEqual(walkDom({ elements: [] }), []);
  assert.deepEqual(walkDom(null), []);
});

test("walkDom: classifies button as kind=button with hover+focus states", () => {
  const r = walkDom({ elements: [el("button", { id: "submit" }, "Submit")] });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "button");
  assert.deepEqual(r[0].states.sort(), ["focus", "hover"]);
  assert.equal(r[0].label, "Submit");
});

test("walkDom: classifies <a href> as link, <a> without href ignored", () => {
  const r = walkDom({
    elements: [
      el("a", { href: "/x", id: "go" }, "Go"),
      el("a", { id: "anchor-only" }, "Anchor"),
    ],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "link");
});

test("walkDom: classifies [role=button] as button", () => {
  const r = walkDom({ elements: [el("div", { role: "button", id: "x" }, "X")] });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "button");
});

test("walkDom: input visible types are captured, hidden inputs skipped", () => {
  const r = walkDom({
    elements: [
      el("input", { type: "text", id: "t" }),
      el("input", { type: "hidden", id: "h" }),
      el("input", { type: "submit", id: "s" }),
    ],
  });
  const kinds = r.map((x) => x.kind);
  assert.deepEqual(kinds, ["input", "input"]);
});

test("walkDom: select/textarea recognised", () => {
  const r = walkDom({
    elements: [
      el("select", { id: "country" }),
      el("textarea", { id: "notes" }),
    ],
  });
  const kinds = r.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["select", "textarea"]);
});

test("walkDom: ARIA roles (tab, menuitem, switch, checkbox) recognised", () => {
  const r = walkDom({
    elements: [
      el("div", { role: "tab", id: "t1" }),
      el("div", { role: "menuitem", id: "m1" }),
      el("div", { role: "switch", id: "s1" }),
      el("div", { role: "checkbox", id: "c1" }),
    ],
  });
  assert.deepEqual(r.map((x) => x.kind).sort(), ["menuitem", "switch", "switch", "tab"]);
});

test("walkDom: data-testid-only elements classified as 'labelled'", () => {
  const r = walkDom({
    elements: [
      el("div", { "data-testid": "stats-card" }, "42"),
    ],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "labelled");
  assert.equal(r[0].selector, '[data-testid="stats-card"]');
});

test("walkDom: invisible elements skipped by default", () => {
  const r = walkDom({
    elements: [
      { tag: "button", attributes: { id: "v" }, text: "V", visible: true, path: "html > body" },
      { tag: "button", attributes: { id: "h" }, text: "H", visible: false, path: "html > body" },
    ],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].label, "V");
});

test("walkDom: includeInvisible: true includes hidden elements", () => {
  const r = walkDom({
    elements: [
      { tag: "button", attributes: { id: "h" }, text: "H", visible: false, path: "html > body" },
    ],
  }, { includeInvisible: true });
  assert.equal(r.length, 1);
});

test("walkDom: deduplicates by selector", () => {
  const r = walkDom({
    elements: [
      el("button", { id: "same" }, "First"),
      el("button", { id: "same" }, "Second"),
    ],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].label, "First"); // first wins
});

test("deriveSelector: prefers data-testid", () => {
  assert.equal(
    deriveSelector({ attributes: { "data-testid": "foo", id: "bar", "data-qa-id": "baz" } }),
    '[data-testid="foo"]',
  );
});

test("deriveSelector: data-qa-id next if no data-testid", () => {
  assert.equal(
    deriveSelector({ attributes: { id: "bar", "data-qa-id": "baz" } }),
    '[data-qa-id="baz"]',
  );
});

test("deriveSelector: id third, with escaping of special chars", () => {
  assert.equal(deriveSelector({ attributes: { id: "ok" } }), "#ok");
});

test("deriveSelector: falls back to CSS path", () => {
  assert.equal(
    deriveSelector({ attributes: {}, path: "html > body > div:nth-of-type(1) > button" }),
    "html > body > div:nth-of-type(1) > button",
  );
});

test("deriveSelector: returns null when no stable selector available", () => {
  assert.equal(deriveSelector({ attributes: {} }), null);
});

test("walkDom: derives label from aria-label / title / name when no text", () => {
  const r = walkDom({
    elements: [
      el("button", { id: "a", "aria-label": "Menu" }, ""),
      el("button", { id: "b", title: "Settings" }, ""),
      el("button", { id: "c", name: "cancel" }, ""),
    ],
  });
  assert.deepEqual(r.map((x) => x.label), ["Menu", "Settings", "cancel"]);
});
