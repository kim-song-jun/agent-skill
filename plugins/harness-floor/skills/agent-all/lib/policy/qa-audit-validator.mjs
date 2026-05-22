// QA audit token validator — parallel to reviewer-audit-validator.mjs.
// The QA reviewer's job is the user-side flow audit; it emits a token
// shaped exactly like the technical reviewer's audit, just under a
// different name so the controller can tell the two verdicts apart.
//
// Contract: at the END of its review, the QA reviewer outputs one literal line
//   QA_AUDIT: passed     — user-flow audit passed
//   QA_AUDIT: failed     — user-flow audit failed
//   QA_AUDIT: skipped    — audit not applicable (e.g. internal refactor)
//
// The hook injects the directive in plain language (en or ko); the token
// itself stays English-only for stable machine matching.

const TOKEN_RE = /QA_AUDIT:\s*(passed|failed|skipped)\b/;

export function validateQaAudit(text) {
  if (TOKEN_RE.test(text)) return { ok: true };
  return {
    ok: false,
    reason: "QA reviewer must include a line `QA_AUDIT: passed|failed|skipped`. Token missing or value invalid.",
  };
}
