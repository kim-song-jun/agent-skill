import { test } from "node:test";
import assert from "node:assert/strict";

const INVOKERS = {
  cursor: "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/host-invoker.mjs",
  copilot: "../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/host-invoker.mjs",
  codex: "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/host-invoker.mjs",
  gemini: "../../plugins/harness-floor-gemini/skills/agent-all-gemini/lib/host-invoker.mjs",
};

const ADAPTERS = {
  cursor: "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/ask-user-adapter.mjs",
  copilot: "../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/ask-user-adapter.mjs",
  codex: "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/ask-user-adapter.mjs",
  gemini: "../../plugins/harness-floor-gemini/skills/agent-all-gemini/lib/ask-user-adapter.mjs",
};

// ---------- Cursor ----------

test("cursor: cursorChatInvoker is a factory returning a function", async () => {
  const { cursorChatInvoker } = await import(INVOKERS.cursor);
  assert.equal(typeof cursorChatInvoker, "function");
  const invoker = cursorChatInvoker({
    outputFn: async () => {},
    inputFn: async () => "",
  });
  assert.equal(typeof invoker, "function");
});

test("cursor: invoker writes markdown via outputFn and returns inputFn reply", async () => {
  const { cursorChatInvoker } = await import(INVOKERS.cursor);
  let written = null;
  const invoker = cursorChatInvoker({
    outputFn: async (md) => { written = md; },
    inputFn: async () => "user reply",
  });
  const reply = await invoker("**hello**\n\n1. A\n2. B");
  assert.equal(written, "**hello**\n\n1. A\n2. B");
  assert.equal(reply, "user reply");
});

test("cursor: invoker coerces non-string inputFn returns to string", async () => {
  const { cursorChatInvoker } = await import(INVOKERS.cursor);
  const invoker = cursorChatInvoker({
    outputFn: async () => {},
    inputFn: async () => null,
  });
  const reply = await invoker("question?");
  assert.equal(reply, "");
});

test("cursor: throws when outputFn/inputFn are not functions", async () => {
  const { cursorChatInvoker } = await import(INVOKERS.cursor);
  assert.throws(
    () => cursorChatInvoker({ outputFn: "nope", inputFn: async () => "" }),
    /outputFn must be a function/,
  );
  assert.throws(
    () => cursorChatInvoker({ outputFn: async () => {}, inputFn: 42 }),
    /inputFn must be a function/,
  );
});

test("cursor: invoker integrates end-to-end with ask-user-adapter", async () => {
  const { cursorChatInvoker } = await import(INVOKERS.cursor);
  const { askUserStructured } = await import(ADAPTERS.cursor);
  let written = null;
  const invoker = cursorChatInvoker({
    outputFn: async (md) => { written = md; },
    inputFn: async () => "2",
  });
  const result = await askUserStructured({
    stage: "options",
    prompt: "Pick one",
    choices: ["alpha", "beta", "gamma"],
    multi: false,
    invoker,
  });
  assert.equal(result.type, "selected");
  assert.equal(result.value, "beta");
  assert.match(written, /1\. \*\*alpha\*\*/);
});

// ---------- Copilot ----------

test("copilot: copilotAskUserInvoker is a factory returning a function", async () => {
  const { copilotAskUserInvoker } = await import(INVOKERS.copilot);
  assert.equal(typeof copilotAskUserInvoker, "function");
  const invoker = copilotAskUserInvoker({ toolCaller: async () => ({}) });
  assert.equal(typeof invoker, "function");
});

test("copilot: invoker calls toolCaller with name=ask_user and structured args", async () => {
  const { copilotAskUserInvoker } = await import(INVOKERS.copilot);
  let received = null;
  const invoker = copilotAskUserInvoker({
    toolCaller: async (call) => { received = call; return { selected: "alpha" }; },
  });
  const out = await invoker({ prompt: "Pick", choices: ["alpha", "beta"], multi: false });
  assert.equal(received.name, "ask_user");
  assert.deepEqual(received.args, { prompt: "Pick", choices: ["alpha", "beta"], multi: false });
  assert.deepEqual(out, { selected: "alpha" });
});

test("copilot: normalizes alternate response keys (value/choice/text/response)", async () => {
  const { copilotAskUserInvoker } = await import(INVOKERS.copilot);
  const cases = [
    { reply: { value: "x" }, expected: { selected: "x" } },
    { reply: { choice: "y" }, expected: { selected: "y" } },
    { reply: { text: "free" }, expected: { selected: null, freeForm: "free" } },
    { reply: { response: "free2" }, expected: { selected: null, freeForm: "free2" } },
    { reply: "raw string", expected: { selected: null, freeForm: "raw string" } },
    { reply: null, expected: { selected: null } },
  ];
  for (const { reply, expected } of cases) {
    const invoker = copilotAskUserInvoker({ toolCaller: async () => reply });
    const out = await invoker({ prompt: "?" });
    assert.deepEqual(out, expected, `reply=${JSON.stringify(reply)}`);
  }
});

test("copilot: throws when toolCaller is missing or not a function", async () => {
  const { copilotAskUserInvoker } = await import(INVOKERS.copilot);
  assert.throws(() => copilotAskUserInvoker({}), /toolCaller must be a function/);
  assert.throws(() => copilotAskUserInvoker({ toolCaller: "nope" }), /toolCaller must be a function/);
});

test("copilot: invoker integrates end-to-end with ask-user-adapter", async () => {
  const { copilotAskUserInvoker } = await import(INVOKERS.copilot);
  const { askUserStructured } = await import(ADAPTERS.copilot);
  let received = null;
  const invoker = copilotAskUserInvoker({
    toolCaller: async (call) => { received = call; return { selected: "beta" }; },
  });
  const result = await askUserStructured({
    stage: "options",
    prompt: "Pick",
    choices: ["alpha", "beta"],
    multi: false,
    invoker,
  });
  assert.equal(result.type, "selected");
  assert.equal(result.value, "beta");
  assert.equal(received.name, "ask_user");
  assert.equal(received.args.prompt, "Pick");
  assert.deepEqual(received.args.choices, ["alpha", "beta"]);
});

// ---------- Codex ----------

test("codex: codexAskUserInvoker is a factory returning a function", async () => {
  const { codexAskUserInvoker } = await import(INVOKERS.codex);
  assert.equal(typeof codexAskUserInvoker, "function");
  const invoker = codexAskUserInvoker({ toolCaller: async () => ({}) });
  assert.equal(typeof invoker, "function");
});

test("codex: invoker calls toolCaller with name=ask_user and structured args", async () => {
  const { codexAskUserInvoker } = await import(INVOKERS.codex);
  let received = null;
  const invoker = codexAskUserInvoker({
    toolCaller: async (call) => { received = call; return { selected: ["a", "b"] }; },
  });
  const out = await invoker({ prompt: "Pick all", choices: ["a", "b", "c"], multi: true });
  assert.equal(received.name, "ask_user");
  assert.deepEqual(received.args, { prompt: "Pick all", choices: ["a", "b", "c"], multi: true });
  assert.deepEqual(out, { selected: ["a", "b"] });
});

test("codex: normalizes alternate response keys", async () => {
  const { codexAskUserInvoker } = await import(INVOKERS.codex);
  const cases = [
    { reply: { value: "x" }, expected: { selected: "x" } },
    { reply: { free_form: "f" }, expected: { selected: null, freeForm: "f" } },
    { reply: "raw", expected: { selected: null, freeForm: "raw" } },
  ];
  for (const { reply, expected } of cases) {
    const invoker = codexAskUserInvoker({ toolCaller: async () => reply });
    assert.deepEqual(await invoker({ prompt: "?" }), expected);
  }
});

test("codex: codexExecCommandInvoker stub throws not-yet-implemented", async () => {
  const { codexExecCommandInvoker } = await import(INVOKERS.codex);
  assert.equal(typeof codexExecCommandInvoker, "function");
  const invoker = codexExecCommandInvoker({ execCommand: async () => "" });
  await assert.rejects(
    () => invoker({ prompt: "x" }),
    /not yet implemented/,
  );
});

test("codex: codexExecCommandInvoker requires execCommand function", async () => {
  const { codexExecCommandInvoker } = await import(INVOKERS.codex);
  assert.throws(
    () => codexExecCommandInvoker({}),
    /execCommand must be a function/,
  );
});

// ---------- Gemini ----------

test("gemini: geminiAskUserInvoker is a factory returning a function", async () => {
  const { geminiAskUserInvoker } = await import(INVOKERS.gemini);
  assert.equal(typeof geminiAskUserInvoker, "function");
  const invoker = geminiAskUserInvoker({ toolCaller: async () => "" });
  assert.equal(typeof invoker, "function");
});

test("gemini: invoker calls toolCaller with name=ask_user and {prompt} only", async () => {
  const { geminiAskUserInvoker } = await import(INVOKERS.gemini);
  let received = null;
  const invoker = geminiAskUserInvoker({
    toolCaller: async (call) => { received = call; return "user said this"; },
  });
  const out = await invoker({ prompt: "Describe the issue" });
  assert.equal(received.name, "ask_user");
  assert.deepEqual(received.args, { prompt: "Describe the issue" });
  assert.deepEqual(out, { freeForm: "user said this" });
});

test("gemini: normalizes raw string / {response} / {freeForm} / {text} / {answer}", async () => {
  const { geminiAskUserInvoker } = await import(INVOKERS.gemini);
  const cases = [
    { reply: "raw answer", expected: { freeForm: "raw answer" } },
    { reply: { response: "via response" }, expected: { freeForm: "via response" } },
    { reply: { freeForm: "via freeForm" }, expected: { freeForm: "via freeForm" } },
    { reply: { text: "via text" }, expected: { freeForm: "via text" } },
    { reply: { answer: "via answer" }, expected: { freeForm: "via answer" } },
    { reply: null, expected: { freeForm: "" } },
    { reply: {}, expected: { freeForm: "" } },
  ];
  for (const { reply, expected } of cases) {
    const invoker = geminiAskUserInvoker({ toolCaller: async () => reply });
    const out = await invoker({ prompt: "?" });
    assert.deepEqual(out, expected, `reply=${JSON.stringify(reply)}`);
  }
});

test("gemini: throws when toolCaller is missing", async () => {
  const { geminiAskUserInvoker } = await import(INVOKERS.gemini);
  assert.throws(() => geminiAskUserInvoker({}), /toolCaller must be a function/);
});

test("gemini: invoker integrates end-to-end with ask-user-adapter", async () => {
  const { geminiAskUserInvoker } = await import(INVOKERS.gemini);
  const { askUserStructured } = await import(ADAPTERS.gemini);
  let received = null;
  const invoker = geminiAskUserInvoker({
    toolCaller: async (call) => { received = call; return "2"; },
  });
  const result = await askUserStructured({
    stage: "direction",
    prompt: "Pick",
    choices: ["A", "B", "C"],
    multi: false,
    invoker,
  });
  assert.equal(received.name, "ask_user");
  assert.match(received.args.prompt, /1\. A/);
  assert.equal(result.type, "selected");
  assert.equal(result.value, "B");
});
