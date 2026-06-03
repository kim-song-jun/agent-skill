// Single source of truth for the agent-all governance exit(2) contract:
// the machine-parsed audit token names, the verdict grammar, and the
// implementer verification marker.
//
// Every governance surface derives its matcher from here so the contract
// cannot silently drift between the library-backed floor-policy-hook (which
// imports these directly) and the vendored, copied-into-project
// agent-policy-hook (which embeds an equivalent inline copy guarded by
// tests/agent-all/policy/audit-token-ssot.test.mjs). A drift here would make
// the gate accept a token shape the controller never emits — a silent
// governance failure — which is exactly why it is centralised.
//
// Note: the human-readable directive PROSE is intentionally NOT centralised
// here. floor-policy-hook injects bilingual (en/ko) directives and
// agent-policy-hook injects English-only ones; that locale split is a tested
// contract (tests/agent-all/policy/hook-router-i18n.test.mjs). Only the
// token grammar below — which stays English for stable machine matching —
// is shared.

export const AUDIT_VERDICTS = ["passed", "failed", "skipped"];

// Role → machine token. Stable English identifiers; never localise these.
export const AUDIT_TOKENS = {
  reviewer: "VERIFICATION_AUDIT",
  qa: "QA_AUDIT",
  coordinator: "ORCHESTRATION_AUDIT",
};

// Implementer self-report marker required before a STATUS: DONE is accepted.
export const VERIFICATION_MARKER = "verification_passed";

const VERDICTS = AUDIT_VERDICTS.join("|");

// Matcher for an audit token line, e.g. `VERIFICATION_AUDIT: passed`.
export function auditTokenPattern(token) {
  return new RegExp(`${token}:\\s*(${VERDICTS})\\b`);
}

// Does the text claim completion (STATUS: DONE)?
export function claimsDone(text) {
  return /STATUS:\s*DONE\b/i.test(String(text ?? ""));
}

// Does the text carry the implementer verification marker?
export function hasVerificationMarker(text) {
  return new RegExp(VERIFICATION_MARKER, "i").test(String(text ?? ""));
}
