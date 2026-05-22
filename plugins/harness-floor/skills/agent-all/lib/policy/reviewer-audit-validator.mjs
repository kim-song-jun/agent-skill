const TOKEN_RE = /VERIFICATION_AUDIT:\s*(passed|failed|skipped)\b/;

export function validateReviewerAudit(text) {
  if (TOKEN_RE.test(text)) return { ok: true };
  return {
    ok: false,
    reason: "Reviewer must include a line `VERIFICATION_AUDIT: passed|failed|skipped`. Token missing or value invalid.",
  };
}
