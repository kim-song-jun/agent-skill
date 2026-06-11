import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  scanQualityDebtFiles,
  summarizeQualityDebtFindings,
} from "../../../plugins/harness-floor/skills/agent-all/lib/policy/quality-debt-scanner.mjs";

function tempProject() {
  return mkdtempSync(join(tmpdir(), "quality-debt-"));
}

function writeRel(root, rel, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

test("detects fallback TODO suppressions skipped and meaningless tests in changed files", () => {
  const cwd = tempProject();
  try {
    writeRel(cwd, "src/auth.ts", [
      "export function token(value: string): string {",
      "  // TODO: remove this compatibility branch",
      "  try { return value; } catch (e) {}",
      "  const fallback = legacyValue;",
      "  return value as any;",
      "}",
    ].join("\n"));
    writeRel(cwd, "tests/auth.test.ts", [
      "test.skip('auth regression', () => {});",
      "test('coverage only', () => { expect(true).toBe(true); });",
      "// @ts-ignore",
    ].join("\n"));

    const scan = scanQualityDebtFiles({
      cwd,
      files: ["src/auth.ts", "tests/auth.test.ts"],
    });
    assert.equal(scan.enabled, true);
    assert.deepEqual(
      scan.findings.map((finding) => finding.rule).sort(),
      ["broad-any", "broad-catch", "debt-marker", "fallback", "meaningless-test", "skipped-test", "suppression"].sort(),
    );
    assert.equal(scan.summary.action, "deny");
    assert.equal(scan.summary.severity, "critical");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("detects production test-only and debug-only branches", () => {
  const scan = scanQualityDebtFiles({
    files: ["src/handler.ts"],
    fileContents: {
      "src/handler.ts": [
        "if (process.env.NODE_ENV === 'test') return fakeResponse();",
        "if (__DEBUG__) console.debug('payload');",
      ].join("\n"),
    },
  });
  assert.deepEqual(
    scan.findings.map((finding) => finding.rule).sort(),
    ["debug-only-production", "test-only-production"].sort(),
  );
  assert.equal(scan.summary.action, "deny");
});

test("supports path allowlist and rule allowlist", () => {
  const scan = scanQualityDebtFiles({
    files: ["fixtures/generated/sample.ts", "src/handler.ts"],
    fileContents: {
      "fixtures/generated/sample.ts": "// TODO generated fixture\n",
      "src/handler.ts": "const value: any = input;\n",
    },
    policy: {
      qualityDebt: {
        allowPaths: ["fixtures/generated/**"],
        allowRules: ["broad-any"],
      },
    },
  });
  assert.equal(scan.findings.length, 0);
  assert.equal(scan.allowedFindings.length, 2);
  assert.equal(scan.summary.action, "allow");
});

test("Quality Debt Exceptions with issue link and future expiry justify findings", () => {
  const scan = scanQualityDebtFiles({
    files: ["src/legacy.ts"],
    fileContents: {
      "src/legacy.ts": "const fallback = legacyValue;\n",
    },
    taskDocText: [
      "## Quality Debt Exceptions",
      "",
      "| Item | Reason | Owner | Follow-up issue | Expiry |",
      "|---|---|---|---|---|",
      "| fallback in src/legacy.ts | legacy API migration | @owner | #123 | 2026-06-30 |",
    ].join("\n"),
    now: new Date("2026-06-11T00:00:00Z"),
  });
  assert.equal(scan.findings.length, 0);
  assert.equal(scan.allowedFindings.length, 1);
  assert.equal(scan.allowedFindings[0].allowReason, "task Quality Debt Exceptions");
});

test("expired or issue-less exceptions do not justify findings", () => {
  const scan = scanQualityDebtFiles({
    files: ["src/legacy.ts"],
    fileContents: {
      "src/legacy.ts": "const fallback = legacyValue;\n",
    },
    taskDocText: [
      "## Quality Debt Exceptions",
      "",
      "| Item | Reason | Owner | Follow-up issue | Expiry |",
      "|---|---|---|---|---|",
      "| fallback in src/legacy.ts | legacy API migration | @owner | TBD | 2026-06-01 |",
    ].join("\n"),
    now: new Date("2026-06-11T00:00:00Z"),
  });
  assert.equal(scan.findings.length, 1);
  assert.equal(scan.findings[0].action, "requires_justification");
});

test("summarizeQualityDebtFindings ranks requires_justification below deny", () => {
  assert.deepEqual(summarizeQualityDebtFindings([
    { action: "requires_justification", severity: "error" },
    { action: "deny", severity: "critical" },
  ]), {
    action: "deny",
    severity: "critical",
    count: 2,
  });
});
