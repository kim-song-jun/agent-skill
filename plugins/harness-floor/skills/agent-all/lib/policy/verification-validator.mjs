import { claimsDone, hasVerificationMarker } from "./audit-tokens.mjs";

export function validateVerification(text) {
  if (!claimsDone(text)) return { ok: true };
  if (hasVerificationMarker(text)) return { ok: true };
  return {
    ok: false,
    reason: "Implementer claimed STATUS: DONE without a verification_passed log line. Re-run with verification-before-completion.",
  };
}
