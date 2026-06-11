import { test } from "node:test";
import assert from "node:assert/strict";

import {
  scanTextForRedactions,
  summarizeRedactionFindings,
} from "../../../plugins/harness-floor/skills/agent-all/lib/security/redaction-scanner.mjs";
import { buildRedactionAuditEntry } from "../../../plugins/harness-floor/skills/agent-all/lib/security/redact-report-writer.mjs";

const TOKEN = "Bearer abcdefghijklmnopqrstuvwxyz123456";

test("redaction scanner blocks high severity secrets without storing samples", () => {
  const result = scanTextForRedactions(`Authorization: ${TOKEN}`, {
    artifactPath: ".agent-skill/runs/run-1/policy-log.jsonl",
  });

  assert.equal(result.blocked, true);
  assert.doesNotMatch(result.redactedText, /abcdefghijklmnopqrstuvwxyz/);
  assert.match(result.redactedText, /\[REDACTED:bearer-token\]/);
  assert.deepEqual(result.findings, [{
    rule: "bearer-token",
    severity: "high",
    count: 1,
    artifactPath: ".agent-skill/runs/run-1/policy-log.jsonl",
    action: "block",
  }]);
  assert.equal(JSON.stringify(result.findings).includes("abcdefghijklmnopqrstuvwxyz"), false);
});

test("redaction scanner masks medium privacy candidates by default", () => {
  const result = scanTextForRedactions("Contact jane.doe@example.com after the run.", {
    artifactPath: ".agent-skill/handoff/task.session.md",
  });

  assert.equal(result.blocked, false);
  assert.match(result.redactedText, /\[REDACTED:email-address\]/);
  assert.doesNotMatch(result.redactedText, /jane\.doe@example\.com/);
  assert.equal(result.findings[0].action, "mask");
});

test("redaction scanner supports path and rule allowlists without value allowlists", () => {
  const byPath = scanTextForRedactions(`Authorization: ${TOKEN}`, {
    artifactPath: "docs/public-fixtures/token.txt",
    config: { security: { redaction: { allowPaths: ["docs/public-fixtures/**"] } } },
  });
  assert.equal(byPath.blocked, false);
  assert.equal(byPath.findings.length, 0);
  assert.match(byPath.redactedText, /Bearer abcdef/);

  const byRule = scanTextForRedactions(`Authorization: ${TOKEN}`, {
    artifactPath: ".agent-skill/runs/run-1/policy-log.jsonl",
    config: { security: { redaction: { allowRules: ["bearer-token"] } } },
  });
  assert.equal(byRule.blocked, false);
  assert.equal(byRule.findings.length, 0);
  assert.match(byRule.redactedText, /Bearer abcdef/);
});

test("redaction summary includes only rule count severity and action", () => {
  const result = scanTextForRedactions(`email=a@example.com\n${TOKEN}`, {
    artifactPath: "artifact.md",
  });
  const summary = summarizeRedactionFindings(result.findings);

  assert.deepEqual(summary, [
    { rule: "bearer-token", severity: "high", action: "block", count: 1 },
    { rule: "email-address", severity: "medium", action: "mask", count: 1 },
  ]);
  assert.equal(JSON.stringify(summary).includes("example.com"), false);
  assert.equal(JSON.stringify(summary).includes("Bearer"), false);
});

test("redaction audit entry does not preserve secrets from artifact paths", () => {
  const entry = buildRedactionAuditEntry({
    artifactPath: `.agent-skill/reports/debug/${TOKEN}.md`,
    findings: [{
      rule: "bearer-token",
      severity: "high",
      count: 1,
      artifactPath: `.agent-skill/reports/debug/${TOKEN}.md`,
      action: "block",
    }],
    now: new Date("2026-06-11T00:00:00.000Z"),
  });

  const text = JSON.stringify(entry);
  assert.match(text, /\[REDACTED:bearer-token\]/);
  assert.doesNotMatch(text, /abcdefghijklmnopqrstuvwxyz123456/);
  assert.deepEqual(entry.redactions, [
    { rule: "bearer-token", severity: "high", action: "block", count: 1 },
  ]);
});
