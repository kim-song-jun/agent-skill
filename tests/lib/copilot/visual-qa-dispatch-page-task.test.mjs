import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPageTaskCall,
  dispatchPageTask,
  parsePageTaskResult,
  loadPromptTemplate,
  __internal,
} from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/dispatch-page-task.mjs";

test("buildPageTaskCall: requires page, config, slugDir", () => {
  assert.throws(() => buildPageTaskCall({}), /page/);
  assert.throws(() => buildPageTaskCall({ page: { name: "p", path: "/" } }), /config/);
  assert.throws(() => buildPageTaskCall({
    page: { name: "p", path: "/" }, config: { baseUrl: "x" },
  }), /slugDir/);
});

test("buildPageTaskCall: renders template variables", () => {
  const tpl = "PAGE={{PAGE}} URL={{BASE_URL}}{{PAGE_PATH}} OUT={{OUTPUT_DIR}}";
  const { prompt, context } = buildPageTaskCall({
    page: { name: "home", path: "/" },
    config: { baseUrl: "https://x.com", breakpoints: [{ name: "d", width: 1, height: 1 }] },
    slugDir: "/tmp/run-1",
    pagePromptTemplate: tpl,
  });
  assert.match(prompt, /PAGE=home/);
  assert.match(prompt, /URL=https:\/\/x\.com\//);
  assert.match(prompt, /OUT=\/tmp\/run-1/);
  assert.equal(context.visualQaPage, "home");
  assert.equal(context.slugDir, "/tmp/run-1");
  assert.equal(context.baseUrl, "https://x.com");
  assert.equal(context.matrixKey, "visual-qa/matrix");
});

test("buildPageTaskCall: uses fallback prompt when no template", () => {
  const { prompt } = buildPageTaskCall({
    page: { name: "p", path: "/" },
    config: { baseUrl: "x", breakpoints: [{ name: "d", width: 1, height: 1 }] },
    slugDir: "/o",
  });
  assert.match(prompt, /Visual QA — capture page "p"/);
  assert.match(prompt, /Breakpoints/);
});

test("buildPageTaskCall: passes auth from page or config", () => {
  const r1 = buildPageTaskCall({
    page: { name: "p", path: "/", auth: { type: "form" } },
    config: { baseUrl: "x", breakpoints: [] },
    slugDir: "/o",
  });
  assert.deepEqual(r1.context.auth, { type: "form" });
  const r2 = buildPageTaskCall({
    page: { name: "p", path: "/" },
    config: { baseUrl: "x", breakpoints: [], auth: { type: "header" } },
    slugDir: "/o",
  });
  assert.deepEqual(r2.context.auth, { type: "header" });
});

test("dispatchPageTask: requires taskCaller", async () => {
  await assert.rejects(
    () => dispatchPageTask({ call: { prompt: "x" } }),
    /taskCaller/,
  );
});

test("dispatchPageTask: returns agentId from taskCaller", async () => {
  const taskCaller = async () => ({ agentId: "page-1" });
  const r = await dispatchPageTask({
    call: { prompt: "x", context: { foo: 1 } },
    taskCaller,
  });
  assert.equal(r.ok, true);
  assert.equal(r.agentId, "page-1");
});

test("dispatchPageTask: surfaces taskCaller exceptions", async () => {
  const taskCaller = async () => { throw new Error("playwright down"); };
  const r = await dispatchPageTask({ call: { prompt: "x" }, taskCaller });
  assert.equal(r.ok, false);
  assert.match(r.error, /playwright/);
});

test("parsePageTaskResult: parses JSON block + STATUS", () => {
  const out = parsePageTaskResult([
    "STATUS: completed",
    "",
    "```json",
    JSON.stringify({
      page: "home",
      captures: ["a.png", "b.png"],
      analyses: [{ image: "a.png", issues: [] }],
      status: "completed",
      errors: [],
      costUSD: 0.12,
    }),
    "```",
  ].join("\n"));
  assert.equal(out.status, "completed");
  assert.equal(out.page, "home");
  assert.equal(out.captures.length, 2);
  assert.equal(out.costUSD, 0.12);
  assert.equal(out.errors.length, 0);
});

test("parsePageTaskResult: blocked status with no JSON block reports error", () => {
  const out = parsePageTaskResult("STATUS: blocked\n\n(no json block)\n");
  assert.equal(out.status, "blocked");
  assert.match(out.errors[0], /no ```json/);
});

test("parsePageTaskResult: malformed JSON block surfaces parse error", () => {
  const out = parsePageTaskResult("STATUS: failed\n```json\n{ bad json\n```");
  assert.equal(out.status, "failed");
  assert.match(out.errors[0], /json parse failed/);
});

test("parsePageTaskResult: empty output reports empty error", () => {
  const out = parsePageTaskResult("");
  assert.equal(out.status, "unknown");
  assert.match(out.errors[0], /empty/);
});

test("loadPromptTemplate: returns null for missing file", () => {
  assert.equal(loadPromptTemplate("/nonexistent/template.md"), null);
});

test("renderTemplate: leaves unknown vars as empty string", () => {
  const r = __internal.renderTemplate("a={{KNOWN}} b={{UNKNOWN}}", { KNOWN: "x" });
  assert.equal(r, "a=x b=");
});
