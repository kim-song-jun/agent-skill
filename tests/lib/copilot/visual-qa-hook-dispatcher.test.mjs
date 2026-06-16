import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { dispatch } from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/hooks/subagent-stop-dispatcher.mjs";

function freshInbox() {
  const dir = mkdtempSync(join(tmpdir(), "vq-stop-"));
  const inbox = join(dir, ".copilot/visual-qa/inbox.jsonl");
  mkdirSync(dirname(inbox), { recursive: true });
  return inbox;
}

test("vq dispatch: appends normalized payload", async () => {
  const inbox = freshInbox();
  const r = await dispatch({
    inbox,
    payloadRaw: JSON.stringify({ agentId: "p1", status: "completed", costUSD: 1 }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.agentId, "p1");
  const lines = readFileSync(inbox, "utf-8").split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.agentId, "p1");
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.costUSD, 1);
  assert.ok(parsed.finishedAt);
  assert.ok(parsed.raw);
});

test("vq dispatch: no inbox dir → no-inbox-dir", async () => {
  const r = await dispatch({ inbox: "/tmp/does-not-exist-q/inbox.jsonl", payloadRaw: "{}" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no-inbox-dir");
});

test("vq dispatch: bad JSON → invalid-json", async () => {
  const inbox = freshInbox();
  const r = await dispatch({ inbox, payloadRaw: "not json" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid-json");
});
