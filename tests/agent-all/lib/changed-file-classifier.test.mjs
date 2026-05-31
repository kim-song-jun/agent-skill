import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChangedFiles } from "../../../plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs";

test("frontend UI files add design and QA reviewers plus base reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["src/components/Button.tsx"]), [
    "design-reviewer",
    "qa-reviewer",
    "reviewer",
    "verification-reviewer",
  ]);
});

test("backend migrations and models add security and data reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["server/models/user.rb", "db/migrations/20260601000000_add_users.sql"]), [
    "data-reviewer",
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});

test("frontend plus backend touch adds integration developer", () => {
  assert.deepEqual(classifyChangedFiles(["app/routes/dashboard.tsx", "server/jobs/project-sync.ts"]), [
    "design-reviewer",
    "integration-dev",
    "qa-reviewer",
    "reviewer",
    "verification-reviewer",
  ]);
});

test("docs-only or unknown files return only base reviewers", () => {
  assert.deepEqual(classifyChangedFiles(["docs/usage.md", "notes/release-plan.txt", "unknown/file.xyz"]), [
    "reviewer",
    "verification-reviewer",
  ]);
});

test("auth, API route, and security-ish backend files add security reviewer", () => {
  assert.deepEqual(classifyChangedFiles(["server/auth/session.ts", "api/routes/login.ts", "backend/security/csp.js"]), [
    "reviewer",
    "security-reviewer",
    "verification-reviewer",
  ]);
});
