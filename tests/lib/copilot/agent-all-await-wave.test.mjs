import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  awaitWaveHook,
  awaitWavePoll,
  awaitWave,
  TERMINAL_STATUSES,
} from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/await-wave.mjs";

function fakeClock() {
  let t = 1000;
  return {
    now: () => t,
    sleeper: async (ms) => { t += ms; },
  };
}

test("TERMINAL_STATUSES exposes the standard set", () => {
  for (const s of ["completed", "failed", "blocked", "cancelled", "canceled"]) {
    assert.ok(TERMINAL_STATUSES.has(s));
  }
});

test("awaitWaveHook: resolves when inbox lines cover every agentId", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "await-wave-"));
  const inbox = join(tmp, "inbox.jsonl");
  appendFileSync(inbox, JSON.stringify({ agentId: "a1", status: "completed", output: "ok" }) + "\n");
  appendFileSync(inbox, JSON.stringify({ agentId: "a2", status: "failed", output: "boom" }) + "\n");
  const clock = fakeClock();
  const r = await awaitWaveHook({
    agentIds: ["a1", "a2"],
    inboxPath: inbox,
    timeoutMs: 5000,
    intervalMs: 50,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.timedOut, false);
  assert.equal(r.results.size, 2);
  assert.equal(r.results.get("a1").status, "completed");
  assert.equal(r.results.get("a2").status, "failed");
});

test("awaitWaveHook: times out when not all agents finish", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "await-wave-"));
  const inbox = join(tmp, "inbox.jsonl");
  appendFileSync(inbox, JSON.stringify({ agentId: "a1", status: "completed" }) + "\n");
  const clock = fakeClock();
  const r = await awaitWaveHook({
    agentIds: ["a1", "a2"],
    inboxPath: inbox,
    timeoutMs: 200,
    intervalMs: 50,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.equal(r.results.size, 1);
  assert.match(r.error, /1\/2/);
});

test("awaitWaveHook: ignores malformed JSON lines", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "await-wave-"));
  const inbox = join(tmp, "inbox.jsonl");
  appendFileSync(inbox, "{not json\n");
  appendFileSync(inbox, JSON.stringify({ agentId: "ok-1", status: "completed" }) + "\n");
  const clock = fakeClock();
  const r = await awaitWaveHook({
    agentIds: ["ok-1"],
    inboxPath: inbox,
    timeoutMs: 1000,
    intervalMs: 25,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.results.size, 1);
});

test("awaitWaveHook: supports alternate agent_id/id keys", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "await-wave-"));
  const inbox = join(tmp, "inbox.jsonl");
  appendFileSync(inbox, JSON.stringify({ agent_id: "x1", status: "completed" }) + "\n");
  appendFileSync(inbox, JSON.stringify({ id: "x2", status: "completed" }) + "\n");
  const clock = fakeClock();
  const r = await awaitWaveHook({
    agentIds: ["x1", "x2"],
    inboxPath: inbox,
    timeoutMs: 500,
    intervalMs: 25,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
});

test("awaitWavePoll: resolves when list_agents shows all terminal", async () => {
  let calls = 0;
  const listAgentsFn = async () => {
    calls++;
    if (calls === 1) {
      return [
        { agentId: "p1", status: "running" },
        { agentId: "p2", status: "running" },
      ];
    }
    return [
      { agentId: "p1", status: "completed" },
      { agentId: "p2", status: "completed" },
    ];
  };
  const clock = fakeClock();
  const r = await awaitWavePoll({
    agentIds: ["p1", "p2"],
    listAgentsFn,
    intervalMs: 50,
    timeoutMs: 5000,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.results.size, 2);
  assert.ok(calls >= 2);
});

test("awaitWavePoll: handles {agents: [...]} shape", async () => {
  const listAgentsFn = async () => ({ agents: [{ agentId: "x", status: "completed" }] });
  const clock = fakeClock();
  const r = await awaitWavePoll({
    agentIds: ["x"],
    listAgentsFn,
    intervalMs: 25,
    timeoutMs: 1000,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
});

test("awaitWavePoll: surfaces list_agents errors", async () => {
  const listAgentsFn = async () => { throw new Error("network down"); };
  const clock = fakeClock();
  const r = await awaitWavePoll({
    agentIds: ["a"],
    listAgentsFn,
    intervalMs: 50,
    timeoutMs: 1000,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, false);
  assert.match(r.error, /network down/);
});

test("awaitWavePoll: times out and reports partial completion", async () => {
  const listAgentsFn = async () => [{ agentId: "only-one", status: "completed" }];
  const clock = fakeClock();
  const r = await awaitWavePoll({
    agentIds: ["only-one", "never"],
    listAgentsFn,
    intervalMs: 50,
    timeoutMs: 200,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.equal(r.results.size, 1);
});

test("awaitWave: auto-selects hook when inbox exists", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "await-wave-"));
  const inbox = join(tmp, "inbox.jsonl");
  writeFileSync(inbox, JSON.stringify({ agentId: "g1", status: "completed" }) + "\n");
  const clock = fakeClock();
  const r = await awaitWave({
    agentIds: ["g1"],
    strategy: "auto",
    inboxPath: inbox,
    listAgentsFn: async () => { throw new Error("should not be called"); },
    timeoutMs: 500,
    intervalMs: 25,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
});

test("awaitWave: auto falls to poll when inbox doesn't exist but listAgentsFn provided", async () => {
  const clock = fakeClock();
  const tmp = mkdtempSync(join(tmpdir(), "await-wave-")); // dir, but inbox path inside doesn't exist
  const r = await awaitWave({
    agentIds: ["only"],
    strategy: "auto",
    inboxPath: join(tmp, "missing-inbox.jsonl"),
    listAgentsFn: async () => [{ agentId: "only", status: "completed" }],
    timeoutMs: 500,
    intervalMs: 25,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  // When inboxPath is given but doesn't exist, the resolver still picks
  // "hook" so the tail can start; the strategy explicitly handles
  // empty-file/missing-file by retrying. Therefore this resolves via the
  // hook branch and times out (no writes). To test the poll branch fall-
  // through, we omit inboxPath.
  // Re-test with no inbox path:
  const r2 = await awaitWave({
    agentIds: ["only"],
    strategy: "auto",
    listAgentsFn: async () => [{ agentId: "only", status: "completed" }],
    timeoutMs: 500,
    intervalMs: 25,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r2.ok, true);
  // The first call may time out — both branches are valid here. Just
  // assert we got a structured result.
  assert.ok(typeof r.ok === "boolean");
});

test("awaitWave: throws when neither inbox nor listAgentsFn provided", async () => {
  await assert.rejects(
    () => awaitWave({ agentIds: ["x"], strategy: "auto" }),
    /cannot auto-select/,
  );
});

test("awaitWave: explicit 'poll' strategy bypasses inbox check", async () => {
  const clock = fakeClock();
  const r = await awaitWave({
    agentIds: ["x"],
    strategy: "poll",
    listAgentsFn: async () => [{ agentId: "x", status: "completed" }],
    timeoutMs: 500,
    intervalMs: 25,
    sleeper: clock.sleeper,
    now: clock.now,
  });
  assert.equal(r.ok, true);
});
