import { test } from "node:test";
import assert from "node:assert/strict";
import { computeElementIdentity, matchBaseline, implicitRole } from "../../plugins/harness-floor/skills/visual-qa/lib/element-identity.mjs";

test("tier 1: explicit data-vqa-id wins over everything else", () => {
  const r = computeElementIdentity({
    vqaId: "profile-menu-toggle",
    role: "button", accessibleName: "Profile", tagName: "button",
    selector: ".x-12", domPath: "html>body>div>button",
  });
  assert.equal(r.confidence, "explicit");
  assert.match(r.id, /^x:[a-f0-9]{16}$/);
  assert.equal(r.source.vqaId, "profile-menu-toggle");
});

test("tier 1: empty/whitespace vqaId falls through to tier 2/3", () => {
  const r = computeElementIdentity({
    vqaId: "  ",
    role: "button", accessibleName: "Save",
    selector: "button.save", domPath: "html>body>button",
  });
  assert.equal(r.confidence, "semantic");
});

test("tier 2: role + accessibleName yields semantic identity", () => {
  const r = computeElementIdentity({
    role: "button", accessibleName: "Save changes",
    nearestHeading: "Profile settings",
    selector: "button.x", domPath: "html>body>div>div>button",
  });
  assert.equal(r.confidence, "semantic");
  assert.match(r.id, /^s:[a-f0-9]{16}$/);
  assert.equal(r.source.role, "button");
  assert.equal(r.source.accName, "Save changes");
});

test("tier 2: same role+accName+heading+text hashes the same regardless of selector/path", () => {
  const a = computeElementIdentity({
    role: "button", accessibleName: "Save", nearestHeading: "Profile",
    textContent: "Save", selector: "button.v1", domPath: "html>body>button",
  });
  const b = computeElementIdentity({
    role: "button", accessibleName: "Save", nearestHeading: "Profile",
    textContent: "Save", selector: "button.v2-renamed", domPath: "html>body>main>section>button",
  });
  assert.equal(a.id, b.id);
});

test("tier 2: implicit role from tagName when role attribute is missing", () => {
  const r = computeElementIdentity({
    tagName: "button", textContent: "Submit",
    selector: "button", domPath: "html>body>button",
  });
  assert.equal(r.confidence, "semantic");
  assert.equal(r.source.role, "button");
});

test("tier 3: no role and no accName falls back to path hash", () => {
  const r = computeElementIdentity({
    tagName: "div", selector: "div.unknown",
    domPath: "html>body>div:nth-child(3)>div",
  });
  assert.equal(r.confidence, "path");
  assert.match(r.id, /^p:[a-f0-9]{16}$/);
});

test("implicitRole maps common tags", () => {
  assert.equal(implicitRole("button"), "button");
  assert.equal(implicitRole("a"), "link");
  assert.equal(implicitRole("input", "checkbox"), "checkbox");
  assert.equal(implicitRole("input", "text"), "textbox");
  assert.equal(implicitRole("section"), null);
});

test("matchBaseline: exact ID hit returns the baseline capture", () => {
  const baseline = new Map([["x:abc123def456abcd", { png: "before.png" }]]);
  const r = matchBaseline({ id: "x:abc123def456abcd", confidence: "explicit" }, baseline);
  assert.deepEqual(r, { baseline: { png: "before.png" }, degraded: false });
});

test("matchBaseline: miss returns null + degraded=true if current is path-tier", () => {
  const r = matchBaseline({ id: "p:nomatch", confidence: "path" }, new Map(), new Map());
  assert.equal(r.baseline, null);
  assert.equal(r.degraded, true);
});

test("matchBaseline: miss returns null + degraded=false for non-path tiers", () => {
  const r = matchBaseline({ id: "s:nomatch", confidence: "semantic" }, new Map());
  assert.equal(r.baseline, null);
  assert.equal(r.degraded, false);
});
