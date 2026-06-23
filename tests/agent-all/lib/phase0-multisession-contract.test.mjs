import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/phases/0-preflight.md"), "utf-8");

test("Phase 0 initializes run-status fields", () => {
  const body = read();
  assert.match(body, /status[\s\S]{0,30}["'`]running/i, "sets status:running");
  assert.match(body, /state\.runId|runId[\s\S]{0,20}=/i, "persists runId to state");
  assert.match(body, /updatedAt/, "sets updatedAt");
});

test("Phase 0 claims session ownership from current-session.json", () => {
  const body = read();
  assert.match(body, /current-session\.json/, "reads current-session.json");
  assert.match(body, /state\.sessionId|sessionId/, "records sessionId on state");
});

test("Phase 0 guards against a foreign running state (sequential multi-session)", () => {
  const body = read();
  assert.match(body, /status[\s\S]{0,40}running[\s\S]{0,400}(foreign|another run|in progress|concurrent)/i,
    "detects a pre-existing running state from another run");
  assert.match(body, /agent-interaction/i, "surfaces a decision (no silent auto-proceed)");
  assert.match(body, /Abort/i, "default arm is Abort on a fresh foreign running state");
});
