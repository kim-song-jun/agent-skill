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
];

for (const c of CASES) {
  test(`renders ${c.tpl}`, () => {
    const tpl = readFileSync(resolve(c.tpl), "utf-8");
    const out = render(tpl, CTX);
    for (const needle of c.contains) {
      assert.ok(out.includes(needle), `Expected "${needle}" in render output of ${c.tpl}`);
    }
  });
}
