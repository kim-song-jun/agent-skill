import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  assertValidEvidence,
  VERIFICATION_EVIDENCE_SCHEMA_VERSION,
} from "./schema.mjs";
import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "../security/artifact-redactor.mjs";
import { writeRedactionAudit } from "../security/redact-report-writer.mjs";

function safeRunId(runId) {
  const raw = typeof runId === "string" && runId.trim() ? runId.trim() : "default";
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function verificationEvidencePath({ cwd = ".", runId = "default" } = {}) {
  return resolve(cwd, ".agent-skill", "runs", safeRunId(runId), "verification-evidence.jsonl");
}

export function appendVerificationEvidence(evidence, {
  cwd = ".",
  runId = "default",
  timestamp = new Date().toISOString(),
  config = {},
} = {}) {
  const normalized = assertValidEvidence({
    schemaVersion: VERIFICATION_EVIDENCE_SCHEMA_VERSION,
    timestamp,
    ...evidence,
  });
  const path = verificationEvidencePath({ cwd, runId });
  const checked = redactArtifactContent({
    artifactPath: path,
    content: JSON.stringify(normalized),
    config,
    now: timestamp,
  });
  const redactionAudit = writeRedactionAudit({
    cwd,
    runId,
    config,
    artifactPath: path,
    findings: checked.findings,
    now: timestamp,
  });
  assertRedactionAllowed(checked);
  const redacted = JSON.parse(checked.content);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(redacted)}\n`, "utf-8");
  return { path, evidence: redacted, redactionAudit };
}
