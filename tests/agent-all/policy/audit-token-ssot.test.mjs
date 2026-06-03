import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUDIT_TOKENS,
  AUDIT_VERDICTS,
  VERIFICATION_MARKER,
  auditTokenPattern,
} from "../../../plugins/harness-floor/skills/agent-all/lib/policy/audit-tokens.mjs";

// SSOT drift-check for the governance exit(2) contract.
//
// floor-policy-hook derives the grammar by importing the canonical validators
// (which import audit-tokens.mjs). agent-policy-hook is COPIED standalone into
// a project's .claude/hooks/ and cannot import the canonical module at runtime,
// so it embeds an inline copy of the same token grammar. This test fails if
// either hook's embedded token contract drifts from audit-tokens.mjs — turning
// "vendored copy" into "vendored copy, byte-checked against the single source".

const GOVERNANCE_HOOKS = [
  "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
  "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
  "plugins/harness-floor/bin/floor-policy-hook.mjs",
];

// The Codex agent-policy-hook intentionally has no Task-governance layer
// (Codex has no Task subagent model), so it carries no audit tokens.
const NO_TASK_GOVERNANCE = new Set([
  "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
]);

const TOKENS = Object.values(AUDIT_TOKENS);

for (const rel of GOVERNANCE_HOOKS) {
  if (NO_TASK_GOVERNANCE.has(rel)) {
    test(`${rel} carries no Task-governance audit tokens (platform contract)`, () => {
      const src = readFileSync(resolve(rel), "utf-8");
      for (const token of TOKENS) {
        assert.ok(
          !src.includes(token),
          `${rel} should NOT reference Task-governance token ${token}`,
        );
      }
    });
    continue;
  }

  test(`${rel} embeds the canonical audit-token grammar`, () => {
    const src = readFileSync(resolve(rel), "utf-8");
    for (const token of TOKENS) {
      assert.ok(src.includes(token), `${rel} must reference canonical token ${token}`);
      assert.match(
        src,
        auditTokenPattern(token),
        `${rel} must use the canonical "${token}: ${AUDIT_VERDICTS.join("|")}" grammar`,
      );
    }
    assert.ok(
      src.includes(VERIFICATION_MARKER),
      `${rel} must reference the canonical verification marker ${VERIFICATION_MARKER}`,
    );
  });
}

test("canonical audit-tokens module exposes the full governance contract", () => {
  assert.deepEqual(AUDIT_VERDICTS, ["passed", "failed", "skipped"]);
  assert.deepEqual(Object.keys(AUDIT_TOKENS).sort(), ["coordinator", "qa", "reviewer"]);
  assert.equal(VERIFICATION_MARKER, "verification_passed");
  assert.match("VERIFICATION_AUDIT: passed", auditTokenPattern(AUDIT_TOKENS.reviewer));
  assert.doesNotMatch("VERIFICATION_AUDIT: maybe", auditTokenPattern(AUDIT_TOKENS.reviewer));
});
