import { test } from "node:test";
import assert from "node:assert/strict";
import { shallowClick } from "../../plugins/harness-floor/skills/visual-qa/lib/shallow-clicker.mjs";

function makeHooks(opts = {}) {
  const calls = { click: [], screenshot: [], descriptorFor: [] };
  return {
    calls,
    hooks: {
      click: async (a) => { calls.click.push(a); return {}; },
      waitStable: async () => {},
      screenshot: async (a) => { calls.screenshot.push(a); return `/captures/${a.suffix}.png`; },
      revert: async () => {},
      descriptorFor: opts.descriptor
        ? async (a) => { calls.descriptorFor.push(a); return opts.descriptor(a); }
        : undefined,
    },
  };
}

test("legacy mode (capturePairs:false) keeps existing single-screenshot shape", async () => {
  const { hooks, calls } = makeHooks();
  const r = await shallowClick({
    pagePath: "/dashboard",
    clickables: [{ selector: "button.save", kind: "button", label: "Save" }],
    hooks,
  });
  assert.equal(r.captures.length, 1);
  // path must be the screenshot-hook return value with the legacy suffix shape
  assert.match(r.captures[0].path, /\/captures\/__clicked__button_save\.png$/);
  assert.equal(r.captures[0].screenshots, undefined);
  assert.equal(calls.screenshot.length, 1);
});

test("pair mode emits before + after screenshots per element", async () => {
  const { hooks, calls } = makeHooks();
  const r = await shallowClick({
    pagePath: "/dashboard",
    clickables: [{ selector: "button.save", kind: "button", label: "Save" }],
    hooks,
    options: { capturePairs: true },
  });
  assert.equal(r.captures.length, 1);
  // before/after paths must carry the hook's return value with the expected suffix
  assert.match(r.captures[0].screenshots.before, /__before\.png$/);
  assert.match(r.captures[0].screenshots.after, /__after\.png$/);
  assert.equal(r.captures[0].path, null);
  assert.equal(calls.screenshot.length, 2);
  assert.match(calls.screenshot[0].suffix, /__before$/);
  assert.match(calls.screenshot[1].suffix, /__after$/);
});

test("pair mode + descriptorFor populates elementId + confidence", async () => {
  const { hooks } = makeHooks({
    descriptor: ({ selector }) => ({
      vqaId: "save-toggle",  // tier 1 — explicit
      selector,
    }),
  });
  const r = await shallowClick({
    pagePath: "/dashboard",
    clickables: [{ selector: "button.save", kind: "button" }],
    hooks,
    options: { capturePairs: true },
  });
  // elementId must be tier-1 (explicit) prefix + 16-char sha1 hex — not just any truthy string
  assert.match(r.captures[0].elementId, /^x:[0-9a-f]{16}$/);
  assert.equal(r.captures[0].confidence, "explicit");
});

test("targets.excludeSelectors skips element entirely (no click, no screenshot)", async () => {
  const { hooks, calls } = makeHooks();
  const r = await shallowClick({
    pagePath: "/page",
    clickables: [{ selector: ".analytics-noise", kind: "button" }],
    hooks,
    options: {
      capturePairs: true,
      targets: { excludeSelectors: [".analytics-noise"] },
      isSelectorMatch: (own, cand) => own === cand,
    },
  });
  assert.equal(r.captures.length, 0);
  assert.equal(calls.click.length, 0);
  assert.equal(calls.screenshot.length, 0);
});

test("targets.includeSelectors restricts to matching elements only", async () => {
  const { hooks } = makeHooks();
  const r = await shallowClick({
    pagePath: "/page",
    clickables: [
      { selector: "button.save", kind: "button" },
      { selector: "div.skip-me", kind: "button" },
    ],
    hooks,
    options: {
      capturePairs: false,
      targets: { includeSelectors: ["button.save"] },
      isSelectorMatch: (own, cand) => own === cand,
    },
  });
  assert.equal(r.captures.length, 1);
  assert.equal(r.captures[0].selector, "button.save");
});

test("targets.actionsPerElement resolves the action and stamps it on the capture", async () => {
  const { hooks, calls } = makeHooks();
  await shallowClick({
    pagePath: "/page",
    clickables: [{ selector: "[role=tab]", kind: "button" }],
    hooks,
    options: {
      capturePairs: false,
      targets: {
        actionsPerElement: { "[role=tab]": ["click"], default: ["hover"] },
      },
      isSelectorMatch: (own, cand) => own === cand,
    },
  });
  // verify the click hook received `action: "click"`
  const clickCall = calls.click[0];
  assert.equal(clickCall?.action, "click");
});
