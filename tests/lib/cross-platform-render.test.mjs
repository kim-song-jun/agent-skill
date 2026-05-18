import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../../plugins/harness-builder-codex/skills/codex-init/lib/render.mjs";

const CTX = {
  purpose: "Demo app",
  stack: "typescript",
  runtime: "docker",
  services_str: "postgres, redis",
  deploy_targets: "fly.io",
  constraints: "",
  agents: [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
  ],
  // agent-all-cursor template context
  maxIter: 10,
  maxCostUSD: 5,
  waveSize: "medium",
  breakCondition: "npm test --silent",
};

const CASES = [
  {
    tpl: "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs",
    contains: ["typescript (on docker: postgres, redis) — deploys to fly.io", "Project memory for Codex CLI"],
  },
  {
    tpl: "plugins/harness-builder-copilot/skills/copilot-init/templates/copilot-instructions.md.hbs",
    contains: ["typescript (on docker: postgres, redis)", "Project memory for GitHub Copilot CLI"],
  },
  {
    tpl: "plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs",
    contains: ["typescript (on docker: postgres, redis)", "Project memory for Gemini CLI"],
  },
  {
    tpl: "plugins/harness-builder-cursor/skills/cursor-init/templates/rules/agent-init.mdc.hbs",
    contains: ["typescript (on docker: postgres, redis)", "alwaysApply: true"],
  },
  {
    tpl: "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
    contains: ["[hooks]", "PreToolUse", "SessionStart"],
    extraCtx: { hook_command_pretool: "echo pre", hook_command_sessionstart: "echo start", mcp_servers_block: "" },
  },
  {
    tpl: "plugins/harness-builder-gemini/skills/gemini-init/templates/gemini-settings.json.hbs",
    contains: ["\"BeforeTool\"", "\"SessionStart\"", "\"mcpServers\""],
    extraCtx: { hook_command_beforetool: "echo bt", hook_command_sessionstart: "echo ss", mcp_servers_json_body: "" },
  },
  {
    tpl: "plugins/harness-builder-copilot/skills/copilot-init/templates/mcp-config.json.hbs",
    contains: ["\"mcpServers\""],
    extraCtx: { mcp_servers_json_body: "" },
  },
  {
    tpl: "plugins/harness-floor-codex/skills/visual-qa-codex/templates/mcp-snippet.toml.hbs",
    contains: ["[mcp_servers.playwright]", "@playwright/mcp@latest"],
  },
  {
    tpl: "plugins/harness-floor-copilot/skills/visual-qa-copilot/templates/mcp-snippet.json.hbs",
    contains: ["\"playwright\"", "@playwright/mcp@latest"],
  },
  {
    tpl: "plugins/harness-floor-gemini/skills/visual-qa-gemini/templates/mcp-snippet.json.hbs",
    contains: ["\"playwright\"", "@playwright/mcp@latest"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/visual-qa-cursor/templates/mcp-snippet.json.hbs",
    contains: ["\"playwright\"", "@playwright/mcp@latest"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/agent-all-cursor/templates/agent-all.config.json.hbs",
    contains: ["\"maxIter\": 10", "\"maxCostUSD\": 5", "\"waveSize\": \"medium\"", "npm test --silent"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/agent-all-cursor/templates/rules/agent-all.mdc.hbs",
    contains: ["alwaysApply: true", "agent-all-coordinator", "is_background"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/agent-all-cursor/templates/agents/agent-all-coordinator.md.hbs",
    contains: ["name: agent-all-coordinator", "is_background: false", "Dispatch protocol"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/agent-all-cursor/templates/agents/agent-all-implementer.md.hbs",
    contains: ["name: agent-all-implementer", "is_background: true", "STATUS: completed"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/agent-all-cursor/templates/agents/agent-all-reviewer.md.hbs",
    contains: ["name: agent-all-reviewer", "is_background: true", "mode=spec", "mode=quality"],
  },
  {
    tpl: "plugins/harness-floor-copilot/skills/agent-all-copilot/templates/agent-all.config.json.hbs",
    contains: ["\"maxIter\": 10", "\"maxCostUSD\": 5", "\"waveSize\": \"medium\"", "npm test --silent"],
  },
  {
    tpl: "plugins/harness-floor-copilot/skills/agent-all-copilot/templates/pr-body.md.hbs",
    contains: ["agent-all-copilot", "GitHub Copilot CLI", "## Summary", "## Iteration"],
  },
  {
    tpl: "plugins/harness-floor-codex/skills/agent-all-codex/templates/agent-all.config.json.hbs",
    contains: ["\"maxIter\": 10", "\"maxCostUSD\": 5", "\"dispatch\": \"auto\"", "npm test --silent"],
  },
  {
    tpl: "plugins/harness-floor-codex/skills/agent-all-codex/templates/pr-body.md.hbs",
    contains: ["agent-all-codex", "Codex CLI", "## Summary", "## Iteration"],
  },
  {
    tpl: "plugins/harness-floor-codex/skills/agent-all-codex/templates/codex-hooks-snippet.toml.hbs",
    contains: ["[[hooks.agent]]", "agent-all/wave/", "codex-agent-dispatch"],
  },
  {
    tpl: "plugins/harness-floor-gemini/skills/agent-all-gemini/templates/agent-all.config.json.hbs",
    contains: ["\"maxIter\": 10", "\"subprocessTimeout\": 1800", "\"maxSubprocesses\": 8", "npm test --silent"],
  },
  {
    tpl: "plugins/harness-floor-gemini/skills/agent-all-gemini/templates/pr-body.md.hbs",
    contains: ["agent-all-gemini", "Gemini CLI", "## Summary", "## Iteration"],
  },
  // visual-qa full-port templates
  {
    tpl: "plugins/harness-floor-cursor/skills/visual-qa-cursor/templates/agents/visual-qa-page.md.hbs",
    contains: ["name: visual-qa-page", "is_background: true", "browser_navigate", "browser_take_screenshot"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/visual-qa-cursor/templates/analysis-prompt.md.hbs",
    contains: ["visual-QA assistant", "severity"],
  },
  {
    tpl: "plugins/harness-floor-cursor/skills/visual-qa-cursor/templates/report.md.hbs",
    contains: ["Visual QA Report", "Per-page status", "Issues"],
  },
  {
    tpl: "plugins/harness-floor-copilot/skills/visual-qa-copilot/templates/page-prompt.md.hbs",
    contains: ["visual-QA page subagent", "browser_navigate", "browser_take_screenshot"],
  },
  {
    tpl: "plugins/harness-floor-codex/skills/visual-qa-codex/templates/page-prompt.md.hbs",
    contains: ["visual-QA page subagent", "browser_navigate", "apply_patch"],
  },
  {
    tpl: "plugins/harness-floor-codex/skills/visual-qa-codex/templates/codex-hooks-snippet.toml.hbs",
    contains: ["[[hooks.agent]]", "visual-qa/page/", "codex-agent-dispatch"],
  },
  {
    tpl: "plugins/harness-floor-gemini/skills/visual-qa-gemini/templates/page-prompt.md.hbs",
    contains: ["visual-QA page subagent", "browser_navigate", "OUTPUT_FILE", "write_file"],
  },
];

for (const c of CASES) {
  test(`renders ${c.tpl}`, () => {
    const tpl = readFileSync(resolve(c.tpl), "utf-8");
    const out = render(tpl, { ...CTX, ...(c.extraCtx ?? {}) });
    for (const needle of c.contains) {
      assert.ok(out.includes(needle), `Expected "${needle}" in render output of ${c.tpl}`);
    }
  });
}
