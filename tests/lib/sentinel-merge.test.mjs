import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSentinelSection, SENTINEL } from "../../plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs";

test("renders full content when existing file is absent", () => {
  const result = mergeSentinelSection("", "generated body");
  assert.equal(result.action, "create");
  assert.equal(result.content, "generated body\n");
});

test("appends sentinel section to existing user file", () => {
  const result = mergeSentinelSection("# User Notes\n", "generated body");
  assert.equal(result.action, "append");
  assert.equal(result.content, `# User Notes\n\n${SENTINEL.start}\ngenerated body\n${SENTINEL.end}\n`);
});

test("preserves trailing user whitespace when appending sentinel section", () => {
  const result = mergeSentinelSection("user\n\n", "generated");
  assert.equal(result.action, "append");
  assert.equal(result.content, `user\n\n\n${SENTINEL.start}\ngenerated\n${SENTINEL.end}\n`);
});

test("ignores sentinel marker mentions that are not whole marker lines", () => {
  const existing = `Mention ${SENTINEL.start} in prose\n`;
  const result = mergeSentinelSection(existing, "generated");
  assert.equal(result.action, "append");
  assert.equal(result.content, `${existing}\n${SENTINEL.start}\ngenerated\n${SENTINEL.end}\n`);
});

test("replaces only the existing sentinel section", () => {
  const existing = `top\n\n${SENTINEL.start}\nold\n${SENTINEL.end}\n\nbottom\n`;
  const result = mergeSentinelSection(existing, "new");
  assert.equal(result.action, "replace");
  assert.equal(result.content, `top\n\n${SENTINEL.start}\nnew\n${SENTINEL.end}\n\nbottom\n`);
});

test("throws when only one sentinel marker exists", () => {
  assert.throws(() => mergeSentinelSection(`${SENTINEL.start}\nold\n`, "new"), /incomplete sentinel/);
});

test("throws when sentinel end appears before sentinel start", () => {
  const existing = `before\n${SENTINEL.end}\nold\n${SENTINEL.start}\nafter\n`;
  assert.throws(() => mergeSentinelSection(existing, "generated"), /malformed sentinel|incomplete sentinel/);
});

test("throws when duplicate sentinel start markers exist", () => {
  const existing = `${SENTINEL.start}\nold\n${SENTINEL.start}\nstale\n${SENTINEL.end}\n`;
  assert.throws(() => mergeSentinelSection(existing, "generated"), /duplicate sentinel/);
});

test("throws when duplicate sentinel end markers exist", () => {
  const existing = `${SENTINEL.start}\nold\n${SENTINEL.end}\nstale\n${SENTINEL.end}\n`;
  assert.throws(() => mergeSentinelSection(existing, "generated"), /duplicate sentinel/);
});
