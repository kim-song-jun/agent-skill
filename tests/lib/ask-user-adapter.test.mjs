import { test } from "node:test";
import assert from "node:assert/strict";

const ADAPTERS = {
  cursor: "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/ask-user-adapter.mjs",
  copilot: "../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/ask-user-adapter.mjs",
  codex: "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/ask-user-adapter.mjs",
  gemini: "../../plugins/harness-floor-gemini/skills/agent-all-gemini/lib/ask-user-adapter.mjs",
};

async function loadAdapter(platform) {
  const mod = await import(ADAPTERS[platform]);
  return mod;
}

for (const platform of Object.keys(ADAPTERS)) {
  test(`${platform}: exports askUserStructured + STAGES`, async () => {
    const a = await loadAdapter(platform);
    assert.equal(typeof a.askUserStructured, "function");
    assert.deepEqual(a.__internal.STAGES, [
      "problem", "constraints", "options", "tradeoffs", "direction",
    ]);
  });

  test(`${platform}: rejects unknown stage`, async () => {
    const a = await loadAdapter(platform);
    await assert.rejects(
      () => a.askUserStructured({ stage: "bogus", prompt: "x", invoker: async () => "" }),
      /unknown stage/,
    );
  });

  test(`${platform}: requires invoker`, async () => {
    const a = await loadAdapter(platform);
    await assert.rejects(
      () => a.askUserStructured({ stage: "problem", prompt: "x" }),
      /invoker required/,
    );
  });
}

// Cursor-specific: markdown emit + numeric reply parse
test("cursor: numbered single-select parses correctly", async () => {
  const a = await loadAdapter("cursor");
  let emitted = null;
  const invoker = async (md) => { emitted = md; return "2"; };
  const result = await a.askUserStructured({
    stage: "options",
    prompt: "Pick one",
    choices: ["alpha", "beta", "gamma"],
    multi: false,
    invoker,
  });
  assert.equal(result.type, "selected");
  assert.equal(result.value, "beta");
  assert.match(emitted, /\*\*\[options\]\*\* Pick one/);
  assert.match(emitted, /1\. \*\*alpha\*\*/);
  assert.match(emitted, /2\. \*\*beta\*\*/);
});

test("cursor: multi-select with comma-separated reply", async () => {
  const a = await loadAdapter("cursor");
  const result = await a.askUserStructured({
    stage: "constraints",
    prompt: "Which apply?",
    choices: ["tight deadline", "small team", "legacy stack"],
    multi: true,
    invoker: async () => "1, 3",
  });
  assert.equal(result.type, "selected");
  assert.deepEqual(result.value, ["tight deadline", "legacy stack"]);
});

test("cursor: free-form fallback when reply doesn't match", async () => {
  const a = await loadAdapter("cursor");
  const result = await a.askUserStructured({
    stage: "direction",
    prompt: "Pick",
    choices: ["A", "B"],
    multi: false,
    freeFormFallback: true,
    invoker: async () => "something else",
  });
  assert.equal(result.type, "free-form");
  assert.equal(result.value, "something else");
});

test("cursor: no-choice when reply doesn't match and no fallback", async () => {
  const a = await loadAdapter("cursor");
  const result = await a.askUserStructured({
    stage: "direction",
    prompt: "Pick",
    choices: ["A", "B"],
    multi: false,
    freeFormFallback: false,
    invoker: async () => "C",
  });
  assert.equal(result.type, "no-choice");
});

test("cursor: previews render inside code blocks", async () => {
  const a = await loadAdapter("cursor");
  let emitted = null;
  await a.askUserStructured({
    stage: "options",
    prompt: "Pick approach",
    choices: { "Approach A": "function a() { return 1; }", "Approach B": "function b() { return 2; }" },
    multi: false,
    invoker: async (md) => { emitted = md; return "1"; },
  });
  assert.match(emitted, /```\nfunction a\(\) \{ return 1; \}\n```/);
});

// Copilot/Codex shared shape: invoker receives {prompt, choices, multi}
for (const platform of ["copilot", "codex"]) {
  test(`${platform}: invoker called with structured args, returns selected`, async () => {
    const a = await loadAdapter(platform);
    let received = null;
    const invoker = async (args) => { received = args; return { selected: "alpha" }; };
    const result = await a.askUserStructured({
      stage: "options",
      prompt: "Pick",
      choices: ["alpha", "beta"],
      multi: false,
      invoker,
    });
    assert.equal(result.type, "selected");
    assert.equal(result.value, "alpha");
    assert.equal(received.prompt, "Pick");
    assert.deepEqual(received.choices, ["alpha", "beta"]);
    assert.equal(received.multi, false);
  });

  test(`${platform}: freeForm reply returns free-form when fallback enabled`, async () => {
    const a = await loadAdapter(platform);
    const result = await a.askUserStructured({
      stage: "problem",
      prompt: "Describe",
      choices: null,
      invoker: async () => ({ freeForm: "long description" }),
      freeFormFallback: true,
    });
    assert.equal(result.type, "free-form");
    assert.equal(result.value, "long description");
  });

  test(`${platform}: {label: preview} choices → keys passed as flat array`, async () => {
    const a = await loadAdapter(platform);
    let received = null;
    await a.askUserStructured({
      stage: "options",
      prompt: "Pick",
      choices: { "alpha": "preview-a", "beta": "preview-b" },
      multi: false,
      invoker: async (args) => { received = args; return { selected: "alpha" }; },
    });
    assert.deepEqual(received.choices, ["alpha", "beta"]);
  });
}

// Gemini: invoker called with {prompt: <encoded>}; parses numeric reply.
test("gemini: encodes options inside prompt; parses numeric reply", async () => {
  const a = await loadAdapter("gemini");
  let received = null;
  const result = await a.askUserStructured({
    stage: "direction",
    prompt: "Pick",
    choices: ["A", "B", "C"],
    multi: false,
    invoker: async (args) => { received = args; return "2"; },
  });
  assert.equal(result.type, "selected");
  assert.equal(result.value, "B");
  assert.match(received.prompt, /1\. A/);
  assert.match(received.prompt, /2\. B/);
  assert.match(received.prompt, /3\. C/);
});

test("gemini: handles freeForm object reply", async () => {
  const a = await loadAdapter("gemini");
  const result = await a.askUserStructured({
    stage: "options",
    prompt: "Pick",
    choices: ["A", "B"],
    multi: false,
    freeFormFallback: true,
    invoker: async () => ({ freeForm: "neither, do something else" }),
  });
  assert.equal(result.type, "free-form");
  assert.equal(result.value, "neither, do something else");
});

test("gemini: multi-select returns array", async () => {
  const a = await loadAdapter("gemini");
  const result = await a.askUserStructured({
    stage: "constraints",
    prompt: "Which apply?",
    choices: ["a", "b", "c", "d"],
    multi: true,
    invoker: async () => "1,3,4",
  });
  assert.equal(result.type, "selected");
  assert.deepEqual(result.value, ["a", "c", "d"]);
});
