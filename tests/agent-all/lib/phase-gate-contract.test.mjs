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
