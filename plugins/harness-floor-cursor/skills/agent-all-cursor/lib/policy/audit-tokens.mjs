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

// Adversarial gate: a FAILED verification audit from the adversarial verifier
// is a critical block (gate-plan.mjs role "verification-reviewer-adversarial",
// phases/4-gate.md Step 3-adversarial). Pure: given the adversarial subagent's
// reported audit text, return whether the wave must route into block-on-critical/abort.
export const ADVERSARIAL_ROLE = "verification-reviewer-adversarial";

export function adversarialAuditBlocks(adversarialAuditText) {
  const text = String(adversarialAuditText ?? "");
  // Fail-safe, defense-in-depth beyond the doc-mandated single lowercase token:
  // scan EVERY VERIFICATION_AUDIT verdict occurrence, case-insensitively, and
  // block if ANY of them is `failed`. This closes two bypasses an earlier
  // first-match/case-sensitive matcher had — uppercase `FAILED` (fail-open) and
  // a stray `passed` preceding the real `failed` (first-match-wins). A compliant
  // reviewer emits exactly one lowercase token, for which this reduces to the
  // obvious result. Uses its own global+insensitive regex (not auditTokenPattern,
  // whose single-match `.exec` semantics other validators depend on).
  const re = new RegExp(`VERIFICATION_AUDIT:\\s*(${VERDICTS})\\b`, "gi");
  const verdicts = [...text.matchAll(re)].map((m) => m[1].toLowerCase());
  const blocked = verdicts.includes("failed");  // any failed => block
  const verdict =
    verdicts.length === 0 ? null : blocked ? "failed" : verdicts[verdicts.length - 1];
  return { blocked, verdict, role: ADVERSARIAL_ROLE };
}
