import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyChangedFiles } from "../../../plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs";

const ENTERPRISE_DJANGO_VUE = JSON.parse(
  readFileSync(resolve("tests/fixtures/project-shapes/enterprise-django-vue.json"), "utf-8"),
);

test("frontend UI files add design and QA reviewers plus base reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["src/components/Button.tsx"]).reviewers, [
    "design-reviewer",
    "qa-reviewer",
    "reviewer",
    "verification-reviewer",
  ]);
});

test("Vue router stores composables and assets add design and QA reviewers", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "src/router/index.ts",
      "src/stores/preferences.ts",
      "src/composables/useFeatureFlags.ts",
      "src/assets/theme.ts",
    ]).reviewers,
    ["design-reviewer", "qa-reviewer", "reviewer", "verification-reviewer"],
  );
});

test("Vue and Nuxt API plugin middleware paths add design and QA reviewers", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "src/api/http-client.ts",
      "src/plugins/dayjs.ts",
      "src/middleware/requireAuth.ts",
      "src/services/user-preferences.ts",
    ]).reviewers,
    [
      "design-reviewer",
      "qa-reviewer",
      "reviewer",
      "security-reviewer",
      "verification-reviewer",
    ],
  );
});

test("Vue auth store changes add frontend and security reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["src/stores/auth.ts", "src/composables/useSession.ts"]).reviewers, [
    "design-reviewer",
    "qa-reviewer",
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("backend models add data and security reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["backend/users/models.py"]).reviewers, [
    "data-reviewer",
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("Django app views viewsets urls and admin add security reviewer", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "apps/users/views.py",
      "apps/users/viewsets.py",
      "apps/users/urls.py",
      "apps/users/admin.py",
    ]).reviewers,
    ["reviewer", "security-reviewer", "verification-reviewer"],
  );
});

test("Django app tasks and services combine with Vue frontend changes as integration work", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "src/router/index.ts",
      "apps/billing/tasks.py",
      "apps/billing/celery.py",
      "apps/billing/services/invoices.py",
    ]).reviewers,
    [
      "design-reviewer",
      "integration-dev",
      "qa-reviewer",
      "reviewer",
      "verification-reviewer",
    ],
  );
});

test("backend migrations add data and security reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["backend/users/migrations/0002_add.py"]).reviewers, [
    "data-reviewer",
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("seeds fixtures and backfills add data reviewer", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "backend/users/fixtures/users.json",
      "scripts/seed-users.ts",
      "backend/users/backfills/fix-users.ts",
      "db/seeds/users.sql",
    ]).reviewers,
    ["data-reviewer", "reviewer", "verification-reviewer"],
  );
});

test("security-ish seed fixture and backfill files add security reviewer", () => {
  assert.deepEqual(
    classifyChangedFiles([
      "backend/users/fixtures/auth-users.json",
      "scripts/seed-secret-tokens.ts",
      "backend/users/backfills/destructive-fix-users.ts",
    ]).reviewers,
    ["data-reviewer", "reviewer", "security-reviewer", "verification-reviewer"],
  );
});

test("backend API views add security reviewer", () => {
  assert.deepEqual(classifyChangedFiles(["backend/api/views.py"]).reviewers, [
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("root API views add security reviewer", () => {
  assert.deepEqual(classifyChangedFiles(["api/views.py"]).reviewers, [
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("serializers add security reviewer", () => {
  assert.deepEqual(classifyChangedFiles(["backend/users/serializers.py"]).reviewers, [
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("middleware adds security reviewer", () => {
  assert.deepEqual(classifyChangedFiles(["backend/middleware/authz.py"]).reviewers, [
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("API views with serializers and middleware add security reviewer", () => {
  assert.deepEqual(
    classifyChangedFiles(["backend/api/views.py", "backend/users/serializers.py", "backend/middleware/authz.py"])
      .reviewers,
    ["reviewer", "security-reviewer", "verification-reviewer"],
  );
});

test("secret and destructive code paths add security reviewer without escalating docs-only changes", () => {
  assert.deepEqual(classifyChangedFiles(["scripts/destructive-cleanup.ts", "backend/config/secret-keys.ts"]).reviewers, [
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
  assert.deepEqual(classifyChangedFiles(["docs/secret-rotation.md", "notes/destructive-commands.txt"]).reviewers, [
    "reviewer",
    "verification-reviewer",
  ]);
});

test("frontend plus backend touch adds integration developer", () => {
  assert.deepEqual(classifyChangedFiles(["app/routes/dashboard.tsx", "server/jobs/project-sync.ts"]).reviewers, [
    "design-reviewer",
    "integration-dev",
    "qa-reviewer",
    "reviewer",
    "verification-reviewer",
  ]);
});

test("shared manifests locks and CI config add orchestrator for wave ownership", () => {
  const result = classifyChangedFiles([
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/test.yml",
    "docker-compose.yml",
  ]);
  assert.deepEqual(result.reviewers, [
    "reviewer",
    "verification-reviewer",
  ]);
  assert.deepEqual(result.coordinators, ["orchestrator"]);
});

test("broad non-doc changes add orchestrator even without a specific persona match", () => {
  const result = classifyChangedFiles([
    "lib/a.ts",
    "lib/b.ts",
    "lib/c.ts",
    "lib/d.ts",
    "lib/e.ts",
    "lib/f.ts",
    "lib/g.ts",
    "lib/h.ts",
  ]);
  assert.deepEqual(result.reviewers, [
    "reviewer",
    "verification-reviewer",
  ]);
  assert.deepEqual(result.coordinators, ["orchestrator"]);
});

test("docs-only or unknown files return only base reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["docs/usage.md", "notes/release-plan.txt", "unknown/file.xyz"]).reviewers, [
    "reviewer",
    "verification-reviewer",
  ]);
  assert.deepEqual(
    classifyChangedFiles([
      "docs/src/components/Button.tsx",
      "documentation/src/router/index.ts",
      "docs/apps/users/views.py",
    ]).reviewers,
    ["reviewer", "verification-reviewer"],
  );
});

test("auth, API route, and security-ish backend files add security reviewer", () => {
  assert.deepEqual(
    classifyChangedFiles(["server/auth/session.ts", "api/routes/login.ts", "backend/security/csp.js"]).reviewers,
    [
      "reviewer",
      "security-reviewer",
      "verification-reviewer",
    ],
  );
});

test("Enterprise Django and Vue monorepo changes route every required gate", () => {
  assert.deepEqual(classifyChangedFiles(ENTERPRISE_DJANGO_VUE.changedFiles), {
    reviewers: ENTERPRISE_DJANGO_VUE.expectedReviewers,
    coordinators: ENTERPRISE_DJANGO_VUE.expectedCoordinators,
  });
});
