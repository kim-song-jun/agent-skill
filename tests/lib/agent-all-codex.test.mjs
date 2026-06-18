import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyChangedFiles as classifyClaudeChangedFiles } from "../../plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs";
import { buildGatePlan as buildClaudeGatePlan } from "../../plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs";
import { classifyChangedFiles as classifyCodexChangedFiles } from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/changed-file-classifier.mjs";
import { buildGatePlan as buildCodexGatePlan } from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/gate-plan.mjs";

const SKILL_ROOT = "plugins/harness-floor-codex/skills/agent-all-codex";
const ENTERPRISE_DJANGO_VUE = JSON.parse(
  readFileSync(resolve("tests/fixtures/project-shapes/enterprise-django-vue.json"), "utf-8"),
);

test("agent-all-codex: SKILL.md exists with name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: agent-all/);
  assert.ok(md.includes("Codex CLI"));
  assert.ok(md.includes("current Codex hooks"));
  assert.ok(md.includes("sequential"));
});

test("agent-all-codex: all 7 phase files exist", () => {
  for (const name of [
    "0-preflight.md",
    "1-intent.md",
    "2-plan.md",
    "3-dispatch.md",
    "4-gate.md",
    "5-pr.md",
    "6-loop.md",
  ]) {
    assert.ok(
      existsSync(resolve(SKILL_ROOT, "phases", name)),
      `phase file missing: ${name}`,
    );
  }
});

test("agent-all-codex: phase headings match contract", () => {
  const cases = [
    ["0-preflight.md", "# Phase 0 — Preflight"],
    ["1-intent.md", "# Phase 1 — Intent"],
    ["2-plan.md", "# Phase 2 — Plan"],
    ["3-dispatch.md", "# Phase 3 — Dispatch"],
    ["4-gate.md", "# Phase 4 — Gate"],
    ["5-pr.md", "# Phase 5 — PR"],
    ["6-loop.md", "# Phase 6 — Loop"],
  ];
  for (const [file, heading] of cases) {
    const body = readFileSync(resolve(SKILL_ROOT, "phases", file), "utf-8");
    assert.ok(body.startsWith(heading), `${file} should start with "${heading}"`);
  }
});

test("agent-all-codex: phase 3 documents sequential dispatch", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/3-dispatch.md"), "utf-8");
  assert.match(body, /sequential.*dispatch|dispatch.*sequential/i, "sequential dispatch must be the documented strategy");
  assert.ok(body.includes(".codex/skills/<role>/SKILL.md"), "role skill invocation");
  assert.ok(!body.includes("[[hooks.agent]]"), "must not document legacy agent hook");
});

test("agent-all-codex: phase 0 detects dispatch strategy", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/0-preflight.md"), "utf-8");
  assert.ok(body.includes("Detect dispatch strategy"));
  assert.ok(body.includes("current Codex hooks"));
});

test("agent-all-codex: phase 4 uses changed-file classifier persona gates", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "phases/4-gate.md"), "utf-8");

  assert.match(body, /changed-file-classifier\.mjs/);
  assert.match(body, /gate-plan\.mjs/);
  assert.match(body, /buildGatePlan/);
  assert.match(body, /classifyChangedFiles\(files\)/);
  assert.match(body, /coordinators/);
  assert.match(body, /orchestrator/);
  assert.match(body, /HOT files|HOT-file/);
  assert.match(body, /\.codex\/skills\/<persona>\/SKILL\.md/);
  assert.match(body, /verification-reviewer/);
  assert.match(body, /qa-reviewer/);
  assert.match(body, /design-reviewer/);
  assert.match(body, /security-reviewer/);
  assert.match(body, /data-reviewer/);
  assert.match(body, /integration-dev/);
  assert.match(body, /ORCHESTRATION_AUDIT: passed\|failed\|skipped/);
  assert.match(body, /QA_AUDIT: passed\|failed\|skipped/);
  assert.match(body, /VERIFICATION_AUDIT: passed\|failed\|skipped/);
  assert.match(body, /Tech success ≠ user-flow success|Tech success != user-flow success/);
});

test("agent-all-codex: changed-file classifier matches Claude source of truth", () => {
  const cases = [
    ["frontend/src/LoginForm.tsx", "backend/api/views.py", "backend/db/migrations/001.sql"],
    ["docs/README.md"],
    ["server/auth/session.ts", "fixtures/users.json"],
    ["src/router/index.ts", "apps/users/viewsets.py", "apps/billing/celery.py"],
    ["package.json", "pnpm-lock.yaml", ".github/workflows/test.yml"],
    ENTERPRISE_DJANGO_VUE.changedFiles,
  ];

  for (const files of cases) {
    assert.deepEqual(
      classifyCodexChangedFiles(files),
      classifyClaudeChangedFiles(files),
      `classifier mismatch for ${files.join(", ")}`,
    );
  }
});

test("agent-all-codex: gate plan matches Claude source of truth", () => {
  const cases = [
    ["package.json", "pnpm-lock.yaml", ".github/workflows/test.yml"],
    ["src/components/Button.tsx"],
    ["src/api/http-client.ts", "apps/users/views.py", "backend/users/models.py"],
    ENTERPRISE_DJANGO_VUE.changedFiles,
  ];

  for (const files of cases) {
    assert.deepEqual(
      buildCodexGatePlan({ files, gates: { specReview: true, qualityReview: true }, taskId: "9", title: "Gate" }),
      buildClaudeGatePlan({ files, gates: { specReview: true, qualityReview: true }, taskId: "9", title: "Gate" }),
      `gate plan mismatch for ${files.join(", ")}`,
    );
  }
});

test("agent-all-codex: Enterprise Django and Vue fixture preserves persona gate order", () => {
  const claudePlan = buildClaudeGatePlan({
    files: ENTERPRISE_DJANGO_VUE.changedFiles,
    gates: { specReview: true, qualityReview: true },
    taskId: "42",
    title: "Enterprise workflow",
  });
  const codexPlan = buildCodexGatePlan({
    files: ENTERPRISE_DJANGO_VUE.changedFiles,
    gates: { specReview: true, qualityReview: true },
    taskId: "42",
    title: "Enterprise workflow",
  });
  const projectedDispatches = codexPlan.dispatches.map(({ role, kind, mode, auditToken }) => ({
    role,
    kind,
    mode,
    auditToken,
  }));

  assert.deepEqual(codexPlan, claudePlan);
  assert.deepEqual(codexPlan.coordinators, ENTERPRISE_DJANGO_VUE.expectedCoordinators);
  assert.deepEqual(codexPlan.reviewers, ENTERPRISE_DJANGO_VUE.expectedGateReviewers);
  assert.deepEqual(projectedDispatches, ENTERPRISE_DJANGO_VUE.expectedDispatches);
});

test("agent-all-codex: changed-file classifier routes Enterprise Django and Vue gates", () => {
  const result = classifyCodexChangedFiles([
    "src/stores/auth.ts",
    "src/composables/useSession.ts",
    "apps/users/admin.py",
    "apps/users/views.py",
  ]);
  assert.deepEqual(
    result.reviewers,
    [
      "design-reviewer",
      "integration-dev",
      "qa-reviewer",
      "reviewer",
      "security-reviewer",
      "verification-reviewer",
    ],
  );
  assert.deepEqual(result.coordinators, []);
  assert.deepEqual(
    classifyCodexChangedFiles(["package.json", "pnpm-lock.yaml", ".github/workflows/test.yml"]).coordinators,
    ["orchestrator"],
  );
});

test("agent-all-codex: all template files exist", () => {
  for (const t of [
    "templates/agent-all.config.json.hbs",
    "templates/pr-body.md.hbs",
    "templates/codex-hooks-snippet.toml.hbs",
  ]) {
    assert.ok(existsSync(resolve(SKILL_ROOT, t)), `template missing: ${t}`);
  }
});

test("/agent-all Codex hook snippet does not emit unsupported agent hook", () => {
  const body = readFileSync(
    resolve(SKILL_ROOT, "templates/codex-hooks-snippet.toml.hbs"),
    "utf-8",
  );
  assert.ok(body.includes("current Codex hooks"));
  assert.ok(body.includes("sequential dispatch"));
  assert.ok(!body.includes("[[hooks.agent]]"));
  assert.ok(!body.includes("timeout_seconds"));
});

test("agent-all-codex: user prompt invoker surface has no unimplemented exec_command path", () => {
  for (const rel of ["lib/host-invoker.mjs", "lib/ask-user-adapter.mjs"]) {
    const body = readFileSync(resolve(SKILL_ROOT, rel), "utf-8");
    assert.ok(body.includes("exec_command") || body.includes("ask_user"), `${rel} should document prompt primitives`);
    assert.doesNotMatch(body, /not yet implemented|not implemented here/i);
  }
});

test("agent-all-codex: porting-notes flags unsupported legacy hook schema", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.ok(body.includes("current Codex hooks"));
  assert.ok(body.includes("unsupported"));
  assert.ok(body.includes("sequential"));
});
