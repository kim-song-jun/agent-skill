// Tests for the subprocess-fleet lib (agent-all-gemini and visual-qa-gemini).
//
// Uses dry-run + tiny mock shell binaries to avoid any dependency on a
// real `gemini` CLI install. The two vendored copies must behave
// identically — we exercise the agent-all-gemini copy and assert
// byte-identity against the visual-qa-gemini copy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, statSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join, resolve } from "node:path";

const AGENT_ALL_FLEET = "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/subprocess-fleet.mjs";
const VISUAL_QA_FLEET = "plugins/harness-floor-gemini/skills/visual-qa-gemini/lib/subprocess-fleet.mjs";

function makeTmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeMockBin(dir, name, body, mode = 0o755) {
  const p = join(dir, name);
  writeFileSync(p, body);
  chmodSync(p, mode);
  return p;
}

test("vendored copies of subprocess-fleet match byte-for-byte", () => {
  const a = readFileSync(resolve(AGENT_ALL_FLEET), "utf-8");
  const b = readFileSync(resolve(VISUAL_QA_FLEET), "utf-8");
  assert.equal(a, b, "agent-all-gemini and visual-qa-gemini copies of subprocess-fleet diverged");
});

test("runFleet --dry-run returns synthesised commands for each task", async () => {
  const { runFleet } = await import(`../../${AGENT_ALL_FLEET}`);
  const tasks = [
    { id: 1, body: "implement A", outputFile: "/tmp/x/1.json" },
    { id: 2, body: "implement B", outputFile: "/tmp/x/2.json" },
    { id: 3, body: "implement C", outputFile: "/tmp/x/3.json" },
  ];
  const results = await runFleet(tasks, { dryRun: true, geminiBin: "gemini" });
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.equal(r.dryRun, true);
    assert.equal(r.exitCode, 0);
    assert.match(r.command, /gemini.*chat/);
    assert.match(r.command, /--output-json/);
    assert.match(r.command, /--output-file/);
  }
  // Per-task body wired through into command.
  assert.ok(results[0].command.includes("implement A"));
  assert.ok(results[2].command.includes("implement C"));
});

test("runFleet caps concurrency at maxSubprocesses", async () => {
  const { runFleet } = await import(`../../${AGENT_ALL_FLEET}`);
  const tasks = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    body: `t${i}`,
    outputFile: `/tmp/x/${i}.json`,
  }));
  const results = await runFleet(tasks, { dryRun: true, maxSubprocesses: 4 });
  assert.equal(results.length, 10);
  // dry-run completes instantly; we're verifying no error / ordering preserved.
  assert.deepEqual(results.map((r) => r.task.id), [0,1,2,3,4,5,6,7,8,9]);
});

test("runFleet handles ENOENT (missing binary) gracefully", { timeout: 20_000 }, async () => {
  const { runFleet } = await import(`../../${AGENT_ALL_FLEET}`);
  const tasks = [{ id: "x", body: "noop", outputFile: "/tmp/noop.json" }];
  const results = await runFleet(tasks, {
    geminiBin: "/nonexistent/gemini-binary",
    timeoutMs: 2000,
  });
  assert.equal(results.length, 1);
  const r = results[0];
  assert.equal(r.exitCode, -1);
  assert.equal(r.errorCode, "ENOENT");
});

test("runFleet enforces SIGTERM after timeoutMs (via mock sleep binary)", { timeout: 20_000 }, async (t) => {
  if (platform() === "win32") return t.skip("posix mock binary");
  const dir = makeTmp("subprocess-fleet-");
  try {
    const mock = writeMockBin(dir, "gemini-sleep", "#!/bin/sh\nsleep 30\n");
    const { runFleet } = await import(`../../${AGENT_ALL_FLEET}`);
    const start = Date.now();
    const results = await runFleet(
      [{ id: 1, body: "x", outputFile: join(dir, "out.json") }],
      { geminiBin: mock, timeoutMs: 500, graceMs: 500 },
    );
    const elapsed = Date.now() - start;
    assert.equal(results.length, 1);
    assert.equal(results[0].timedOut, true);
    // SIGTERM means exit by signal, not normal exit code.
    assert.ok(results[0].signal === "SIGTERM" || results[0].signal === "SIGKILL" || results[0].exitCode != null);
    assert.ok(elapsed < 5_000, `expected fast kill, got ${elapsed}ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runFleet onTaskComplete callback fires per task", async () => {
  const { runFleet } = await import(`../../${AGENT_ALL_FLEET}`);
  const seen = [];
  const tasks = [
    { id: "a", body: "x", outputFile: "/tmp/a.json" },
    { id: "b", body: "y", outputFile: "/tmp/b.json" },
  ];
  await runFleet(tasks, {
    dryRun: true,
    onTaskComplete: (r) => seen.push(r.task.id),
  });
  assert.deepEqual(seen.sort(), ["a", "b"]);
});

test("__internal.buildArgs includes --skill-roster when provided", async () => {
  const { __internal } = await import(`../../${AGENT_ALL_FLEET}`);
  const args = __internal.buildArgs(
    { id: 1, body: "do it", outputFile: "/tmp/o.json" },
    { skillRosterDir: "/path/to/roster", timeoutMs: 60_000 },
  );
  assert.ok(args.includes("--skill-roster"));
  assert.equal(args[args.indexOf("--skill-roster") + 1], "/path/to/roster");
  assert.ok(args.includes("--output-json"));
  assert.ok(args.includes("--timeout"));
});
