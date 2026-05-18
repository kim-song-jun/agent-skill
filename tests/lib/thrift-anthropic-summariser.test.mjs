import { test } from "node:test";
import assert from "node:assert/strict";

import {
  anthropicSummariseFn,
} from "../../plugins/harness-thrift/skills/thrift/lib/anthropic-summariser.mjs";

test("anthropic-summariser: throws clear error when sdkPath missing", async () => {
  const fn = anthropicSummariseFn({
    apiKey: "test-key",
    sdkPath: "@definitely-not-installed/sdk-xyz-thrift-test",
  });
  await assert.rejects(
    () => fn([{ role: "user", content: "hi" }]),
    /Install @anthropic-ai\/sdk to use the --use-haiku summariser path/,
  );
});

test("anthropic-summariser: uses sdkLoader stub and returns assistant text", async () => {
  let receivedArgs = null;
  let constructedWith = null;

  class StubAnthropic {
    constructor(opts) {
      constructedWith = opts;
      this.messages = {
        create: async (args) => {
          receivedArgs = args;
          return {
            content: [
              { type: "text", text: "compressed summary body" },
              { type: "text", text: "second block" },
            ],
          };
        },
      };
    }
  }

  const fn = anthropicSummariseFn({
    apiKey: "test-key",
    model: "test-model",
    sdkLoader: async () => ({ default: StubAnthropic }),
  });

  const turns = [
    { role: "user", content: "first user msg" },
    { role: "assistant", content: "first reply" },
  ];
  const out = await fn(turns);

  assert.equal(out, "compressed summary body\nsecond block");
  assert.deepEqual(constructedWith, { apiKey: "test-key" });
  assert.equal(receivedArgs.model, "test-model");
  assert.equal(receivedArgs.max_tokens, 1024);
  assert.match(receivedArgs.system, /concise conversation summariser/);
  assert.equal(receivedArgs.messages.length, 1);
  assert.equal(receivedArgs.messages[0].role, "user");
  assert.match(receivedArgs.messages[0].content, /### Turn 1 \(user\)/);
  assert.match(receivedArgs.messages[0].content, /first user msg/);
  assert.match(receivedArgs.messages[0].content, /### Turn 2 \(assistant\)/);
});

test("anthropic-summariser: accepts named Anthropic export", async () => {
  class StubAnthropic {
    constructor() {
      this.messages = {
        create: async () => ({ content: [{ type: "text", text: "ok" }] }),
      };
    }
  }
  const fn = anthropicSummariseFn({
    sdkLoader: async () => ({ Anthropic: StubAnthropic }),
  });
  const out = await fn([{ role: "user", content: "x" }]);
  assert.equal(out, "ok");
});

test("anthropic-summariser: empty turns returns empty string without invoking SDK", async () => {
  let called = false;
  const fn = anthropicSummariseFn({
    sdkLoader: async () => {
      called = true;
      return { default: class {} };
    },
  });
  const out = await fn([]);
  assert.equal(out, "");
  assert.equal(called, false, "SDK loader should not be invoked for empty input");
});

test("anthropic-summariser: non-array turns throws", async () => {
  const fn = anthropicSummariseFn({
    sdkLoader: async () => ({ default: class {} }),
  });
  await assert.rejects(() => fn(null), /turns must be an array/);
});

test("anthropic-summariser: SDK call failures are re-thrown with context", async () => {
  class FailingAnthropic {
    constructor() {
      this.messages = {
        create: async () => { throw new Error("rate limited"); },
      };
    }
  }
  const fn = anthropicSummariseFn({
    model: "haiku-x",
    sdkLoader: async () => ({ default: FailingAnthropic }),
  });
  await assert.rejects(
    () => fn([{ role: "user", content: "x" }]),
    /SDK call failed \(model=haiku-x\): rate limited/,
  );
});

test("anthropic-summariser: throws if SDK module has no constructor", async () => {
  const fn = anthropicSummariseFn({
    sdkLoader: async () => ({ default: {} }),
  });
  await assert.rejects(
    () => fn([{ role: "user", content: "x" }]),
    /does not expose a constructor/,
  );
});

test("anthropic-summariser: throws when SDK returns no text content", async () => {
  class EmptyAnthropic {
    constructor() {
      this.messages = {
        create: async () => ({ content: [{ type: "tool_use" }] }),
      };
    }
  }
  const fn = anthropicSummariseFn({
    sdkLoader: async () => ({ default: EmptyAnthropic }),
  });
  await assert.rejects(
    () => fn([{ role: "user", content: "x" }]),
    /SDK returned no text content/,
  );
});
