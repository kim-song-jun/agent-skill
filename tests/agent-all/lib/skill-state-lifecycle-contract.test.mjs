import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL = resolve("plugins/harness-floor/skills/agent-all/SKILL.md");
const read = () => readFileSync(SKILL, "utf-8");

test("Rule 2 documents the run-status lifecycle fields", () => {
  const body = read();
  assert.match(body, /status[\s\S]{0,80}running[\s\S]{0,40}done[\s\S]{0,40}aborted/i,
    "state shape must list status: running|done|aborted");
  assert.match(body, /updatedAt/, "state shape must include updatedAt");
  assert.match(body, /sessionId/, "state shape must include sessionId");
  assert.match(body, /awaitingUser/, "state shape must include awaitingUser");
  assert.match(body, /every state write[\s\S]{0,120}updatedAt/i,
    "must state the updatedAt refresh rule");
});

test("When done sets status done; On error sets status aborted", () => {
  const body = read();
  const whenDone = body.slice(body.indexOf("## When done"));
  assert.match(whenDone, /status[\s\S]{0,40}["'`]?done/i, "When done must set status:done");
  const onError = body.slice(body.indexOf("## On error"), body.indexOf("## When done"));
  assert.match(onError, /status[\s\S]{0,40}["'`]?aborted/i, "On error must set status:aborted");
});
