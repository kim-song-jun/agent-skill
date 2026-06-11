export const REDACTION_RULE_SCHEMA_VERSION = "agent-redaction-rules/v1";

export const REDACTION_SEVERITIES = ["low", "medium", "high"];

function rule({ id, label, severity, pattern, mask = null }) {
  if (!REDACTION_SEVERITIES.includes(severity)) {
    throw new Error(`invalid redaction severity for ${id}: ${severity}`);
  }
  return {
    id,
    label,
    severity,
    pattern,
    mask: mask ?? `[REDACTED:${id}]`,
  };
}

export const DEFAULT_REDACTION_RULES = [
  rule({
    id: "private-key-block",
    label: "Private key block",
    severity: "high",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  }),
  rule({
    id: "bearer-token",
    label: "Bearer token",
    severity: "high",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  }),
  rule({
    id: "openai-api-key",
    label: "OpenAI-style API key",
    severity: "high",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  }),
  rule({
    id: "cloud-access-key",
    label: "Cloud access key",
    severity: "high",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  }),
  rule({
    id: "database-url",
    label: "Database connection URL",
    severity: "high",
    pattern: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s'"`<>]+/gi,
  }),
  rule({
    id: "session-cookie",
    label: "Session cookie",
    severity: "high",
    pattern: /\b(?:sessionid|session|sid|connect\.sid|auth_token|csrf_token)\s*=\s*[^;\s]{8,}/gi,
  }),
  rule({
    id: "env-secret-assignment",
    label: ".env-style secret assignment",
    severity: "high",
    pattern: /\b[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|SESSION[_-]?COOKIE)[A-Z0-9_]*\s*[:=]\s*["']?[^"'\s]{12,}["']?/gi,
  }),
  rule({
    id: "email-address",
    label: "Email address",
    severity: "medium",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  }),
  rule({
    id: "phone-number",
    label: "Phone number",
    severity: "medium",
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)|\d{2,4})[-.\s]\d{3,4}[-.\s]\d{4}\b/g,
  }),
  rule({
    id: "internal-url",
    label: "Internal URL/host",
    severity: "low",
    pattern: /\bhttps?:\/\/(?:localhost|[^/\s'"`<>]*\.(?:internal|corp|intranet|local)|(?:internal|intranet))(?::\d+)?(?:\/[^\s'"`<>]*)?/gi,
  }),
];

