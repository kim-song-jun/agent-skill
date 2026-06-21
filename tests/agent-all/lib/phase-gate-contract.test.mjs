import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const phase3 = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/3-dispatch.md"), "utf8");
const phase4 = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/4-gate.md"), "utf8");

test("phase 3 records the pre-wave base commit before implementation", () => {
  const baseCommit = phase3.indexOf("baseCommit");
  const implementation = phase3.indexOf("3c — Implementation");
  const waveResult = phase3.indexOf("Capture wave result");

  assert.notEqual(baseCommit, -1);
  assert.notEqual(implementation, -1);
  assert.notEqual(waveResult, -1);
  assert.ok(baseCommit < implementation);
  assert.ok(waveResult > implementation);
  assert.match(phase3, /baseCommit.*git rev-parse HEAD/i);
  assert.match(phase3, /baseCommit.*startCommit.*endCommit/s);
});

test("phase 4 diffs from baseCommit and includes the first wave commit in fallback ranges", () => {
  assert.doesNotMatch(phase4, /git diff(?: --name-only)? <wave\.startCommit>\.\.<wave\.endCommit>/);
  assert.match(phase4, /git diff <wave\.baseCommit>\.\.<wave\.endCommit>/);
  assert.match(phase4, /git diff --name-only <wave\.baseCommit>\.\.<wave\.endCommit>/);
  assert.match(phase4, /older state without `baseCommit`/i);
  assert.match(phase4, /<wave\.startCommit>\^\.\.<wave\.endCommit>/);
  assert.match(phase4, /root commit/i);
  assert.match(phase4, /empty-tree/i);
});

test("phase 4 routes spec review through the generated reviewer persona", () => {
  assert.doesNotMatch(phase4, /spec-reviewer/);
  assert.match(phase4, /buildGatePlan/);
  assert.match(phase4, /classifyChangedFiles\(files\)/);
  assert.match(phase4, /mode=spec/i);
  assert.match(phase4, /Spec Review Task <N>: <title>/);
});

test("phase 4 dispatches verification-reviewer-adversarial with BLOCKING language and no self-report reliance", () => {
  assert.match(phase4, /verification-reviewer-adversarial/,
    "4-gate.md must dispatch verification-reviewer-adversarial");
  assert.match(phase4, /MUST NOT read the implementer|MUST re-derive/i,
    "adversarial step must use MUST-strength language");
  assert.match(phase4, /implementer.{0,60}self.report|self.report.{0,60}implementer/is,
    "adversarial step must name implementer self-report as forbidden");
  // /s flag — 'diff' and 'tip commit' may span lines; authored text also co-locates them.
  assert.match(phase4, /diff.*tip commit|tip commit.*diff/is,
    "adversarial step must specify diff and tip commit as the evidence source");
});

test("phase 4 adversarial step wires through adversarialVerify canonical wrapper, not raw runVerificationAdapterSpec", () => {
  // The adversarial section MUST reference the canonical wrapper so the structural-
  // independence guard (signature excludes self-report) is enforced on every live invocation.
  assert.match(
    phase4,
    /adversarialVerify\(\s*\{/,
    "4-gate.md adversarial section must reference adversarialVerify({ ... }) canonical wrapper"
  );

  // It must also name the correct source module so the dispatch is unambiguous.
  assert.match(
    phase4,
    /adversarial-verifier\.mjs/,
    "4-gate.md adversarial section must name adversarial-verifier.mjs as the source"
  );

  // The instruction MUST NOT instruct callers to call runVerificationAdapterSpec directly
  // (bypassing the wrapper reopens the self-report-drift risk).
  // Only a reference that says "Do NOT call" is acceptable — bare presence of the name
  // must be paired with a prohibition. We check by asserting the instruction context:
  // "Do NOT call runVerificationAdapterSpec() directly" must appear in the adversarial section.
  assert.match(
    phase4,
    /Do NOT call `runVerificationAdapterSpec\(\)` directly/,
    "4-gate.md must explicitly forbid direct runVerificationAdapterSpec() calls in the adversarial section"
  );

  // TEETH PROOF: verify the canonical-wrapper regex would NOT match the OLD text
  // (the text before this fix, which referenced runVerificationAdapterSpec directly
  //  without adversarialVerify).
  const oldAdversarialText =
    "MUST re-derive the verdict from the wave diff and the wave tip commit only " +
    "— `git diff <wave.baseCommit>..<wave.endCommit>` plus running `breakCondition` " +
    "against the wave tip commit via `runVerificationAdapterSpec()` (`lib/verification-adapters/registry.mjs:822`).";
  assert.doesNotMatch(
    oldAdversarialText,
    /adversarialVerify\(\s*\{/,
    "TEETH PROOF: old text that bypassed the wrapper must NOT match the canonical-wrapper regex"
  );
});

test("phase 4 adversarial dispatch is wired into the block-on-critical retry loop", () => {
  // Loose proximity check (kept for baseline coverage):
  assert.match(phase4, /verification-reviewer-adversarial[\s\S]{0,260}critical|critical[\s\S]{0,260}verification-reviewer-adversarial/,
    "4-gate.md must treat a failed adversarial audit as critical");

  // STRENGTHENED: pin the LITERAL blocking tie from 4-gate.md ~line 145.
  // The spec says: "a `VERIFICATION_AUDIT: failed` from `verification-reviewer-adversarial`
  // is a `critical` issue that BLOCKS the wave; the orchestrator MUST enter the
  // block-on-critical retry loop (step 5)."
  // This regex requires `verification-reviewer-adversarial` followed (within 400 chars) by
  // EITHER "BLOCKS the wave" OR "block-on-critical retry loop" — the two canonical phrases
  // that prove the adversarial result is structurally blocking, not merely advisory.
  assert.match(
    phase4,
    /verification-reviewer-adversarial[\s\S]{0,400}?(BLOCKS the wave|block-on-critical retry loop)/i,
    "the adversarial dispatch must be tied to BLOCKING language, not advisory"
  );

  // TEETH PROOF: verify the strengthened regex does NOT match a toothless advisory string.
  // If the blocking phrasing were downgraded to advisory wording, the regex above must fail.
  const toothlessSample =
    "verification-reviewer-adversarial is recorded as a critical-severity advisory note and does not halt the wave";
  assert.doesNotMatch(
    toothlessSample,
    /verification-reviewer-adversarial[\s\S]{0,400}?(BLOCKS the wave|block-on-critical retry loop)/i,
    "TEETH PROOF: toothless advisory wording must NOT pass the blocking-language regex"
  );
});
