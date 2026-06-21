import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGatePlan,
  descriptionForDispatch,
} from "../../../plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs";

test("gate-plan skips when spec and quality gates are disabled", () => {
  const plan = buildGatePlan({
    files: ["package.json", "src/components/Button.tsx"],
    gates: { specReview: false, qualityReview: false },
  });

  assert.equal(plan.skipped, true);
  assert.deepEqual(plan.dispatches, []);
});

test("gate-plan dispatches orchestrator first for shared hot files", () => {
  const plan = buildGatePlan({
    files: ["package.json", "pnpm-lock.yaml", ".github/workflows/test.yml"],
    gates: { specReview: true, qualityReview: true },
    taskId: "7",
    title: "Stabilize workspace install",
  });

  assert.equal(plan.skipped, false);
  assert.deepEqual(plan.coordinators, ["orchestrator"]);
  assert.equal(plan.dispatches[0].role, "orchestrator");
  assert.equal(plan.dispatches[0].kind, "coordinator");
  assert.equal(plan.dispatches[0].mode, "orchestration");
  assert.equal(plan.dispatches[0].auditToken, "ORCHESTRATION_AUDIT");
  assert.match(plan.dispatches[0].gateReason, /HOT\/shared files|broad non-doc/);
  assert.ok(
    plan.dispatches[0].passCriteria.some((criterion) => /pathspec commit risk/.test(criterion)),
    "orchestrator pass criteria should name pathspec commit risk",
  );
  assert.equal(
    plan.dispatches[0].description,
    "Orchestration Gate Task 7: Stabilize workspace install",
  );
});

test("gate-plan preserves spec review before quality reviewer gates after coordinators", () => {
  const plan = buildGatePlan({
    files: ["src/api/http-client.ts", "apps/users/views.py", "backend/users/models.py"],
    gates: { specReview: true, qualityReview: true, adversarialVerify: false },
  });

  assert.deepEqual(
    plan.dispatches.map((dispatch) => [dispatch.kind, dispatch.role, dispatch.mode, dispatch.auditToken]),
    [
      ["reviewer", "reviewer", "spec", "VERIFICATION_AUDIT"],
      ["reviewer", "reviewer", "quality", "VERIFICATION_AUDIT"],
      ["reviewer", "quality-debt-reviewer", "quality", "VERIFICATION_AUDIT"],
      ["reviewer", "verification-reviewer", "quality", "VERIFICATION_AUDIT"],
      ["reviewer", "qa-reviewer", "quality", "QA_AUDIT"],
      ["reviewer", "design-reviewer", "quality", "VERIFICATION_AUDIT"],
      ["reviewer", "security-reviewer", "quality", "VERIFICATION_AUDIT"],
      ["reviewer", "data-reviewer", "quality", "VERIFICATION_AUDIT"],
      ["reviewer", "integration-dev", "quality", "VERIFICATION_AUDIT"],
    ],
  );
  const qaDispatch = plan.dispatches.find((dispatch) => dispatch.role === "qa-reviewer");
  assert.match(qaDispatch.gateReason, /User-visible work/);
  assert.ok(qaDispatch.passCriteria.some((criterion) => /user-flow/.test(criterion)));
});

test("gate-plan can emit a stable task description for every dispatch", () => {
  const plan = buildGatePlan({
    files: ["src/components/Button.tsx"],
    gates: { specReview: false, qualityReview: true, adversarialVerify: false },
    taskId: "12",
    title: "Update checkout CTA",
  });

  assert.deepEqual(
    plan.dispatches.map((dispatch) => descriptionForDispatch(dispatch, { taskId: "12", title: "Update checkout CTA" })),
    [
      "Review Task 12: Update checkout CTA",
      "Quality Debt Review Task 12: Update checkout CTA",
      "Verification Review Task 12: Update checkout CTA",
      "QA Review Task 12: Update checkout CTA",
      "Design Review Task 12: Update checkout CTA",
    ],
  );
});

test("gate-plan exposes gate criteria for coordinator and audit verdict collection", () => {
  const plan = buildGatePlan({
    files: ["package.json", "src/components/Button.tsx"],
    gates: { specReview: true, qualityReview: true, adversarialVerify: false },
  });

  assert.deepEqual(plan.requiredAudits, {
    ORCHESTRATION_AUDIT: ["orchestrator"],
    QA_AUDIT: ["qa-reviewer"],
    VERIFICATION_AUDIT: ["reviewer", "reviewer", "quality-debt-reviewer", "verification-reviewer", "design-reviewer"],
  });
  assert.match(plan.passCriteria.join("\n"), /Quality debt reviewer/);
  assert.match(plan.passCriteria.join("\n"), /ORCHESTRATION_AUDIT.*passed.*skipped/);
  assert.match(plan.passCriteria.join("\n"), /QA_AUDIT.*qa-reviewer/);
  assert.match(plan.passCriteria.join("\n"), /VERIFICATION_AUDIT.*verification-reviewer/);
});

test("gate-plan can be augmented by dynamic orchestration roles", () => {
  const plan = buildGatePlan({
    files: ["docs/usage.md"],
    gates: { specReview: false, qualityReview: true },
    requiredReviewerRoles: ["qa-reviewer"],
    requiredCoordinatorRoles: ["orchestrator"],
  });

  assert.equal(plan.dispatches[0].role, "orchestrator");
  assert.ok(plan.reviewers.includes("qa-reviewer"));
  assert.ok(plan.requiredAudits.QA_AUDIT.includes("qa-reviewer"));
});

test("gate-plan includes verification-reviewer-adversarial dispatch with exact shape when adversarialVerify gate enabled", () => {
  const plan = buildGatePlan({
    files: ["src/feature.ts"],
    gates: { specReview: false, qualityReview: true, adversarialVerify: true },
    taskId: "42",
    title: "Add adversarial gate",
  });
  const adv = plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial");
  assert.ok(adv, "dispatches must include verification-reviewer-adversarial");
  assert.equal(adv.kind, "reviewer");
  assert.equal(adv.mode, "adversarial");
  assert.equal(adv.auditToken, "VERIFICATION_AUDIT");
  assert.equal(adv.requiredAudit, "VERIFICATION_AUDIT: passed|failed|skipped");
  assert.equal(adv.descriptionPrefix, "Adversarial Verification Task");
  assert.equal(adv.description, "Adversarial Verification Task 42: Add adversarial gate");
  assert.ok(adv.passCriteria.some((c) => c === "VERIFICATION_AUDIT: passed or skipped."),
    "passCriteria must contain exact 'VERIFICATION_AUDIT: passed or skipped.'");
  assert.ok(adv.passCriteria.some((c) => /without implementer self-report/.test(c)),
    "passCriteria must prohibit reliance on implementer self-report");
});

test("gate-plan verification-reviewer-adversarial appears after quality reviewers", () => {
  const plan = buildGatePlan({
    files: ["src/auth.ts"],
    gates: { specReview: false, qualityReview: true, adversarialVerify: true },
  });
  const roles = plan.dispatches.map((d) => d.role);
  const advIdx = roles.indexOf("verification-reviewer-adversarial");
  const qdrIdx = roles.indexOf("quality-debt-reviewer");
  assert.ok(advIdx !== -1 && qdrIdx !== -1);
  assert.ok(advIdx > qdrIdx, "adversarial dispatch must appear after quality reviewers");
});

test("gate-plan omits verification-reviewer-adversarial when adversarialVerify is explicitly false", () => {
  const plan = buildGatePlan({
    files: ["src/feature.ts"],
    gates: { specReview: false, qualityReview: true, adversarialVerify: false },
  });
  assert.equal(plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial"), undefined);
});
