import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import {
  detectDispatchStrategy,
  hasAgentHookInToml,
  defaultCodexConfigPath,
  VISUAL_QA_MATCHER_PREFIX,
} from "../../plugins/harness-floor-codex/skills/visual-qa-codex/lib/dispatch-strategy.mjs";

import {
  buildPageTaskId,
  buildDispatchArgs,
  buildDispatchShellCommand,
  dispatchPageAgent,
} from "../../plugins/harness-floor-codex/skills/visual-qa-codex/lib/codex-agent-dispatch.mjs";

import {
  buildVisualQaPrefix,
  buildWaitArgs,
  buildWaitShellCommand,
  parseWaitResponse,
  waitForPageAgents,
} from "../../plugins/harness-floor-codex/skills/visual-qa-codex/lib/codex-agent-wait.mjs";

import {
  resolvePageSkillPath,
  buildPagePrompt,
  buildSequentialPageInvocation,
  buildSequentialPageShellCommand,
  parsePageResult,
  dispatchPageSequential,
} from "../../plugins/harness-floor-codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs";

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "vqa-codex-test-"));
}

// ---------------------------------------------------------------------------
// dispatch-strategy.mjs
// ---------------------------------------------------------------------------

test("vqa dispatch-strategy: VISUAL_QA_MATCHER_PREFIX exported", () => {
  assert.equal(VISUAL_QA_MATCHER_PREFIX, "visual-qa/page/");
});

test("vqa dispatch-strategy: defaultCodexConfigPath ends with ~/.codex/config.toml", () => {
  assert.match(defaultCodexConfigPath(), /\.codex\/config\.toml$/);
});

test("vqa dispatch-strategy: hasAgentHookInToml detects visual-qa matcher", () => {
  const toml = `
[[hooks.agent]]
matcher = "visual-qa/page/.*"
command = "codex-agent-dispatch"
`;
  assert.equal(hasAgentHookInToml(toml), true);
});

test("vqa dispatch-strategy: hasAgentHookInToml rejects agent-all matcher", () => {
  const toml = `
[[hooks.agent]]
matcher = "agent-all/wave/.*"
command = "codex-agent-dispatch"
`;
  assert.equal(hasAgentHookInToml(toml), false);
});

test("vqa dispatch-strategy: hasAgentHookInToml handles multiple [[hooks.agent]] sections", () => {
  const toml = `
[[hooks.agent]]
matcher = "agent-all/wave/.*"

[[hooks.agent]]
matcher = "visual-qa/page/.*"
`;
  assert.equal(hasAgentHookInToml(toml), true);
});

test("vqa dispatch-strategy: missing config falls back to sequential", () => {
  const t = makeTmp();
  try {
    const r = detectDispatchStrategy({
      configPath: join(t, "does-not-exist.toml"),
    });
    assert.equal(r.strategy, "sequential");
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
});

test("vqa dispatch-strategy: explicit override honoured", () => {
  const r = detectDispatchStrategy({ override: "agent-hook" });
  assert.equal(r.strategy, "agent-hook");
  assert.equal(r.override, true);
});

test("vqa dispatch-strategy: present hook yields agent-hook", () => {
  const t = makeTmp();
  try {
    const p = join(t, "config.toml");
    writeFileSync(p, `[[hooks.agent]]\nmatcher = "visual-qa/page/.*"\n`);
    const r = detectDispatchStrategy({ configPath: p });
    assert.equal(r.strategy, "agent-hook");
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// codex-agent-dispatch.mjs (visual-qa)
// ---------------------------------------------------------------------------

test("vqa codex-agent-dispatch: buildPageTaskId composes prefix + page", () => {
  assert.equal(buildPageTaskId("home"), "visual-qa/page/home");
  assert.equal(buildPageTaskId("login"), "visual-qa/page/login");
});

test("vqa codex-agent-dispatch: buildPageTaskId validates input", () => {
  assert.throws(() => buildPageTaskId(""), /pageName/);
});

test("vqa codex-agent-dispatch: buildDispatchArgs emits canonical argv with defaults", () => {
  const argv = buildDispatchArgs({
    pageName: "home",
    body: { baseUrl: "http://localhost:3000", path: "/" },
  });
  assert.deepEqual(argv, [
    "codex", "agent", "dispatch",
    "--role", "visual-qa-page",
    "--skill", ".codex/skills/visual-qa-page/SKILL.md",
    "--task-id", "visual-qa/page/home",
    "--body", JSON.stringify({ baseUrl: "http://localhost:3000", path: "/" }),
  ]);
});

test("vqa codex-agent-dispatch: body required", () => {
  assert.throws(() => buildDispatchArgs({ pageName: "home", body: null }), /body required/);
});

test("vqa codex-agent-dispatch: buildDispatchShellCommand shell-quotes", () => {
  const cmd = buildDispatchShellCommand({
    pageName: "home",
    body: { msg: "it's tricky" },
  });
  assert.match(cmd, /^'codex' 'agent' 'dispatch'/);
  assert.match(cmd, /it'\\''s tricky/);
});

test("vqa codex-agent-dispatch: dispatchPageAgent parses JSON", async () => {
  const runner = async () => ({
    stdout: JSON.stringify({ agentId: "p-1", taskId: "visual-qa/page/home", started: true }),
    stderr: "", status: 0,
  });
  const r = await dispatchPageAgent({
    pageName: "home", body: {},
  }, runner);
  assert.equal(r.agentId, "p-1");
});

test("vqa codex-agent-dispatch: dispatchPageAgent throws on non-zero", async () => {
  const runner = async () => ({ stdout: "", stderr: "boom", status: 1 });
  await assert.rejects(
    dispatchPageAgent({ pageName: "home", body: {} }, runner),
    /boom/,
  );
});

// ---------------------------------------------------------------------------
// codex-agent-wait.mjs (visual-qa)
// ---------------------------------------------------------------------------

test("vqa codex-agent-wait: buildVisualQaPrefix", () => {
  assert.equal(buildVisualQaPrefix(), "visual-qa/page/");
});

test("vqa codex-agent-wait: buildWaitArgs defaults to visual-qa prefix", () => {
  const argv = buildWaitArgs({});
  assert.equal(argv[argv.indexOf("--task-prefix") + 1], "visual-qa/page/");
});

test("vqa codex-agent-wait: buildWaitArgs accepts custom prefix", () => {
  const argv = buildWaitArgs({ taskPrefix: "visual-qa/page/home" });
  assert.equal(argv[argv.indexOf("--task-prefix") + 1], "visual-qa/page/home");
});

test("vqa codex-agent-wait: buildWaitShellCommand shell-quotes", () => {
  const cmd = buildWaitShellCommand({});
  assert.match(cmd, /^'codex' 'agent' 'wait'/);
});

test("vqa codex-agent-wait: parseWaitResponse normalizes captures/analyses", () => {
  const stdout = JSON.stringify([
    { agentId: "p1", status: "completed", captures: ["a.png"], analyses: ["a.md"],
      costUSD: 0.1, errors: [] },
  ]);
  const r = parseWaitResponse(stdout);
  assert.equal(r[0].captures.length, 1);
  assert.equal(r[0].analyses[0], "a.md");
  assert.equal(r[0].costUSD, 0.1);
});

test("vqa codex-agent-wait: parseWaitResponse handles agents envelope", () => {
  const stdout = JSON.stringify({ agents: [{ agentId: "x", status: "completed" }] });
  const r = parseWaitResponse(stdout);
  assert.equal(r[0].agentId, "x");
});

test("vqa codex-agent-wait: waitForPageAgents happy path", async () => {
  const runner = async (cmd) => {
    assert.match(cmd, /codex.*agent.*wait/);
    return {
      stdout: JSON.stringify([{ agentId: "p1", status: "completed" }]),
      stderr: "", status: 0,
    };
  };
  const r = await waitForPageAgents({}, runner);
  assert.equal(r.length, 1);
});

// ---------------------------------------------------------------------------
// sequential-dispatch.mjs (visual-qa)
// ---------------------------------------------------------------------------

test("vqa sequential-dispatch: resolvePageSkillPath uses fixed visual-qa-page slot", () => {
  assert.equal(
    resolvePageSkillPath("/repo"),
    "/repo/.codex/skills/visual-qa-page/SKILL.md",
  );
});

test("vqa sequential-dispatch: buildPagePrompt requires page+slugDir+baseUrl", () => {
  assert.throws(() => buildPagePrompt({}), /page required/);
  assert.throws(() => buildPagePrompt({
    page: { name: "" }, slugDir: "/s", baseUrl: "http://x",
  }), /page\.name/);
  assert.throws(() => buildPagePrompt({
    page: { name: "h" }, slugDir: "", baseUrl: "http://x",
  }), /slugDir/);
  assert.throws(() => buildPagePrompt({
    page: { name: "h" }, slugDir: "/s", baseUrl: "",
  }), /baseUrl/);
});

test("vqa sequential-dispatch: buildPagePrompt embeds env vars", () => {
  const prompt = buildPagePrompt({
    page: { name: "home", path: "/" },
    slugDir: "docs/visual-qa/run-1/",
    baseUrl: "http://localhost:3000",
  });
  assert.match(prompt, /PAGE_NAME: home/);
  assert.match(prompt, /PAGE_PATH: \//);
  assert.match(prompt, /BASE_URL:  http:\/\/localhost:3000/);
  assert.match(prompt, /OUTPUT_DIR: docs\/visual-qa\/run-1\/home\//);
  assert.match(prompt, /End with a JSON line/);
});

test("vqa sequential-dispatch: buildSequentialPageInvocation builds full argv", () => {
  const inv = buildSequentialPageInvocation({
    page: { name: "home" },
    slugDir: "out/",
    baseUrl: "http://x",
    projectRoot: "/r",
  });
  assert.match(inv.skillPath, /\.codex\/skills\/visual-qa-page\/SKILL\.md$/);
  assert.equal(inv.argv[0], "codex");
  assert.equal(inv.argv[1], "exec");
  assert.ok(inv.argv.includes("--skill"));
  assert.ok(inv.argv.includes("--prompt"));
});

test("vqa sequential-dispatch: buildSequentialPageShellCommand shell-quotes", () => {
  const { command, skillPath } = buildSequentialPageShellCommand({
    page: { name: "home" },
    slugDir: "out/",
    baseUrl: "http://x",
    projectRoot: "/r",
  });
  assert.match(command, /^'codex' 'exec'/);
  assert.match(skillPath, /visual-qa-page/);
});

test("vqa sequential-dispatch: parsePageResult extracts page summary", () => {
  const stdout = [
    "browser_navigate done",
    `{"page":"home","status":"completed","captures":["a.png"],"analyses":["a.md"],"errors":[]}`,
  ].join("\n");
  const r = parsePageResult(stdout);
  assert.equal(r.page, "home");
  assert.equal(r.status, "completed");
  assert.deepEqual(r.captures, ["a.png"]);
});

test("vqa sequential-dispatch: parsePageResult returns unknown for empty input", () => {
  assert.equal(parsePageResult("").status, "unknown");
  assert.equal(parsePageResult(null).status, "unknown");
});

test("vqa sequential-dispatch: dispatchPageSequential happy path", async () => {
  const runner = async () => ({
    stdout: `{"page":"home","status":"completed","captures":["a.png"],"analyses":["a.md"],"errors":[]}`,
    stderr: "", status: 0,
  });
  const r = await dispatchPageSequential({
    page: { name: "home" },
    slugDir: "out/",
    baseUrl: "http://x",
    projectRoot: "/r",
    requireSkillExists: false,
  }, runner);
  assert.equal(r.agentId, "sequential/page/home");
  assert.equal(r.taskId, "visual-qa/page/home");
  assert.equal(r.status, "completed");
  assert.deepEqual(r.captures, ["a.png"]);
});

test("vqa sequential-dispatch: dispatchPageSequential failure flagged incomplete", async () => {
  const runner = async () => ({ stdout: "", stderr: "exit-9", status: 9 });
  const r = await dispatchPageSequential({
    page: { name: "home" },
    slugDir: "out/",
    baseUrl: "http://x",
    projectRoot: "/r",
    requireSkillExists: false,
  }, runner);
  assert.equal(r.status, "incomplete");
  assert.ok(r.errors.some((e) => e.includes("exit-9")));
});

test("vqa sequential-dispatch: dispatchPageSequential rejects missing skill", async () => {
  const runner = async () => ({ stdout: "", stderr: "", status: 0 });
  await assert.rejects(
    dispatchPageSequential({
      page: { name: "home" },
      slugDir: "out/",
      baseUrl: "http://x",
      projectRoot: "/nonexistent-1234567890",
    }, runner),
    /skill file missing/,
  );
});
