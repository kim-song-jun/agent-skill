export function validateVerification(text) {
  if (!/STATUS:\s*DONE\b/i.test(text)) return { ok: true };
  if (/verification_passed/i.test(text)) return { ok: true };
  return {
    ok: false,
    reason: "Implementer claimed STATUS: DONE without a verification_passed log line. Re-run with verification-before-completion.",
  };
}
