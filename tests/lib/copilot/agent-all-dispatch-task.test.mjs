import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskCall,
  dispatchTask,
  parseTaskResult,
  __internal,
} from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/dispatch-task.mjs";

test("buildTaskCall: requires task.id and task.title", () => {
  assert.throws(() => buildTaskCall({ task: {} }), /task\.id/);
  assert.throws(() => buildTaskCall({ task: { id: 1 } }), /task\.title/);
});

test("buildTaskCall: produces prompt + context with files/role/plan", () => {
  const { prompt, context } = buildTaskCall({
    task: { id: 7, title: "Add signup form", files: ["src/a.ts"], role: "frontend-dev", planSection: "do the thing" },
    plan: { memoryKey: "agent-all/plan", path: "docs/plan.md" },
  });
  assert.match(prompt, /Implement: Add signup form/);
  assert.match(prompt, /Task ID:\*\* 7/);
  assert.match(prompt, /Role:\*\* frontend-dev/);
  assert.match(prompt, /src\/a\.ts/);
  assert.match(prompt, /do the thing/);
  assert.match(prompt, /STATUS: completed\|blocked\|failed/);
  assert.deepEqual(context.files, ["src/a.ts"]);
  assert.equal(context.role, "frontend-dev");
  assert.equal(context.agentAllTask, 7);
  assert.equal(context.planKey, "agent-all/plan");
  assert.equal(context.planPath, "docs/plan.md");
});

test("buildTaskCall: defaults role to 'dev' when missing", () => {
  const { context } = buildTaskCall({ task: { id: 1, title: "x" } });
  assert.equal(context.role, "dev");
});

test("buildTaskCall: escapes triple-backticks inside planSection", () => {
  const { prompt } = buildTaskCall({
    task: { id: 1, title: "t", planSection: "use ```js code```" },
  });
  // Triple-backtick inside the plan section must not break the outer fence.
  const tripleBackticks = prompt.match(/```/g) || [];
  // We expect exactly 4 fences: outer plan-section open/close + outer
  // STATUS/COMMITS open/close. The inner `js code` text uses U+02BB.
  assert.equal(tripleBackticks.length, 4);
});

test("dispatchTask: rejects when taskCaller missing", async () => {
  await assert.rejects(
    () => dispatchTask({ call: { prompt: "x" } }),
    /taskCaller/,
  );
});

test("dispatchTask: passes prompt + merged context to taskCaller", async () => {
  let captured = null;
  const taskCaller = async ({ name, args }) => {
    captured = { name, args };
    return { agentId: "agent-42" };
  };
  const result = await dispatchTask({
    call: { prompt: "hi", context: { a: 1 } },
    taskCaller,
    contextExtras: { b: 2, agentAllWave: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.agentId, "agent-42");
  assert.equal(captured.name, "task");
  assert.equal(captured.args.prompt, "hi");
  assert.deepEqual(captured.args.context, { a: 1, b: 2, agentAllWave: 0 });
});

test("dispatchTask: handles raw-string reply", async () => {
  const taskCaller = async () => "raw-id-1";
  const r = await dispatchTask({ call: { prompt: "x" }, taskCaller });
  assert.equal(r.ok, true);
  assert.equal(r.agentId, "raw-id-1");
});

test("dispatchTask: returns error when reply has no agentId", async () => {
  const taskCaller = async () => ({ foo: "bar" });
  const r = await dispatchTask({ call: { prompt: "x" }, taskCaller });
  assert.equal(r.ok, false);
  assert.match(r.error, /missing agentId/);
});

test("dispatchTask: surfaces taskCaller exceptions", async () => {
  const taskCaller = async () => { throw new Error("rate-limited"); };
  const r = await dispatchTask({ call: { prompt: "x" }, taskCaller });
  assert.equal(r.ok, false);
  assert.equal(r.error, "rate-limited");
});

test("parseTaskResult: parses STATUS + COMMITS", () => {
  const out = parseTaskResult(`
Some chat above.

STATUS: completed
COMMITS: abc1234,def5678
`);
  assert.equal(out.status, "completed");
  assert.deepEqual(out.commits, ["abc1234", "def5678"]);
  assert.deepEqual(out.errors, []);
});

test("parseTaskResult: handles 'blocked' status with no commits", () => {
  const out = parseTaskResult(`STATUS: blocked\nCOMMITS: (none)`);
  assert.equal(out.status, "blocked");
  assert.deepEqual(out.commits, []);
});

test("parseTaskResult: filters non-hex commit junk", () => {
  const out = parseTaskResult(`STATUS: failed\nCOMMITS: notasha, 1234abcd, foo!@#`);
  assert.deepEqual(out.commits, ["1234abcd"]);
});

test("parseTaskResult: empty output records error", () => {
  const out = parseTaskResult("");
  assert.equal(out.status, "unknown");
  assert.match(out.errors[0], /empty/);
});

test("parseTaskResult: missing STATUS records error", () => {
  const out = parseTaskResult("Just some message");
  assert.equal(out.status, "unknown");
  assert.match(out.errors[0], /no STATUS/);
});

test("__internal: STATUS_RE + COMMITS_RE match the expected patterns", () => {
  // STATUS_RE must match all three valid statuses and reject unknowns.
  assert.ok(__internal.STATUS_RE.test("STATUS: completed"));
  assert.ok(__internal.STATUS_RE.test("STATUS: blocked"));
  assert.ok(__internal.STATUS_RE.test("STATUS: failed"));
  assert.ok(!__internal.STATUS_RE.test("STATUS: unknown"),
    "STATUS_RE must NOT match an unrecognised status value");
  assert.ok(!__internal.STATUS_RE.test("STATUS:"),
    "STATUS_RE must NOT match a bare STATUS: with no value");
  // COMMITS_RE must capture the commits payload verbatim.
  const m = "COMMITS: abc1234,def5678".match(__internal.COMMITS_RE);
  assert.ok(m, "COMMITS_RE must match a COMMITS line");
  assert.equal(m[1], "abc1234,def5678");
});
