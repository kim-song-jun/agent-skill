/**
 * DEFECT G1 — Real behavioral test: default-config buildGatePlan INCLUDES
 * the verification-reviewer-adversarial dispatch WITHOUT explicit adversarialVerify.
 *
 * The existing gate-plan.test.mjs only tests the gate when adversarialVerify is
 * EXPLICITLY passed as true; it never caught the DEFAULT_GATES=false defect.
 * These tests exercise the default code path exactly as Phase 4 does (passing
 * config.gates which does NOT carry adversarialVerify when using an old config).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildGatePlan } from "../../../plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs";
import { DEFAULTS } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

test("default-config (no gates arg) buildGatePlan includes verification-reviewer-adversarial", () => {
  // No gates arg at all — uses DEFAULT_GATES
  const plan = buildGatePlan({ files: ["src/feature.ts"] });
  const adv = plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial");
  assert.ok(adv, "DEFAULT-config buildGatePlan MUST include verification-reviewer-adversarial dispatch");
  assert.equal(adv.kind, "reviewer");
  assert.equal(adv.mode, "adversarial");
});

test("partial gates (Phase-4 style: specReview+qualityReview only, no adversarialVerify) includes adversarial dispatch", () => {
  // This is exactly what Phase 4 passes today when config.gates came from an old
  // .agent-all.json without adversarialVerify: {specReview:true, qualityReview:true}
  // resolvedGates spreads DEFAULT_GATES first, so the on-default applies.
  const plan = buildGatePlan({
    files: ["src/feature.ts"],
    gates: { specReview: true, qualityReview: true },
  });
  const adv = plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial");
  assert.ok(adv, "Partial gates without adversarialVerify key MUST inherit DEFAULT_GATES default (true)");
});

test("DEFAULTS.gates.adversarialVerify is true and ties to buildGatePlan", () => {
  // Cross-check: config-loader DEFAULTS must carry adversarialVerify:true
  assert.equal(
    DEFAULTS.gates.adversarialVerify,
    true,
    "config-loader DEFAULTS.gates.adversarialVerify must be true",
  );

  // And buildGatePlan with DEFAULTS.gates must include the adversarial dispatch
  const plan = buildGatePlan({ files: ["src/feature.ts"], gates: DEFAULTS.gates });
  const adv = plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial");
  assert.ok(adv, "buildGatePlan with DEFAULTS.gates must include verification-reviewer-adversarial");
});

test("adversarialVerify explicit false still opts out", () => {
  // Regression: explicitly disabling must still work
  const plan = buildGatePlan({
    files: ["src/feature.ts"],
    gates: { specReview: true, qualityReview: true, adversarialVerify: false },
  });
  assert.equal(
    plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial"),
    undefined,
    "adversarialVerify:false must omit the dispatch",
  );
});
