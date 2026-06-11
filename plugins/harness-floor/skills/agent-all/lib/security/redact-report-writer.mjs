import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  scanTextForRedactions,
  summarizeRedactionFindings,
} from "./redaction-scanner.mjs";

export const REDACTION_AUDIT_SCHEMA_VERSION = "agent-redaction-audit/v1";

const SAFE_RUN_ID = /[^A-Za-z0-9._-]/g;

function sanitizeRunId(runId) {
  const safe = String(runId || "redaction").replace(SAFE_RUN_ID, "-");
  return safe || "redaction";
}

function artifactRoot(config = {}) {
  return config.artifactRoot || config.artifact?.root || ".agent-skill";
}

function safeAuditArtifactPath(artifactPath) {
  return scanTextForRedactions(String(artifactPath ?? "(unknown)"), {
    artifactPath: "redaction-audit-artifact",
    config: {
      security: {
        redaction: {
          failOn: [],
          maskOn: ["high", "medium", "low"],
        },
      },
    },
  }).redactedText;
}

export function redactionAuditPath({ cwd = process.cwd(), runId = "redaction", config = {} } = {}) {
  return join(cwd, artifactRoot(config), "runs", sanitizeRunId(runId), "redaction-audit.jsonl");
}

export function buildRedactionAuditEntry({
  artifactPath,
  findings = [],
  now = new Date(),
} = {}) {
  const redactions = summarizeRedactionFindings(findings);
  return {
    schemaVersion: REDACTION_AUDIT_SCHEMA_VERSION,
    timestamp: now instanceof Date ? now.toISOString() : String(now),
    artifact: safeAuditArtifactPath(artifactPath),
    blocked: redactions.some((entry) => entry.action === "block"),
    redactions,
  };
}

export function writeRedactionAudit({
  cwd = process.cwd(),
  runId = "redaction",
  config = {},
  artifactPath,
  findings = [],
  now = new Date(),
} = {}) {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  const path = redactionAuditPath({ cwd, runId, config });
  mkdirSync(dirname(path), { recursive: true });
  const entry = buildRedactionAuditEntry({ artifactPath, findings, now });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
  return { path, entry };
}
