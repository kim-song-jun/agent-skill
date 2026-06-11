import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { CAPABILITIES, capabilityById } from "../../plugins/harness-core/capabilities/catalog.mjs";
import {
  PLATFORMS,
  SUPPORT_LEVELS,
  validateCapability,
} from "../../plugins/harness-core/lib/capabilities/schema.mjs";
import { renderClaudeCapabilityAdapter } from "../../plugins/harness-core/lib/platform-adapters/claude.mjs";
import { renderCodexCapabilityAdapter } from "../../plugins/harness-core/lib/platform-adapters/codex.mjs";
import { renderSupportMatrix } from "../../plugins/harness-core/lib/platform-adapters/renderer.mjs";

test("capability catalog validates every AgentCapability entry", () => {
  assert.ok(CAPABILITIES.length >= 3);
  for (const capability of CAPABILITIES) {
    const result = validateCapability(capability);
    assert.equal(result.ok, true, `${capability.id}: ${result.errors.join("; ")}`);
  }
});

test("core metadata covers required MVP capabilities", () => {
  for (const id of ["agent-init", "agent-all", "visual-qa", "agent-handoff", "interaction", "policy-hook"]) {
    assert.ok(capabilityById(id), `${id} is registered`);
  }
});

test("platform support entries cover every known platform with valid support levels", () => {
  for (const capability of CAPABILITIES) {
    for (const platform of PLATFORMS) {
      assert.ok(SUPPORT_LEVELS.includes(capability.platformSupport[platform]), `${capability.id}.${platform}`);
    }
  }
});

test("Claude adapter renders native capabilities from shared metadata", () => {
  const rendered = renderClaudeCapabilityAdapter();
  assert.match(rendered, /# Claude Code Capability Adapter/);
  assert.match(rendered, /Agent All \| `\/agent-all` \| native/);
  assert.match(rendered, /Agent Handoff \| `\/agent-handoff` \| native/);
});

test("Codex adapter renders the same catalog without claiming full native floor support", () => {
  const rendered = renderCodexCapabilityAdapter();
  assert.match(rendered, /# Codex CLI Capability Adapter/);
  assert.match(rendered, /Agent Init \| `\/agent-init` \| native/);
  assert.match(rendered, /Agent All \| `\/agent-all` \| partial/);
  assert.doesNotMatch(rendered, /Agent All \| `\/agent-all` \| native/);
});

test("support matrix renders every capability and platform", () => {
  const matrix = renderSupportMatrix();
  for (const platform of ["Claude Code", "Codex CLI", "GitHub Copilot CLI", "Cursor", "Gemini CLI"]) {
    assert.match(matrix, new RegExp(platform));
  }
  for (const capability of CAPABILITIES) {
    assert.match(matrix, new RegExp(`\\| ${escapeRegex(capability.name)} \\|`));
  }
});

test("SUPPORT_MATRIX.md is generated from the capability catalog", () => {
  const expected = renderSupportMatrix();
  const current = readFileSync(resolve("SUPPORT_MATRIX.md"), "utf-8");
  assert.equal(current, expected);

  const res = spawnSync(process.execPath, [resolve("scripts/generate-support-matrix.mjs"), "--check"], {
    encoding: "utf-8",
  });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
