import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  decisionToInteraction,
  normalizeInteraction,
  validateInteraction,
} from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/schema.mjs";
import {
  renderClaudeInteraction,
  selectedClaudeOptionId,
} from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/renderer-claude.mjs";
import { renderCodexInteraction } from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/renderer-codex.mjs";
import { renderCopilotInteraction } from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/renderer-copilot.mjs";
import { renderCursorInteraction } from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/renderer-cursor.mjs";
import { renderGeminiInteraction } from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/renderer-gemini.mjs";

const readRepoFile = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf-8");

test("normalizes and validates the common AgentInteraction schema", () => {
  const interaction = normalizeInteraction({
    id: "i1",
    kind: "budget_warning",
    title: "Budget",
    context: "Cost is near the cap",
    options: [
      { id: "continue", label: "Continue", recommended: true, risk: "medium" },
      { id: "stop", label: "Stop" },
    ],
    requireUserInput: true,
    nonTtyPolicy: "pause",
  });

  assert.equal(interaction.schemaVersion, "agent-interaction/v1");
  assert.equal(interaction.defaultOptionId, "continue");
  assert.equal(validateInteraction(interaction).ok, true);
});

test("decision payload converts to an interaction with original indexes preserved", () => {
  const interaction = decisionToInteraction({
    id: "storage",
    title: "Token storage",
    context: "OAuth callback",
    reasoning: "Cookie matches current app",
    recommended_index: 1,
    options: [
      { label: "localStorage", description: "Simple", risk: "high" },
      { label: "httpOnly cookie", description: "Safer" },
    ],
  }, { taskId: "7", taskTitle: "OAuth" });

  assert.equal(interaction.id, "7:storage");
  assert.equal(interaction.defaultOptionId, "option-1");
  assert.equal(interaction.options[0].metadata.originalIndex, 0);
  assert.equal(interaction.options[0].risk, "high");
});

test("Claude renderer returns AskUserQuestion args and selected option mapping", () => {
  const rendered = renderClaudeInteraction({
    id: "i1",
    kind: "decision",
    title: "Pick API",
    context: "Need a client",
    options: [
      { id: "a", label: "Fetch" },
      { id: "b", label: "Axios", recommended: true },
    ],
  });

  assert.equal(rendered.questions[0].header, "Pick API");
  assert.equal(rendered.questions[0].options[0].label, "(Recommended) Axios");
  assert.equal(selectedClaudeOptionId(rendered, 0), "b");
  assert.equal(selectedClaudeOptionId(rendered, 1), "a");
});

test("non-Claude renderers expose prompt or markdown surfaces with option ids", () => {
  const interaction = {
    id: "resume",
    kind: "resume",
    title: "Resume",
    context: "Pick next action",
    options: [
      { id: "agent-all", label: "Resume agent-all", recommended: true },
      { id: "verify", label: "Verify first" },
    ],
  };

  assert.deepEqual(renderCodexInteraction(interaction).optionIdOrder, ["agent-all", "verify"]);
  assert.match(renderCopilotInteraction(interaction), /agent-all: Resume agent-all/);
  assert.match(renderCursorInteraction(interaction), /Non-TTY policy/);
  assert.match(renderGeminiInteraction(interaction), /Resume/);
});

test("interaction helpers are vendored to core and platform agent-all runtimes", async () => {
  const targets = [
    "../../../plugins/harness-core/lib/interactions",
    "../../../plugins/harness-floor-codex/skills/agent-all-codex/lib/interactions",
    "../../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/interactions",
    "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/interactions",
    "../../../plugins/harness-floor-gemini/skills/agent-all-gemini/lib/interactions",
  ];
  const files = [
    "schema.mjs",
    "renderer-claude.mjs",
    "renderer-codex.mjs",
    "renderer-copilot.mjs",
    "renderer-cursor.mjs",
    "renderer-gemini.mjs",
    "non-tty-resolver.mjs",
    "interaction-log-writer.mjs",
  ];

  for (const root of targets) {
    for (const file of files) {
      const module = await import(`${root}/${file}`);
      assert.notEqual(Object.keys(module).length, 0, `${root}/${file} exports helpers`);
    }

    const schema = await import(`${root}/schema.mjs`);
    assert.equal(schema.INTERACTION_SCHEMA_VERSION, "agent-interaction/v1");

    const writer = await import(`${root}/interaction-log-writer.mjs`);
    assert.equal(typeof writer.appendInteractionLog, "function");
    assert.equal(typeof writer.interactionLogPath, "function");
  }
});

test("agent-init docs route interactive choices through the shared interaction model", () => {
  const initSurfaces = [
    {
      label: "claude",
      renderer: /renderer-claude\.mjs/,
      files: [
        "plugins/harness-builder/skills/agent-init/phases/1-discover.md",
        "plugins/harness-builder/skills/agent-init/phases/5-wire.md",
      ],
      source: /source: "agent-init"/,
    },
    {
      label: "codex",
      renderer: /renderer-codex\.mjs/,
      files: ["plugins/harness-builder-codex/skills/codex-init/SKILL.md"],
      source: /source: "codex-init"/,
    },
    {
      label: "cursor",
      renderer: /renderer-cursor\.mjs/,
      files: ["plugins/harness-builder-cursor/skills/cursor-init/SKILL.md"],
      source: /source: "cursor-init"/,
    },
    {
      label: "copilot",
      renderer: /renderer-copilot\.mjs/,
      files: ["plugins/harness-builder-copilot/skills/copilot-init/SKILL.md"],
      source: /source: "copilot-init"/,
    },
    {
      label: "gemini",
      renderer: /renderer-gemini\.mjs/,
      files: ["plugins/harness-builder-gemini/skills/gemini-init/SKILL.md"],
      source: /source: "gemini-init"/,
    },
  ];

  for (const surface of initSurfaces) {
    const combined = surface.files.map(readRepoFile).join("\n");
    assert.match(combined, /agent-interaction\/v1/, `${surface.label} uses schema`);
    assert.match(combined, surface.renderer, `${surface.label} names its renderer`);
    assert.match(combined, /resolveNonTtyInteraction\(\)/, `${surface.label} resolves non-TTY choices`);
    assert.match(combined, /interactions\.jsonl/, `${surface.label} writes interaction logs`);
    assert.match(combined, /high-risk/i, `${surface.label} blocks high-risk defaults`);
    assert.match(combined, surface.source, `${surface.label} uses a source label`);
  }
});

test("agent-all Phase 1, 3, and 6 docs use the shared interaction model", () => {
  const phases = [
    "plugins/harness-floor/skills/agent-all/phases/1-intent.md",
    "plugins/harness-floor/skills/agent-all/phases/3-dispatch.md",
    "plugins/harness-floor/skills/agent-all/phases/6-loop.md",
  ];
  const combined = phases.map(readRepoFile).join("\n");

  for (const pattern of [
    /agent-interaction\/v1/,
    /renderer-claude\.mjs/,
    /renderer-codex\.mjs/,
    /renderer-copilot\.mjs/,
    /renderer-cursor\.mjs/,
    /renderer-gemini\.mjs/,
    /interactions\.jsonl/,
    /high-risk/i,
  ]) {
    assert.match(combined, pattern);
  }
});

test("visual QA prompt docs use the shared interaction schema across platforms", () => {
  const platforms = [
    {
      label: "claude",
      renderer: /renderer-\*\.mjs/,
      files: [
        "plugins/harness-floor/skills/visual-qa/phases/0-preflight.md",
        "plugins/harness-floor/skills/visual-qa/phases/1-config.md",
      ],
    },
    {
      label: "codex",
      renderer: /renderer-codex\.mjs/,
      files: [
        "plugins/harness-floor-codex/skills/visual-qa-codex/phases/0-preflight.md",
        "plugins/harness-floor-codex/skills/visual-qa-codex/phases/1-config.md",
      ],
    },
    {
      label: "cursor",
      renderer: /renderer-cursor\.mjs/,
      files: [
        "plugins/harness-floor-cursor/skills/visual-qa-cursor/phases/0-preflight.md",
        "plugins/harness-floor-cursor/skills/visual-qa-cursor/phases/1-config.md",
      ],
    },
    {
      label: "copilot",
      renderer: /renderer-copilot\.mjs/,
      files: [
        "plugins/harness-floor-copilot/skills/visual-qa-copilot/phases/0-preflight.md",
        "plugins/harness-floor-copilot/skills/visual-qa-copilot/phases/1-config.md",
      ],
    },
    {
      label: "gemini",
      renderer: /renderer-gemini\.mjs/,
      files: [
        "plugins/harness-floor-gemini/skills/visual-qa-gemini/phases/0-preflight.md",
        "plugins/harness-floor-gemini/skills/visual-qa-gemini/phases/1-config.md",
      ],
    },
  ];

  for (const platform of platforms) {
    const combined = platform.files.map(readRepoFile).join("\n");
    assert.match(combined, /agent-interaction\/v1/, `${platform.label} uses schema`);
    assert.match(combined, platform.renderer, `${platform.label} names its renderer`);
    assert.match(combined, /appendInteractionLog\(\{ source: "visual-qa" \}\)/, `${platform.label} logs interactions`);
    assert.match(combined, /interactions\.jsonl/, `${platform.label} writes interaction JSONL`);
    assert.match(combined, /resolveNonTtyInteraction\(\)/, `${platform.label} resolves non-TTY decisions`);

    const configPhase = readRepoFile(platform.files[1]);
    assert.match(configPhase, /nonTtyPolicy: "pause"/, `${platform.label} blocks high-risk non-TTY runs`);
  }
});

test("debug prompt docs use shared interactions for refs and candidate selection", () => {
  const debugDocs = [
    [
      "plugins/harness-debug/skills/debug/SKILL.md",
      "plugins/harness-debug/skills/debug/phases/2-isolate.md",
      "plugins/harness-debug/skills/debug/phases/3-hypothesize.md",
    ],
    [
      "plugins/harness-debug-codex/skills/debug-codex/SKILL.md",
      "plugins/harness-debug-codex/skills/debug-codex/phases/2-isolate.md",
      "plugins/harness-debug-codex/skills/debug-codex/phases/3-hypothesize.md",
    ],
  ];

  for (const files of debugDocs) {
    const combined = files.map(readRepoFile).join("\n");
    assert.match(combined, /agent-interaction\/v1/);
    assert.match(combined, /debug:known-good-ref/);
    assert.match(combined, /debug:hypothesis-candidate/);
    assert.match(combined, /appendInteractionLog\(\{ source: "debug" \}\)/);
    assert.match(combined, /interactions\.jsonl/);
    assert.match(combined, /nonTtyPolicy: "pause"/);
    assert.match(combined, /high-risk/i);
  }
});
