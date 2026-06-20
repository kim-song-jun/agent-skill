import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { dispatch } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/hooks/subagent-stop-dispatcher.mjs";

function freshInbox() {
  const dir = mkdtempSync(join(tmpdir(), "subagent-stop-"));
  const inbox = join(dir, ".copilot/agent-all/inbox.jsonl");
  mkdirSync(dirname(inbox), { recursive: true });
  return inbox;
}

test("dispatch: no inbox → returns no-inbox reason", async () => {
  const r = await dispatch({ inbox: null, payloadRaw: "{}" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no-inbox");
});

test("dispatch: parent dir missing → returns no-inbox-dir", async () => {
  const r = await dispatch({
    inbox: "/tmp/nonexistent-dir-xyz/inbox.jsonl",
    payloadRaw: JSON.stringify({ agentId: "x" }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no-inbox-dir");
});

test("dispatch: malformed JSON → invalid-json", async () => {
  const inbox = freshInbox();
  const r = await dispatch({ inbox, payloadRaw: "{ not json" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid-json");
});

test("dispatch: missing Copilot agent identity → returns missing-agent-identity", async () => {
  const inbox = freshInbox();
  const r = await dispatch({ inbox, payloadRaw: JSON.stringify({ status: "completed" }) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missing-agent-identity");
});

test("dispatch: appends official Copilot subagentStop payload shape", async () => {
  const inbox = freshInbox();
  const r = await dispatch({
    inbox,
    payloadRaw: JSON.stringify({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      agentName: "dev-agent",
      agentDisplayName: "Dev Agent",
      stopReason: "end_turn",
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.agentId, "dev-agent");
  const lines = readFileSync(inbox, "utf-8").split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.agentId, "dev-agent");
  assert.equal(parsed.agentName, "dev-agent");
  assert.equal(parsed.sessionId, "s1");
  assert.equal(parsed.transcriptPath, "/tmp/transcript.jsonl");
  assert.equal(parsed.stopReason, "end_turn");
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.costUSD, null);
  assert.ok(parsed.finishedAt);
  assert.ok(parsed.raw);
});

test("dispatch: accepts VS Code compatible snake_case subagentStop payload", async () => {
  const inbox = freshInbox();
  const r = await dispatch({
    inbox,
    payloadRaw: JSON.stringify({
      hook_event_name: "SubagentStop",
      session_id: "s2",
      transcript_path: "/tmp/snake.jsonl",
      agent_name: "qa-agent",
      agent_display_name: "QA Agent",
      stop_reason: "end_turn",
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.agentId, "qa-agent");
  const parsed = JSON.parse(readFileSync(inbox, "utf-8").split("\n").filter(Boolean)[0]);
  assert.equal(parsed.agentName, "qa-agent");
  assert.equal(parsed.sessionId, "s2");
  assert.equal(parsed.transcriptPath, "/tmp/snake.jsonl");
});

test("dispatch: normalizes agent_id / id keys", async () => {
  const inbox = freshInbox();
  const r1 = await dispatch({ inbox, payloadRaw: JSON.stringify({ agent_id: "x" }) });
  const r2 = await dispatch({ inbox, payloadRaw: JSON.stringify({ id: "y" }) });
  assert.equal(r1.agentId, "x");
  assert.equal(r2.agentId, "y");
  const lines = readFileSync(inbox, "utf-8").split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  // Verify the written record uses the normalized `agentId` key (not agent_id / id).
  assert.equal(JSON.parse(lines[0]).agentId, "x");
  assert.equal(JSON.parse(lines[1]).agentId, "y");
});

test("dispatch: multiple calls append cleanly", async () => {
  const inbox = freshInbox();
  for (let i = 0; i < 5; i++) {
    await dispatch({ inbox, payloadRaw: JSON.stringify({ agentId: `a${i}` }) });
  }
  const lines = readFileSync(inbox, "utf-8").split("\n").filter(Boolean);
  assert.equal(lines.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(JSON.parse(lines[i]).agentId, `a${i}`);
  }
});
