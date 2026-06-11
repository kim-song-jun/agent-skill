import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeTaskDocArtifact,
} from "../../../plugins/harness-floor/skills/agent-all/lib/task-doc-writer.mjs";
import { RedactionBlockedError } from "../../../plugins/harness-floor/skills/agent-all/lib/security/artifact-redactor.mjs";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "agent-skill-task-doc-"));
}

test("writeTaskDocArtifact masks medium privacy candidates before writing task docs", () => {
  const cwd = tempDir();
  try {
    const result = writeTaskDocArtifact({
      cwd,
      runId: "task-doc-redaction",
      path: ".agent-skill/tasks/T-20260611-001-redaction.md",
      content: "# Task\n\nOwner: user@example.com\n",
      now: "2026-06-11T00:00:00.000Z",
    });

    const written = readFileSync(join(cwd, result.path), "utf8");
    assert.doesNotMatch(written, /user@example\.com/);
    assert.match(written, /\[REDACTED:email-address\]/);
    assert.ok(result.redactionAudit);
    const audit = readFileSync(result.redactionAudit.path, "utf8");
    assert.doesNotMatch(audit, /user@example\.com/);
    assert.match(audit, /"rule":"email-address"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("writeTaskDocArtifact blocks high severity secrets before writing task docs", () => {
  const cwd = tempDir();
  try {
    assert.throws(
      () => writeTaskDocArtifact({
        cwd,
        runId: "task-doc-redaction",
        path: ".agent-skill/tasks/T-20260611-002-secret.md",
        content: "# Task\n\nToken: Bearer abcdefghijklmnopqrstuvwxyz123456\n",
        now: "2026-06-11T00:00:00.000Z",
      }),
      RedactionBlockedError,
    );
    assert.equal(existsSync(join(cwd, ".agent-skill/tasks/T-20260611-002-secret.md")), false);
    const audit = readFileSync(
      join(cwd, ".agent-skill/runs/task-doc-redaction/redaction-audit.jsonl"),
      "utf8",
    );
    assert.doesNotMatch(audit, /abcdefghijklmnopqrstuvwxyz123456/);
    assert.match(audit, /"rule":"bearer-token"/);
    assert.match(audit, /"blocked":true/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
