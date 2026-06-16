import { scanTextForRedactions } from "./redaction-scanner.mjs";
import { buildRedactionAuditEntry } from "./redact-report-writer.mjs";

export class RedactionBlockedError extends Error {
  constructor(message, { artifactPath, findings = [], audit = null } = {}) {
    super(message);
    this.name = "RedactionBlockedError";
    this.artifactPath = artifactPath;
    this.findings = findings;
    this.audit = audit;
  }
}

export function redactArtifactContent({
  artifactPath,
  content,
  config = {},
  now = new Date(),
} = {}) {
  const scan = scanTextForRedactions(content, { artifactPath, config });
  const audit = buildRedactionAuditEntry({
    artifactPath,
    findings: scan.findings,
    now,
  });
  return {
    ok: !scan.blocked,
    artifactPath,
    content: scan.redactedText,
    findings: scan.findings,
    audit,
  };
}

export function assertRedactionAllowed(result) {
  if (result?.ok !== false) return result;
  const summary = result.findings
    .filter((finding) => finding.action === "block")
    .map((finding) => `${finding.rule}=${finding.count}`)
    .join(", ");
  throw new RedactionBlockedError(
    `redaction gate blocked ${result.artifactPath}: ${summary || "high severity finding"}`,
    {
      artifactPath: result.artifactPath,
      findings: result.findings,
      audit: result.audit,
    },
  );
}

