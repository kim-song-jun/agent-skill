# Advisory Hook Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove silent `catch {}` handling from shipped advisory hooks while preserving fail-open behavior.

**Architecture:** Add focused runtime tests that execute real hook files, then add small duplicated diagnostic helpers inside each standalone generated hook asset. Keep advisory hooks fail-open and route diagnostics to `stderr` only.

**Tech Stack:** Node.js ESM hooks, `node:test`, `node:child_process.spawnSync`, Bash release smoke script.

## Global Constraints

- Work only on `main`; do not create, switch, or use branches/worktrees.
- Do not use `git stash`, `git add -A`, `git commit -a`, destructive checkout, reset, restore, or clean commands.
- Commit only explicit pathspecs for files changed by this task.
- No production hook changes before a failing advisory diagnostics test has been run.
- Advisory hooks must exit `0` for malformed non-empty JSON and emit bounded warnings to `stderr`.
- Hook diagnostics must not be written to stdout.
- Generated hook files must remain standalone and must not import shared project helpers.

---

## File Structure

- Create: `tests/agent-all/policy/advisory-hook-error-handling.test.mjs`
  - Owns behavioral and static diagnostics coverage for the advisory hooks in this slice.
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs`
  - Adds local warning helpers and removes silent stdin, JSON, state read, and state write catches.
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs`
  - Adds local warning helpers and removes silent cache-heal and project-hint catches.
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs`
  - Adds local warning helpers and removes silent stdin, JSON, and append catches.
- Modify: `plugins/harness-builder/hooks/context-mode-cache-heal.mjs`
  - Adds local warning helpers and removes silent cache repair catches.
- Modify: `scripts/release-smoke.sh`
  - Adds the new diagnostics test to the focused release contracts.

## Task 1: Advisory Diagnostics Test

**Files:**
- Create: `tests/agent-all/policy/advisory-hook-error-handling.test.mjs`

**Interfaces:**
- Consumes: executable hook files listed in the spec.
- Produces: a focused Node test file that later release smoke can execute by path.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ADVISORY_HOOKS = [
  {
    name: "context-mode-router",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs",
  },
  {
    name: "cache-heal",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs",
  },
  {
    name: "session-summary",
    path: "plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs",
  },
  {
    name: "context-mode-cache-heal",
    path: "plugins/harness-builder/hooks/context-mode-cache-heal.mjs",
  },
];

for (const { name, path } of ADVISORY_HOOKS) {
  test(`${name} advisory hook has no silent catch blocks`, () => {
    const body = readFileSync(resolve(path), "utf-8");
    assert.doesNotMatch(
      body,
      /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
      `${path} must warn or explicitly no-op instead of silently swallowing hook errors`,
    );
  });

  test(`${name} advisory hook is valid JavaScript`, () => {
    const result = spawnSync(process.execPath, ["--check", resolve(path)], {
      encoding: "utf-8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}

for (const { name, path } of ADVISORY_HOOKS.filter((hook) =>
  ["context-mode-router", "session-summary"].includes(hook.name),
)) {
  test(`${name} advisory hook reports malformed JSON without blocking`, () => {
    const projectDir = mkdtempSync(resolve(tmpdir(), `${name}-malformed-json-`));
    const result = spawnSync(process.execPath, [resolve(path)], {
      input: "{not-json",
      encoding: "utf-8",
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
      },
    });

    assert.equal(result.status, 0);
    assert.match(
      result.stderr,
      new RegExp(`agent-skill hook warning: ${name}: parse hook payload:`),
    );
    assert.doesNotMatch(result.stdout, /agent-skill hook warning:/);
  });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/agent-all/policy/advisory-hook-error-handling.test.mjs
```

Expected: FAIL because the target hooks currently contain silent `catch {}` blocks and malformed JSON does not emit warning diagnostics.

## Task 2: Hook Diagnostics Implementation

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs`
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs`
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs`
- Modify: `plugins/harness-builder/hooks/context-mode-cache-heal.mjs`

**Interfaces:**
- Consumes: failing test from Task 1.
- Produces: standalone hook files with local `formatHookError` and `warnHook` helpers.

- [ ] **Step 1: Add local diagnostic helpers to each hook**

Use this shape, changing only `HOOK_NAME` per file:

```js
const HOOK_NAME = "context-mode-router";

function formatHookError(error) {
  const raw = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error || "unknown error");
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();
  return (firstLine || "unknown error").slice(0, 200);
}

function warnHook(action, error) {
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${formatHookError(error)}`);
}
```

- [ ] **Step 2: Replace stdin and JSON catches in stdin-driven hooks**

For `context-mode-router.mjs` and `session-summary.mjs`, use:

```js
let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch (error) {
  warnHook("read stdin", error);
}

let payload = {};
try {
  payload = JSON.parse(input || "{}");
} catch (error) {
  if (input.trim()) warnHook("parse hook payload", error);
  payload = {};
}
```

- [ ] **Step 3: Replace advisory filesystem catches**

For expected absent paths, keep the no-op explicit. For unexpected errors, warn:

```js
function warnUnlessMissing(action, error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
  warnHook(action, error);
}
```

Use `warnUnlessMissing("remove stale cache link", error)` around broken-link cleanup, and `warnHook("write routing state", error)`, `warnHook("append session decision", error)`, or `warnHook("heal context-mode cache", error)` for broader operations.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
node --test tests/agent-all/policy/advisory-hook-error-handling.test.mjs
```

Expected: PASS.

## Task 3: Release Smoke Guard and Verification

**Files:**
- Modify: `scripts/release-smoke.sh`

**Interfaces:**
- Consumes: passing advisory diagnostics test from Task 2.
- Produces: focused release smoke coverage for the new guard.

- [ ] **Step 1: Add the diagnostics test to focused release contracts**

Insert the test near `tests/agent-all/policy/policy-hook-error-handling.test.mjs`:

```bash
    tests/agent-all/policy/advisory-hook-error-handling.test.mjs \
    tests/agent-all/policy/policy-hook-error-handling.test.mjs \
```

- [ ] **Step 2: Run release smoke script test**

Run:

```bash
node --test tests/lib/release-smoke-script.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run focused release smoke**

Run:

```bash
./scripts/release-smoke.sh --fast --with-live-cli
```

Expected: PASS.

- [ ] **Step 4: Run full Node test suite**

Run:

```bash
node --test
```

Expected: PASS.

- [ ] **Step 5: Commit with explicit pathspecs**

Run:

```bash
git add tests/agent-all/policy/advisory-hook-error-handling.test.mjs \
  plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs \
  plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs \
  plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs \
  plugins/harness-builder/hooks/context-mode-cache-heal.mjs \
  scripts/release-smoke.sh \
  docs/superpowers/plans/2026-06-20-advisory-hook-diagnostics.md
git commit -m "test: guard advisory hook diagnostics" -- \
  tests/agent-all/policy/advisory-hook-error-handling.test.mjs \
  plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs \
  plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs \
  plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs \
  plugins/harness-builder/hooks/context-mode-cache-heal.mjs \
  scripts/release-smoke.sh \
  docs/superpowers/plans/2026-06-20-advisory-hook-diagnostics.md
git show --stat HEAD
```

Expected: the commit contains only the seven listed files.
