import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import {
  detectDispatchStrategy,
  hasAgentHookInToml,
  defaultCodexConfigPath,
  AGENT_ALL_MATCHER_PREFIX,
} from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/dispatch-strategy.mjs";

import {
  buildWaveTaskId,
  buildDispatchArgs,
  buildDispatchShellCommand,
  dispatchAgent,
} from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/codex-agent-dispatch.mjs";

import {
  buildWavePrefix,
  buildWaitArgs,
  buildWaitShellCommand,
  parseWaitResponse,
  waitForAgents,
} from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/codex-agent-wait.mjs";

import {
  resolveSkillPath,
  buildSkillPrompt,
  buildSequentialInvocation,
  buildSequentialShellCommand,
  parseSkillResult,
  dispatchSequential,
} from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/sequential-dispatch.mjs";

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "agent-all-codex-test-"));
}

// ---------------------------------------------------------------------------
// dispatch-strategy.mjs
// ---------------------------------------------------------------------------

test("dispatch-strategy: defaultCodexConfigPath ends with ~/.codex/config.toml", () => {
  const p = defaultCodexConfigPath();
  assert.match(p, /\.codex\/config\.toml$/);
});

test("dispatch-strategy: hasAgentHookInToml rejects legacy agent-all hook matcher", () => {
  const toml = `
[[hooks.agent]]
matcher = "agent-all/wave/.*"
command = "codex-agent-dispatch"
`;
  assert.equal(hasAgentHookInToml(toml), false);
});

test("dispatch-strategy: hasAgentHookInToml rejects non-agent-all hook", () => {
  const toml = `
[[hooks.agent]]
matcher = "visual-qa/page/.*"
command = "codex-agent-dispatch"
`;
  assert.equal(hasAgentHookInToml(toml), false);
});

test("dispatch-strategy: hasAgentHookInToml rejects matcher in wrong section", () => {
  const toml = `
[[hooks.preToolUse]]
matcher = "agent-all/wave/.*"
`;
  assert.equal(hasAgentHookInToml(toml), false);
});

test("dispatch-strategy: hasAgentHookInToml rejects single-quoted legacy matcher", () => {
  const toml = `
[[hooks.agent]]
matcher = 'agent-all/wave/.*'
`;
  assert.equal(hasAgentHookInToml(toml), false);
});

test("dispatch-strategy: hasAgentHookInToml handles empty/null input", () => {
  assert.equal(hasAgentHookInToml(""), false);
  assert.equal(hasAgentHookInToml(null), false);
  assert.equal(hasAgentHookInToml(undefined), false);
});

test("dispatch-strategy: detectDispatchStrategy honours explicit override", () => {
  const r = detectDispatchStrategy({ override: "sequential" });
  assert.equal(r.strategy, "sequential");
  assert.equal(r.override, true);
  assert.match(r.reason, /override/);
});

test("dispatch-strategy: invalid override throws", () => {
  assert.throws(
    () => detectDispatchStrategy({ override: "magic" }),
    /invalid --dispatch override/,
  );
});

test("dispatch-strategy: agent-hook override is unsupported on current Codex", () => {
  assert.throws(
    () => detectDispatchStrategy({ override: "agent-hook" }),
    /unsupported.*current Codex hooks/i,
  );
});

test("dispatch-strategy: missing config falls back to sequential", () => {
  const t = makeTmp();
  try {
    const r = detectDispatchStrategy({
      configPath: join(t, "does-not-exist.toml"),
    });
    assert.equal(r.strategy, "sequential");
    assert.match(r.reason, /not found/);
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
});

test("dispatch-strategy: legacy agent hook still falls back to sequential", () => {
  const t = makeTmp();
  try {
    const p = join(t, "config.toml");
    writeFileSync(
      p,
      `[[hooks.agent]]\nmatcher = "agent-all/wave/.*"\ncommand = "codex-agent-dispatch"\n`,
    );
    const r = detectDispatchStrategy({ configPath: p });
    assert.equal(r.strategy, "sequential");
    assert.equal(r.probedPath, p);
    assert.match(r.reason, /unsupported.*current Codex hooks/i);
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
});

test("dispatch-strategy: AGENT_ALL_MATCHER_PREFIX constant export", () => {
  assert.equal(AGENT_ALL_MATCHER_PREFIX, "agent-all/wave/");
});

// ---------------------------------------------------------------------------
// codex-agent-dispatch.mjs
// ---------------------------------------------------------------------------

test("codex-agent-dispatch: buildWaveTaskId composes prefix + wave + task", () => {
  assert.equal(buildWaveTaskId(0, "task-1"), "agent-all/wave/0/task-1");
  assert.equal(buildWaveTaskId(3, "abc"), "agent-all/wave/3/abc");
});

test("codex-agent-dispatch: buildWaveTaskId validates inputs", () => {
  assert.throws(() => buildWaveTaskId(null, "x"), /waveIndex required/);
  assert.throws(() => buildWaveTaskId(0, ""), /taskId/);
});

test("codex-agent-dispatch: buildDispatchArgs emits canonical argv", () => {
  const argv = buildDispatchArgs({
    role: "dev",
    skillPath: ".codex/skills/dev/SKILL.md",
    taskId: "t1",
    waveIndex: 2,
    body: { title: "fix login", files: ["src/a.js"] },
  });
  assert.deepEqual(argv, [
    "codex", "agent", "dispatch",
    "--role", "dev",
    "--skill", ".codex/skills/dev/SKILL.md",
    "--task-id", "agent-all/wave/2/t1",
    "--body", JSON.stringify({ title: "fix login", files: ["src/a.js"] }),
  ]);
});

test("codex-agent-dispatch: buildDispatchArgs accepts custom codexBin", () => {
  const argv = buildDispatchArgs({
    role: "dev", skillPath: "s", taskId: "t", waveIndex: 0,
    body: {}, codexBin: "/usr/local/bin/codex",
  });
  assert.equal(argv[0], "/usr/local/bin/codex");
});

test("codex-agent-dispatch: buildDispatchShellCommand quotes safely", () => {
  const cmd = buildDispatchShellCommand({
    role: "dev", skillPath: "skill.md", taskId: "t1", waveIndex: 0,
    body: { msg: "it's tricky" },
  });
  assert.match(cmd, /^'codex' 'agent' 'dispatch'/);
  // single quote inside body should be escaped (closing+escaped+reopening)
  assert.match(cmd, /it'\\''s tricky/);
});

test("codex-agent-dispatch: required fields validated", () => {
  assert.throws(() => buildDispatchArgs({ role: "", skillPath: "s", taskId: "t",
    waveIndex: 0, body: {} }), /role/);
  assert.throws(() => buildDispatchArgs({ role: "r", skillPath: "", taskId: "t",
    waveIndex: 0, body: {} }), /skillPath/);
  assert.throws(() => buildDispatchArgs({ role: "r", skillPath: "s", taskId: "",
    waveIndex: 0, body: {} }), /taskId/);
  assert.throws(() => buildDispatchArgs({ role: "r", skillPath: "s", taskId: "t",
    waveIndex: 0, body: null }), /body required/);
});

test("codex-agent-dispatch: dispatchAgent parses JSON stdout", async () => {
  const runner = async () => ({
    stdout: JSON.stringify({ agentId: "abc-123", taskId: "agent-all/wave/0/t1",
      started: true }),
    stderr: "", status: 0,
  });
  const result = await dispatchAgent({
    role: "dev", skillPath: "s", taskId: "t1", waveIndex: 0, body: {},
  }, runner);
  assert.equal(result.agentId, "abc-123");
  assert.equal(result.started, true);
});

test("codex-agent-dispatch: dispatchAgent returns raw stdout on non-JSON", async () => {
  const runner = async () => ({ stdout: "ok\n", stderr: "", status: 0 });
  const result = await dispatchAgent({
    role: "dev", skillPath: "s", taskId: "t1", waveIndex: 0, body: {},
  }, runner);
  assert.equal(result.agentId, null);
  assert.equal(result.raw, "ok");
  assert.equal(result.taskId, "agent-all/wave/0/t1");
});

test("codex-agent-dispatch: dispatchAgent throws on non-zero exit", async () => {
  const runner = async () => ({ stdout: "", stderr: "boom", status: 2 });
  await assert.rejects(dispatchAgent({
    role: "dev", skillPath: "s", taskId: "t1", waveIndex: 0, body: {},
  }, runner), /codex agent dispatch failed.*boom/);
});

// ---------------------------------------------------------------------------
// codex-agent-wait.mjs
// ---------------------------------------------------------------------------

test("codex-agent-wait: buildWavePrefix returns wave-scoped prefix", () => {
  assert.equal(buildWavePrefix(0), "agent-all/wave/0/");
  assert.equal(buildWavePrefix(7), "agent-all/wave/7/");
});

test("codex-agent-wait: buildWaitArgs builds default invocation", () => {
  const argv = buildWaitArgs({ taskPrefix: "agent-all/wave/0/" });
  assert.deepEqual(argv, [
    "codex", "agent", "wait",
    "--task-prefix", "agent-all/wave/0/",
    "--timeout", "1800",
    "--json",
  ]);
});

test("codex-agent-wait: buildWaitArgs respects timeout + json=false", () => {
  const argv = buildWaitArgs({
    taskPrefix: "agent-all/wave/0/",
    timeoutSeconds: 60,
    json: false,
  });
  assert.equal(argv.includes("--json"), false);
  assert.equal(argv[argv.indexOf("--timeout") + 1], "60");
});

test("codex-agent-wait: invalid timeout rejected", () => {
  assert.throws(() => buildWaitArgs({ taskPrefix: "p", timeoutSeconds: 0 }), /positive/);
  assert.throws(() => buildWaitArgs({ taskPrefix: "p", timeoutSeconds: -10 }), /positive/);
});

test("codex-agent-wait: buildWaitShellCommand quotes argv", () => {
  const cmd = buildWaitShellCommand({ taskPrefix: "agent-all/wave/0/" });
  assert.match(cmd, /^'codex' 'agent' 'wait'/);
});

test("codex-agent-wait: parseWaitResponse normalizes array form", () => {
  const stdout = JSON.stringify([
    { agentId: "a", status: "completed", commits: ["sha1"], costUSD: 0.25 },
    { agent_id: "b", status: "blocked", errors: ["X"] },
  ]);
  const r = parseWaitResponse(stdout);
  assert.equal(r.length, 2);
  assert.equal(r[0].agentId, "a");
  assert.equal(r[0].costUSD, 0.25);
  assert.equal(r[1].agentId, "b");
  assert.deepEqual(r[1].errors, ["X"]);
  assert.deepEqual(r[1].commits, []);
});

test("codex-agent-wait: parseWaitResponse handles {results: [...]} envelope", () => {
  const stdout = JSON.stringify({ results: [{ agentId: "x", status: "completed" }] });
  const r = parseWaitResponse(stdout);
  assert.equal(r.length, 1);
  assert.equal(r[0].agentId, "x");
});

test("codex-agent-wait: parseWaitResponse handles cost_usd snake case", () => {
  const stdout = JSON.stringify([{ agentId: "x", status: "completed", cost_usd: 0.5 }]);
  const r = parseWaitResponse(stdout);
  assert.equal(r[0].costUSD, 0.5);
});

test("codex-agent-wait: parseWaitResponse throws on bad JSON", () => {
  assert.throws(() => parseWaitResponse("{not json"), /invalid JSON/);
});

test("codex-agent-wait: waitForAgents end-to-end with mocked runner", async () => {
  const runner = async (cmd) => {
    assert.match(cmd, /codex.*agent.*wait/);
    return {
      stdout: JSON.stringify([{ agentId: "a", status: "completed",
        commits: ["sha1"], costUSD: 0.1 }]),
      stderr: "", status: 0,
    };
  };
  const r = await waitForAgents({ taskPrefix: "agent-all/wave/0/" }, runner);
  assert.equal(r[0].agentId, "a");
});

test("codex-agent-wait: waitForAgents throws on non-zero exit", async () => {
  const runner = async () => ({ stdout: "", stderr: "timeout", status: 124 });
  await assert.rejects(
    waitForAgents({ taskPrefix: "agent-all/wave/0/" }, runner),
    /timeout/,
  );
});

// ---------------------------------------------------------------------------
// sequential-dispatch.mjs
// ---------------------------------------------------------------------------

test("sequential-dispatch: resolveSkillPath joins project root + role", () => {
  assert.equal(
    resolveSkillPath("dev", "/repo/x"),
    "/repo/x/.codex/skills/dev/SKILL.md",
  );
  assert.equal(
    resolveSkillPath("reviewer", "/repo/x/"),  // trailing slash trimmed
    "/repo/x/.codex/skills/reviewer/SKILL.md",
  );
});

test("sequential-dispatch: buildSkillPrompt includes task metadata", () => {
  const prompt = buildSkillPrompt({
    task: {
      id: "t-1",
      title: "Fix login",
      files: ["src/auth.js", "src/login.js"],
      body: "Detailed description",
    },
    plan: { path: "docs/plan.md" },
  });
  assert.match(prompt, /Task ID: t-1/);
  assert.match(prompt, /Title:   Fix login/);
  assert.match(prompt, /Plan: docs\/plan\.md/);
  assert.match(prompt, /- src\/auth\.js/);
  assert.match(prompt, /Detailed description/);
  assert.match(prompt, /End with a JSON line/);
});

test("sequential-dispatch: buildSkillPrompt embeds role skill body when provided", () => {
  const prompt = buildSkillPrompt({
    task: { id: "t-1", title: "Fix login" },
    skillPath: "/repo/.codex/skills/dev/SKILL.md",
    skillBody: "---\nname: dev\n---\nFollow TDD strictly.",
  });
  assert.match(prompt, /## Role Skill/);
  assert.match(prompt, /Path: \/repo\/\.codex\/skills\/dev\/SKILL\.md/);
  assert.match(prompt, /Follow TDD strictly/);
});

test("sequential-dispatch: buildSkillPrompt requires task fields", () => {
  assert.throws(() => buildSkillPrompt({}), /task object required/);
  assert.throws(() => buildSkillPrompt({ task: { id: "", title: "x" } }), /id/);
});

test("sequential-dispatch: buildSequentialInvocation defaults role to dev", () => {
  const inv = buildSequentialInvocation({
    task: { id: "t-1", title: "x" },
    projectRoot: "/repo",
  });
  assert.match(inv.skillPath, /\/repo\/\.codex\/skills\/dev\/SKILL\.md$/);
  assert.equal(inv.argv[0], "codex");
  assert.equal(inv.argv[1], "exec");
  assert.equal(inv.argv.length, 3);
  assert.equal(inv.argv.includes("--skill"), false);
  assert.equal(inv.argv.includes("--prompt"), false);
  assert.match(inv.argv[2], /Task ID: t-1/);
});

test("sequential-dispatch: buildSequentialInvocation honours custom role", () => {
  const inv = buildSequentialInvocation({
    task: { id: "t-1", title: "x", role: "reviewer" },
    projectRoot: "/repo",
  });
  assert.match(inv.skillPath, /\/reviewer\/SKILL\.md$/);
});

test("sequential-dispatch: buildSequentialShellCommand shell-quotes", () => {
  const { command, skillPath } = buildSequentialShellCommand({
    task: { id: "t1", title: "X", role: "dev" },
    projectRoot: "/r",
  });
  assert.match(command, /^'codex' 'exec'/);
  assert.doesNotMatch(command, /'--skill'|'--prompt'/);
  assert.match(skillPath, /SKILL\.md$/);
});

test("sequential-dispatch: parseSkillResult finds JSON tail", () => {
  const stdout = [
    "log line 1",
    "log line 2",
    `{"status":"completed","commits":["sha1","sha2"],"errors":[]}`,
  ].join("\n");
  const r = parseSkillResult(stdout);
  assert.equal(r.status, "completed");
  assert.deepEqual(r.commits, ["sha1", "sha2"]);
});

test("sequential-dispatch: parseSkillResult tolerates noise after JSON", () => {
  const stdout = [
    `{"status":"blocked","errors":["X"]}`,
    "extra noise",
    "{not-json}",
  ].join("\n");
  const r = parseSkillResult(stdout);
  // The non-parsable last line should be skipped, returning the prior good line.
  assert.equal(r.status, "blocked");
  assert.deepEqual(r.errors, ["X"]);
});

test("sequential-dispatch: parseSkillResult returns unknown if no JSON line", () => {
  const r = parseSkillResult("nothing here");
  assert.equal(r.status, "unknown");
  assert.equal(r.errors[0], "no JSON result line found in skill output");
});

test("sequential-dispatch: parseSkillResult handles empty/null input", () => {
  assert.equal(parseSkillResult("").status, "unknown");
  assert.equal(parseSkillResult(null).status, "unknown");
});

test("sequential-dispatch: dispatchSequential happy path returns unified shape", async () => {
  const runner = async () => ({
    stdout: `{"status":"completed","commits":["sha-x"],"errors":[]}`,
    stderr: "", status: 0,
  });
  const r = await dispatchSequential({
    task: { id: "t1", title: "X", role: "dev" },
    projectRoot: "/r",
    requireSkillExists: false,
  }, runner);
  assert.equal(r.agentId, "sequential/t1");
  assert.equal(r.taskId, "t1");
  assert.equal(r.status, "completed");
  assert.deepEqual(r.commits, ["sha-x"]);
  assert.equal(r.costUSD, 0);
});

test("sequential-dispatch: dispatchSequential inlines the role skill file into the prompt", async () => {
  const t = makeTmp();
  try {
    const skillDir = join(t, ".codex", "skills", "dev");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: dev\n---\nUse the project TDD protocol.",
    );
    const runner = async (cmd) => {
      assert.match(cmd, /^'codex' 'exec'/);
      assert.doesNotMatch(cmd, /'--skill'|'--prompt'/);
      assert.match(cmd, /Use the project TDD protocol/);
      return {
        stdout: `{"status":"completed","commits":[],"errors":[]}`,
        stderr: "",
        status: 0,
      };
    };
    const r = await dispatchSequential({
      task: { id: "t1", title: "X", role: "dev" },
      projectRoot: t,
    }, runner);
    assert.equal(r.status, "completed");
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
});

test("sequential-dispatch: dispatchSequential captures shell failure as blocked", async () => {
  const runner = async () => ({ stdout: "", stderr: "exit-2", status: 2 });
  const r = await dispatchSequential({
    task: { id: "t1", title: "X", role: "dev" },
    projectRoot: "/r",
    requireSkillExists: false,
  }, runner);
  assert.equal(r.status, "blocked");
  assert.ok(r.errors.some((e) => e.includes("exit-2")));
});

test("sequential-dispatch: dispatchSequential validates skill existence", async () => {
  const runner = async () => ({ stdout: "{}", stderr: "", status: 0 });
  // Default requireSkillExists: true, so /nonexistent path triggers error
  await assert.rejects(
    dispatchSequential({
      task: { id: "t1", title: "X", role: "dev" },
      projectRoot: "/nonexistent-path-1234567890",
    }, runner),
    /skill file missing/,
  );
});
