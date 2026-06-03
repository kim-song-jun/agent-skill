import { AUDIT_TOKENS, auditTokenPattern } from "./audit-tokens.mjs";

const TOKEN_RE = auditTokenPattern(AUDIT_TOKENS.reviewer);

export function validateReviewerAudit(text) {
  if (TOKEN_RE.test(text)) return { ok: true };
  return {
    ok: false,
    reason: "Reviewer must include a line `VERIFICATION_AUDIT: passed|failed|skipped`. Token missing or value invalid.",
  };
}
