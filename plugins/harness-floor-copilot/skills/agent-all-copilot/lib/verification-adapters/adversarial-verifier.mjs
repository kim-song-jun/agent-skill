// plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs
/**
 * Adversarial verifier — G1 of the smarter-agent-all skeleton.
 *
 * Independence is STRUCTURAL: the signature excludes implementerOutput / any
 * self-report. The verdict is re-derived solely by running breakCondition
 * against the wave tip commit via runVerificationAdapterSpec().
 *
 * Spec SSOT: docs/superpowers/specs/2026-06-21-smarter-agent-all-design.md §3.1
 * Model tier: callers MUST dispatch this via an opus subagent (§3.1, rule 11).
 */
import { runVerificationAdapterSpec } from "./registry.mjs";

/**
 * @param {object}   params
 * @param {string}   params.diff               Wave-tip diff — informational metadata only; intentionally not read by the verdict logic.
 * @param {string[]} params.acceptanceCriteria Human-readable criteria — informational metadata only; intentionally not read by the verdict logic.
 * @param {object}   params.breakCondition     A verification-adapter spec: { adapter, config }.
 * @param {string}   params.cwd                Working directory.
 * @param {Function} [params._runner]          Internal test hook (a command runner; NOT public, NOT implementer output).
 * @returns {Promise<{ audit: string, evidence: object, exitCode: number }>}
 */
export async function adversarialVerify({ diff, acceptanceCriteria, breakCondition, cwd, _runner }) {
  const ctx = { cwd: cwd ?? "." };
  const result = await runVerificationAdapterSpec(breakCondition, ctx, _runner);
  const passed = result.exitCode === 0;
  return {
    audit: passed ? "VERIFICATION_AUDIT: passed" : "VERIFICATION_AUDIT: failed",
    evidence: result.evidence,
    exitCode: result.exitCode,
  };
}
