import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  awaitPagesHook,
  awaitPagesPoll,
  awaitPages,
  TERMINAL_STATUSES,
} from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/await-pages.mjs";

function clock() {
  let t = 1000;
  return { now: () => t, sleeper: async (ms) => { t += ms; } };
}

test("TERMINAL_STATUSES contains expected set", () => {
  for (const s of ["completed", "failed", "blocked"]) assert.ok(TERMINAL_STATUSES.has(s));
});

test("awaitPagesHook: resolves on inbox completion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "await-pages-"));
  const inbox = join(dir, "inbox.jsonl");
  appendFileSync(inbox, JSON.stringify({ agentId: "p1", status: "completed" }) + "\n");
  appendFileSync(inbox, JSON.stringify({ agentId: "p2", status: "completed" }) + "\n");
  const c = clock();
  const r = await awaitPagesHook({
    agentIds: ["p1", "p2"], inboxPath: inbox,
    timeoutMs: 500, intervalMs: 25,
    sleeper: c.sleeper, now: c.now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.results.size, 2);
});

test("awaitPagesHook: times out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "await-pages-"));
  const inbox = join(dir, "inbox.jsonl");
  writeFileSync(inbox, "");
  const c = clock();
  const r = await awaitPagesHook({
    agentIds: ["x"], inboxPath: inbox,
    timeoutMs: 100, intervalMs: 25,
    sleeper: c.sleeper, now: c.now,
  });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
});

test("awaitPagesPoll: resolves on terminal status", async () => {
  let calls = 0;
  const listAgentsFn = async () => {
    calls++;
    return [{ agentId: "x", status: calls === 1 ? "running" : "completed" }];
  };
  const c = clock();
  const r = await awaitPagesPoll({
    agentIds: ["x"], listAgentsFn,
    intervalMs: 25, timeoutMs: 1000,
    sleeper: c.sleeper, now: c.now,
  });
  assert.equal(r.ok, true);
});

test("awaitPagesPoll: handles failures gracefully", async () => {
  const listAgentsFn = async () => { throw new Error("transient"); };
  const c = clock();
  const r = await awaitPagesPoll({
    agentIds: ["x"], listAgentsFn,
    intervalMs: 25, timeoutMs: 500,
    sleeper: c.sleeper, now: c.now,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /transient/);
});

test("awaitPages: auto picks poll when no inbox path", async () => {
  const c = clock();
  const r = await awaitPages({
    agentIds: ["a"], strategy: "auto",
    listAgentsFn: async () => [{ agentId: "a", status: "completed" }],
    intervalMs: 25, timeoutMs: 500,
    sleeper: c.sleeper, now: c.now,
  });
  assert.equal(r.ok, true);
});

test("awaitPages: throws when nothing configured", async () => {
  await assert.rejects(() => awaitPages({ agentIds: ["a"], strategy: "auto" }), /cannot auto-select/);
});
