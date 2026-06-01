# Operational Agent Init + Agent-All Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/agent-init` and `/agent-all` production-grade for Claude Code and Codex by default: heavy operational scaffold, lite opt-out, task ledger, pathspec/destructive-command policy, handoff discipline, reviewer personas, and foundation detection.

**Architecture:** Build shared deterministic Node helpers first, then wire them into Claude skill docs/templates, Codex init CLI/templates, Gemini soft templates, and `/agent-all` phase docs. Runtime enforcement is platform-specific: Claude and Codex get generated policy hook scripts, while Gemini receives instruction-level rules. All existing project files are preserved by sentinel merge, not overwritten.

**Tech Stack:** Pure Node ESM, `node:test`, Handlebars-like local renderer, Markdown skill phase files, shell scripts, Codex TOML snippets, Claude settings JSON.

**Reference spec:** `docs/superpowers/specs/2026-06-01-operational-agent-init-agent-all-design.md`

---

## Implementation Status

Implemented through Task 12 as of 2026-06-02. The detailed TDD task list below is a historical TDD checklist kept as an audit trail; future agents should treat this section, the release contracts, and the current test suite as the source of completion state instead of re-reading unchecked boxes as pending work.

Completed scope:

- Tasks 1-12 are implemented in repo artifacts: sentinel merge, folder guides, foundation checks, task ledger, pathspec policy, Claude/Codex/Gemini operational init surfaces, agent-all handoff runtime, changed-file reviewer routing, foundation update planning, default Claude/Codex terminal foundation auto-update, docs, and release audit.
- Latest hardening addition: Claude/Codex operational orchestration contracts, deterministic Phase 4 `buildGatePlan` dispatch ordering, coordinator-first `orchestrator` gate review, `ORCHESTRATION_AUDIT` policy validation, classifier gate reasons and per-dispatch pass criteria copied into review prompts, role gate matrices embedded in both root memory and orchestrator personas, stack-specific implementation routing matrices for `frontend-dev`/`backend-dev`/`integration-dev`, release-fixture proof that fresh installs render those matrices and ship usable stack-specific persona bodies, Codex operational fixture proof that sequential dispatch loads and inlines installed `frontend-dev`/`backend-dev` role skills, configured QA persona propagation, Claude/Codex QA and base/specialized reviewer audit-token contracts, doctor validation for stale operational guidance, shell-callable Claude `bin/init.mjs` fixture bootstrap with post-install doctor parity, `install-platform.sh --platform=claude` operational/builder/lite project bootstrap release-fixture coverage and uninstall coverage, release-fixture evidence for persona-aware reviewer scaffolds, project-local generated hook/task-checker executable packaging, project-local cleanup contracts, plugin-local `clean.mjs` entrypoints, `clean.mjs --help` command-surface coverage, Claude/Codex `install-platform.sh --uninstall` release-fixture roundtrips, `install-platform.sh --uninstall --force-root-clean` wrapper coverage for generated-looking root guidance cleanup, Codex operational/default-heavy, builder, and lite post-install doctor evidence in release fixtures, Codex floor/thrift single-theme release fixtures with project-local-only artifact checks, Codex debug project-local installation and post-install doctor coverage through `install-platform.sh --platform=codex --theme=all|debug`, Codex debug-only fresh fixture coverage, default approved foundation auto-update with non-fatal degraded mode plus strict/opt-out modes for Claude/Codex operational terminal bootstrap, and release-audit coverage for the shared Claude/Codex project installer wrapper, the final `scripts/release-smoke.sh` gate contract, public CLI script executable/shebang packaging, release-fixture doctor smoke contract, and orchestrator gate persona contracts. This sits alongside slash-command release audit coverage, Codex command-surface checks, `scripts/release-fixture-smoke.mjs`, and the Claude/Codex release readiness matrix for marketplace manifests, required init/floor/thrift/debug files, hook schema expectations, implementation/reviewer routing, audit tokens, and root role routing.
- Current release-doc contract pins stale test-count regressions so future changes must update public verification evidence.

Verification evidence:

- `node scripts/release-audit.mjs`: Claude 52/52 and Codex 58/58 readiness checks passing, including the final `scripts/release-smoke.sh` gate contract, Codex floor-conditional language guidance, and public CLI executable/shebang packaging.
- `node scripts/release-fixture-smoke.mjs`: Claude marketplace dry-run, Claude operational/lite render output, Claude terminal `install-platform.sh --platform=claude` operational/builder/lite fixtures, Codex operational/lite/builder/floor/thrift/debug fresh fixtures, and Claude/Codex install→uninstall roundtrip fixtures passing.
- `node --test`: 1762/1762 passing.
- `./scripts/release-smoke.sh --fast --with-live-cli`: 431/431 passing with Claude Code and Codex CLI live probes.
- `node scripts/sync-lib.mjs --check`: 42 vendored files match source.

## Scope Decomposition

The design touches multiple subsystems, but they are coupled by shared policy contracts. Implement in this order so every task is testable and commit-sized:

1. Shared merge, discovery, and foundation helpers.
2. Shared task ledger and shell-policy helpers.
3. Claude `/agent-init` operational scaffold.
4. Codex `/codex-init` operational scaffold.
5. Gemini soft-rule scaffold.
6. `/agent-all` task-ledger, handoff, and persona gate updates.
7. Docs, changelog, and release verification.

## File Structure

Create:

- `plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs`: append-only sentinel replacement helper for root and folder guidance files.
- `plugins/harness-builder/skills/agent-init/lib/folder-guides.mjs`: detect major top-level folders for local guide generation.
- `plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs`: detect superpowers/context-mode installation state from installed plugin IDs.
- `plugins/harness-builder/skills/agent-init/templates/local-guides/CLAUDE.md.hbs`: Claude local folder guide template.
- `plugins/harness-builder/skills/agent-init/templates/task-ledger/CLAUDE.md.hbs`: task-ledger folder instructions.
- `plugins/harness-builder/skills/agent-init/templates/task-ledger/index.md.hbs`: task index scaffold.
- `plugins/harness-builder/skills/agent-init/templates/task-ledger/_template.md.hbs`: task document scaffold.
- `plugins/harness-builder/skills/agent-init/templates/task-ledger/_handoff-template.md.hbs`: handoff scaffold.
- `plugins/harness-builder/skills/agent-init/templates/task-ledger/agent-task-ledger-check.mjs`: generated target-project ledger validator.
- `plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs`: Claude generated policy hook.
- `plugins/harness-builder/skills/agent-init/templates/agents/orchestrator.md.hbs`: Claude orchestrator agent.
- `plugins/harness-builder/skills/agent-init/templates/agents/integration-dev.md.hbs`: Claude integration implementer.
- `plugins/harness-builder/skills/agent-init/templates/agents/verification-reviewer.md.hbs`: Claude verification reviewer.
- `plugins/harness-builder/skills/agent-init/templates/agents/qa-reviewer.md.hbs`: Claude QA reviewer.
- `plugins/harness-builder/skills/agent-init/templates/agents/design-reviewer.md.hbs`: Claude design reviewer.
- `plugins/harness-builder/skills/agent-init/templates/agents/security-reviewer.md.hbs`: Claude security reviewer.
- `plugins/harness-builder/skills/agent-init/templates/agents/data-reviewer.md.hbs`: Claude data reviewer.
- `plugins/harness-builder-codex/skills/codex-init/templates/local-guides/AGENTS.md.hbs`: Codex local folder guide template.
- `plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs`: Codex generated policy hook.
- `plugins/harness-builder-codex/skills/codex-init/templates/skills/orchestrator/SKILL.md.hbs`: Codex orchestrator skill.
- `plugins/harness-builder-codex/skills/codex-init/templates/skills/verification-reviewer/SKILL.md.hbs`: Codex verification reviewer skill.
- `plugins/harness-builder-codex/skills/codex-init/templates/skills/qa-reviewer/SKILL.md.hbs`: Codex QA reviewer skill.
- `plugins/harness-builder-codex/skills/codex-init/templates/skills/design-reviewer/SKILL.md.hbs`: Codex design reviewer skill.
- `plugins/harness-builder-codex/skills/codex-init/templates/skills/security-reviewer/SKILL.md.hbs`: Codex security reviewer skill.
- `plugins/harness-builder-codex/skills/codex-init/templates/skills/data-reviewer/SKILL.md.hbs`: Codex data reviewer skill.
- `plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs`: deterministic task ID allocation.
- `plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs`: task doc section and checkbox validation.
- `plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs`: shell command policy for dangerous commands and pathspec commits.
- `plugins/harness-floor/skills/agent-all/lib/handoff-writer.mjs`: concise handoff section renderer.
- `plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs`: changed-file to reviewer-role mapping.
- Tests under `tests/lib/` and `tests/agent-all/lib/` matching each helper.

Modify:

- `plugins/harness-builder/skills/agent-init/SKILL.md`
- `plugins/harness-builder/skills/agent-init/phases/*.md`
- `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs`
- `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs`
- `plugins/harness-builder/skills/agent-init/templates/agents/*.md.hbs`
- `plugins/harness-builder-codex/bin/init.mjs`
- `plugins/harness-builder-codex/skills/codex-init/SKILL.md`
- `plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs`
- `plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs`
- `plugins/harness-builder-gemini/bin/init.mjs`
- `plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs`
- `plugins/harness-floor/skills/agent-all/SKILL.md`
- `plugins/harness-floor/skills/agent-all/phases/*.md`
- `scripts/update.sh`
- `README.md`
- `README.ko.md`
- `CHANGELOG.md`
- `CHANGELOG.ko.md`

---

### Task 1: Sentinel Merge Helper

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs`
- Test: `tests/lib/sentinel-merge.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lib/sentinel-merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSentinelSection, SENTINEL } from "../../plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs";

test("renders full content when existing file is absent", () => {
  const result = mergeSentinelSection("", "generated body");
  assert.equal(result.action, "create");
  assert.equal(result.content, "generated body\n");
});

test("appends sentinel section to existing user file", () => {
  const result = mergeSentinelSection("# User Notes\n", "generated body");
  assert.equal(result.action, "append");
  assert.equal(result.content, `# User Notes\n\n${SENTINEL.start}\ngenerated body\n${SENTINEL.end}\n`);
});

test("replaces only the existing sentinel section", () => {
  const existing = `top\n\n${SENTINEL.start}\nold\n${SENTINEL.end}\n\nbottom\n`;
  const result = mergeSentinelSection(existing, "new");
  assert.equal(result.action, "replace");
  assert.equal(result.content, `top\n\n${SENTINEL.start}\nnew\n${SENTINEL.end}\n\nbottom\n`);
});

test("throws when only one sentinel marker exists", () => {
  assert.throws(() => mergeSentinelSection(`${SENTINEL.start}\nold\n`, "new"), /incomplete sentinel/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/sentinel-merge.test.mjs`

Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement helper**

```javascript
// plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs
export const SENTINEL = {
  start: "<!-- agent-skill:operational:start -->",
  end: "<!-- agent-skill:operational:end -->",
};

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function buildSection(generated) {
  return `${SENTINEL.start}\n${ensureTrailingNewline(generated)}${SENTINEL.end}\n`;
}

export function mergeSentinelSection(existingText, generatedText) {
  const generated = ensureTrailingNewline(generatedText.trimEnd());
  if (!existingText || existingText.length === 0) {
    return { action: "create", content: generated };
  }

  const start = existingText.indexOf(SENTINEL.start);
  const end = existingText.indexOf(SENTINEL.end);
  if ((start === -1) !== (end === -1)) {
    throw new Error("incomplete sentinel section");
  }

  const section = buildSection(generated.trimEnd());
  if (start === -1) {
    return {
      action: "append",
      content: `${ensureTrailingNewline(existingText).trimEnd()}\n\n${section}`,
    };
  }

  const endAfter = end + SENTINEL.end.length;
  const before = existingText.slice(0, start);
  const after = existingText.slice(endAfter);
  return {
    action: "replace",
    content: `${before}${section}${after.startsWith("\n") ? after : ensureTrailingNewline(after)}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/sentinel-merge.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/lib/sentinel-merge.test.mjs plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs
git commit -m "feat(init): add sentinel merge helper"
```

---

### Task 2: Folder Guide and Foundation Detection Helpers

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/lib/folder-guides.mjs`
- Create: `plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs`
- Test: `tests/lib/folder-guides.test.mjs`
- Test: `tests/lib/foundation-check.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/lib/folder-guides.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectGuideDirs } from "../../plugins/harness-builder/skills/agent-init/lib/folder-guides.mjs";

test("detects common project folders and package directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "folder-guides-"));
  try {
    mkdirSync(join(dir, "frontend"), { recursive: true });
    mkdirSync(join(dir, "backend"), { recursive: true });
    mkdirSync(join(dir, "packages/api"), { recursive: true });
    mkdirSync(join(dir, "node_modules/ignored"), { recursive: true });
    writeFileSync(join(dir, "packages/api/package.json"), "{}");
    const dirs = detectGuideDirs(dir).map((x) => x.path);
    assert.deepEqual(dirs, ["backend", "frontend", "packages/api"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

```javascript
// tests/lib/foundation-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanFoundationState } from "../../plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs";

test("marks harness as healthy when superpowers and context-mode are installed", () => {
  const result = scanFoundationState({
    installedPluginIds: ["superpowers@claude-plugins-official", "context-mode@context-mode"],
  });
  assert.equal(result.degraded, false);
  assert.deepEqual(result.missing, []);
});

test("reports missing foundations without aborting", () => {
  const result = scanFoundationState({ installedPluginIds: ["harness-builder@agent-skill"] });
  assert.equal(result.degraded, true);
  assert.deepEqual(result.missing, ["superpowers", "context-mode"]);
  assert.match(result.instructions.join("\n"), /plugin install superpowers/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/folder-guides.test.mjs tests/lib/foundation-check.test.mjs`

Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Implement helpers**

```javascript
// plugins/harness-builder/skills/agent-init/lib/folder-guides.mjs
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIRECT_NAMES = new Set(["app", "apps", "backend", "frontend", "server", "client", "src", "docs", "packages"]);
const SKIP_NAMES = new Set([".git", ".claude", ".codex", "node_modules", "dist", "build", "coverage"]);
const MARKERS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Dockerfile"];

function hasMarker(dir) {
  return MARKERS.some((name) => existsSync(join(dir, name)));
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function detectGuideDirs(projectDir) {
  const out = [];
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_NAMES.has(entry.name)) continue;
    const full = join(projectDir, entry.name);
    if (DIRECT_NAMES.has(entry.name) || hasMarker(full)) {
      out.push({ path: entry.name, reason: DIRECT_NAMES.has(entry.name) ? "known-folder" : "manifest" });
    }
    if (entry.name === "packages" || entry.name === "apps") {
      for (const child of readdirSync(full, { withFileTypes: true })) {
        if (!child.isDirectory() || SKIP_NAMES.has(child.name)) continue;
        const childFull = join(full, child.name);
        if (isDir(childFull) && hasMarker(childFull)) {
          out.push({ path: `${entry.name}/${child.name}`, reason: "workspace-package" });
        }
      }
    }
  }
  return [...new Map(out.map((x) => [x.path, x])).values()].sort((a, b) => a.path.localeCompare(b.path));
}
```

```javascript
// plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs
const FOUNDATIONS = [
  {
    key: "superpowers",
    match: /(^|[/@])superpowers(@|$)/,
    install: "/plugin install superpowers@claude-plugins-official",
  },
  {
    key: "context-mode",
    match: /(^|[/@])context-mode(@|$)/,
    install: "/plugin install context-mode@context-mode",
  },
];

export function scanFoundationState({ installedPluginIds = [] } = {}) {
  const missing = FOUNDATIONS
    .filter((foundation) => !installedPluginIds.some((id) => foundation.match.test(String(id))))
    .map((foundation) => foundation.key);
  const instructions = FOUNDATIONS
    .filter((foundation) => missing.includes(foundation.key))
    .map((foundation) => foundation.install);
  return {
    degraded: missing.length > 0,
    missing,
    instructions,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/folder-guides.test.mjs tests/lib/foundation-check.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/lib/folder-guides.test.mjs tests/lib/foundation-check.test.mjs plugins/harness-builder/skills/agent-init/lib/folder-guides.mjs plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs
git commit -m "feat(init): detect local guide folders and foundations"
```

---

### Task 3: Shared Task Ledger and Shell Policy Helpers

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs`
- Create: `plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs`
- Create: `plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs`
- Test: `tests/agent-all/lib/task-id-allocator.test.mjs`
- Test: `tests/agent-all/lib/task-ledger.test.mjs`
- Test: `tests/agent-all/lib/pathspec-policy.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/agent-all/lib/task-id-allocator.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateTaskId } from "../../../plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs";

test("allocates next integer from index and filenames", () => {
  const result = allocateTaskId({
    indexText: "- [ ] 7-old: docs/tasks/7-old.md\n- [ ] 12-new: docs/tasks/12-new.md\n",
    filenames: ["001-first.md", "09-nine.md"],
  });
  assert.equal(result, 13);
});

test("rejects explicit collision", () => {
  assert.throws(() => allocateTaskId({ indexText: "", filenames: ["3-x.md"], requestedId: 3 }), /collides/);
});
```

```javascript
// tests/agent-all/lib/task-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTaskDoc } from "../../../plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs";

const VALID = `# Task
## Goal
Ship it.
## Acceptance
- [x] in scope done
## Phases
- [x] build
## Decision Matrix
| Decision | Choice |
|---|---|
| A | B |
## Ambiguity Log
None.
## Progress Snapshot
Current phase: gate.
## Verification
- [x] node --test
## Follow-up
- [ ] outside hard gate
`;

test("valid task doc passes required section and checkbox gates", () => {
  assert.deepEqual(validateTaskDoc(VALID), { ok: true, errors: [] });
});

test("missing required section fails", () => {
  const result = validateTaskDoc(VALID.replace("## Verification", "## Proof"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing section: Verification/);
});

test("unchecked in-scope checkbox fails while Follow-up is ignored", () => {
  const result = validateTaskDoc(VALID.replace("- [x] build", "- [ ] build"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unchecked item/);
});
```

```javascript
// tests/agent-all/lib/pathspec-policy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeShellCommand } from "../../../plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs";

test("blocks destructive git commands", () => {
  assert.equal(analyzeShellCommand("git reset --hard").blocked, true);
  assert.equal(analyzeShellCommand("git checkout -- src/app.js").blocked, true);
  assert.equal(analyzeShellCommand("git push --force").blocked, true);
});

test("blocks git add -A and git commit -a", () => {
  assert.equal(analyzeShellCommand("git add -A").blocked, true);
  assert.equal(analyzeShellCommand("git commit -am msg").blocked, true);
});

test("requires pathspec for git commit in operational mode", () => {
  assert.equal(analyzeShellCommand("git commit -m msg").blocked, true);
  assert.equal(analyzeShellCommand("git commit -m msg -- docs/a.md").blocked, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/agent-all/lib/task-id-allocator.test.mjs tests/agent-all/lib/task-ledger.test.mjs tests/agent-all/lib/pathspec-policy.test.mjs`

Expected: FAIL with missing modules

- [ ] **Step 3: Implement helpers**

```javascript
// plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs
function idsFromIndex(indexText) {
  return [...String(indexText || "").matchAll(/docs\/tasks\/0*([0-9]+)-[^)\s]+\.md/g)].map((m) => Number(m[1]));
}

function idsFromFiles(filenames) {
  return filenames
    .map((name) => /^0*([0-9]+)-.+\.md$/.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

export function allocateTaskId({ indexText = "", filenames = [], requestedId = null } = {}) {
  const used = new Set([...idsFromIndex(indexText), ...idsFromFiles(filenames)]);
  if (requestedId != null) {
    const n = Number(requestedId);
    if (!Number.isInteger(n) || n < 1) throw new Error("--task-id must be a positive integer");
    if (used.has(n)) throw new Error(`task id ${n} collides with an existing task`);
    return n;
  }
  return used.size === 0 ? 1 : Math.max(...used) + 1;
}
```

```javascript
// plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs
export const REQUIRED_SECTIONS = [
  "Goal",
  "Acceptance",
  "Phases",
  "Decision Matrix",
  "Ambiguity Log",
  "Progress Snapshot",
  "Verification",
];

const EXCLUDED_CHECKBOX_SECTIONS = new Set(["Backlog", "Follow-up"]);

function sectionRanges(text) {
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const next = headings[index + 1]?.index ?? text.length;
    return { title, body: text.slice(heading.index, next) };
  });
}

export function validateTaskDoc(text) {
  const errors = [];
  const sections = sectionRanges(text);
  const names = new Set(sections.map((section) => section.title));
  for (const required of REQUIRED_SECTIONS) {
    if (!names.has(required)) errors.push(`missing section: ${required}`);
  }
  for (const section of sections) {
    if (EXCLUDED_CHECKBOX_SECTIONS.has(section.title)) continue;
    const unchecked = section.body.match(/^- \[ \]\s+.+$/gm) || [];
    for (const item of unchecked) errors.push(`unchecked item in ${section.title}: ${item.replace(/^- \[ \]\s+/, "")}`);
  }
  return { ok: errors.length === 0, errors };
}
```

```javascript
// plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs
const BLOCK_RULES = [
  { name: "git add -A", pattern: /\bgit\s+add\s+(-A|--all)\b/ },
  { name: "git commit -a", pattern: /\bgit\s+commit\b(?=[^\n]*\s-a[m\s])/ },
  { name: "git commit --amend", pattern: /\bgit\s+commit\b(?=[^\n]*--amend\b)/ },
  { name: "git push --force", pattern: /\bgit\s+push\b(?=[^\n]*--force(?:-with-lease)?\b)/ },
  { name: "git reset --hard", pattern: /\bgit\s+reset\s+--hard\b/ },
  { name: "git checkout --", pattern: /\bgit\s+checkout\s+--\s+/ },
  { name: "docker volume rm", pattern: /\bdocker\s+volume\s+rm\b/ },
];

function commitHasPathspec(command) {
  const sep = command.indexOf(" -- ");
  if (sep === -1) return false;
  return command.slice(sep + 4).trim().length > 0;
}

export function analyzeShellCommand(command) {
  const text = String(command || "");
  for (const rule of BLOCK_RULES) {
    if (rule.pattern.test(text)) {
      return { blocked: true, reason: rule.name };
    }
  }
  if (/\bgit\s+commit\b/.test(text) && !commitHasPathspec(text)) {
    return { blocked: true, reason: "git commit requires explicit pathspec after --" };
  }
  return { blocked: false, reason: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/agent-all/lib/task-id-allocator.test.mjs tests/agent-all/lib/task-ledger.test.mjs tests/agent-all/lib/pathspec-policy.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/lib/task-id-allocator.test.mjs tests/agent-all/lib/task-ledger.test.mjs tests/agent-all/lib/pathspec-policy.test.mjs plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs
git commit -m "feat(agent-all): add task ledger and shell policy helpers"
```

---

### Task 4: Claude Operational Init Templates

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/templates/local-guides/CLAUDE.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/task-ledger/CLAUDE.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/task-ledger/index.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/task-ledger/_template.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/task-ledger/_handoff-template.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/task-ledger/agent-task-ledger-check.mjs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/orchestrator.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/integration-dev.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/verification-reviewer.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/qa-reviewer.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/design-reviewer.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/security-reviewer.md.hbs`
- Create: `plugins/harness-builder/skills/agent-init/templates/agents/data-reviewer.md.hbs`
- Modify: `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs`
- Modify: `tests/lib/render.test.mjs`

- [ ] **Step 1: Add snapshot fixtures for operational and lite profiles**

```javascript
// In tests/lib/render.test.mjs, extend FIXTURES with these two entries.
{
  tag: "operational-heavy",
  ctx: {
    purpose: "Operational app",
    stack: "typescript",
    deploy_targets: "vercel",
    operationalProfile: true,
    liteProfile: false,
    floorTheme: true,
    degradedFoundations: false,
    agents: [
      { name: "planner", when: "task docs and ambiguity control" },
      { name: "orchestrator", when: "wave ownership and HOT file detection" },
      { name: "verification-reviewer", when: "evidence and diff scope audit" },
    ],
    constraints: "",
  },
},
{
  tag: "lite-profile",
  ctx: {
    purpose: "Lite app",
    stack: "javascript",
    deploy_targets: "",
    operationalProfile: false,
    liteProfile: true,
    floorTheme: false,
    degradedFoundations: true,
    agents: [{ name: "planner", when: "planning" }, { name: "dev", when: "implementation" }, { name: "reviewer", when: "review" }],
    constraints: "",
  },
},
```

- [ ] **Step 2: Run snapshot test to verify it fails or writes new snapshots**

Run: `UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs`

Expected: PASS and new snapshot files under `tests/lib/__snapshots__/`

- [ ] **Step 3: Replace `CLAUDE.md.hbs` with operational content**

```markdown
# {{purpose}}

> Project memory for Claude Code. Maintained by `/agent-init`.

## Stack

{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

These apply to the main agent and to every role in `.claude/agents/`:

1. **Brainstorm first.** Before any deliverable, invoke `superpowers:brainstorming` unless the user explicitly asks for direct execution.
2. **Plan before implementation.** Multi-step work uses `superpowers:writing-plans` and stores plans in `docs/superpowers/plans/`.
3. **Parallel through orchestration.** Use `superpowers:dispatching-parallel-agents` or `superpowers:subagent-driven-development` when tasks do not share files.
4. **Verify before completion.** Use `superpowers:verification-before-completion` before claiming success.
5. **Use context-mode for bulk context.** Store or index large logs, broad searches, and bulky browser snapshots outside the main conversation.
6. **Protect shared worktrees.** Never use `git add -A`, `git commit -a`, `git reset --hard`, `git checkout --`, or force push unless the user explicitly approves the exact command.
7. **Commit with pathspecs.** Use `git commit -m "message" -- path/one path/two`.

{{#if operationalProfile}}
## Operational Harness

- Default mode is heavy. Use `/agent-init --lite` only for small repositories that do not need task ledger or hooks.
- Every `/agent-all` run must resolve to a task document under `docs/tasks/`.
- Keep `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, and `Verification` current.
- Phase handoffs belong in the task doc or `_handoff-template.md` output, not in raw chat logs.
- Existing local instructions outside the generated sentinel section take precedence.

## Task Ledger

- `docs/tasks/index.md` tracks active tasks.
- `docs/tasks/_template.md` is the required shape for new tasks.
- `scripts/agent-task-ledger-check.mjs` gates completion and PR creation.
- Checkboxes under `Backlog` and `Follow-up` are not completion blockers.

## Reviewer Gates

Use reviewer personas based on changed files:

- UI/CSS/frontend components: `design-reviewer`, `qa-reviewer`
- auth, permissions, API views, serializers, destructive actions: `security-reviewer`
- models, migrations, seeds, fixtures, backfills: `data-reviewer`
- tests, CI, build config: `verification-reviewer`
- cross-stack frontend and backend changes: `integration-dev`, `verification-reviewer`
{{/if}}

{{#if liteProfile}}
## Lite Harness

Lite mode keeps only root memory and the minimal role roster. It does not install task ledger files, policy hooks, or global config patches.
{{/if}}

## Agent Roster

| Role | When to use | File |
|------|-------------|------|
{{#each agents}}| {{name}} | {{when}} | `.claude/agents/{{name}}.md` |
{{/each}}

## Hooks

- `PreToolUse` (Bash) → `context-mode-router.mjs` and operational policy checks.
- `Stop` → concise handoff/session summary.
- `SessionStart` → cache and foundation checks.

## Work Folders

- `docs/superpowers/specs/` — brainstorming output.
- `docs/superpowers/plans/` — implementation plans.
- `docs/tasks/` — task ledger.
- `docs/decisions/` — concise decision records.

{{#if degradedFoundations}}
## Foundation Status

This harness is in degraded mode because superpowers or context-mode is missing. Install or update the recommended foundations before long-running work.
{{/if}}

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}

{{#if floorTheme}}
## Floor Theme

Cost-unrestricted parallel pattern enabled. Commands:

- `/visual-qa` — visual regression with LLM analysis.
- `/agent-all "task description"` — task-ledger-driven multi-wave pipeline.
- `/agent-all <task-path> --loop` — iterate until the break-condition succeeds.
{{/if}}
```

- [ ] **Step 4: Add local guide and task ledger templates**

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/local-guides/CLAUDE.md.hbs -->
# {{guidePath}} Guide

<!-- agent-skill:operational:start -->
## Local Scope

- Own files under `{{guidePath}}/`.
- Prefer commands scoped to this folder when supported.
- Keep generated output, caches, and build artifacts out of commits.
- Follow root `CLAUDE.md` for task ledger, handoff, pathspec commits, and reviewer gates.

## Validation

- Run the narrowest relevant test first.
- Escalate to the root verification command before completion.
<!-- agent-skill:operational:end -->
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/task-ledger/CLAUDE.md.hbs -->
# Task Ledger Guide

<!-- agent-skill:operational:start -->
Every active `/agent-all` run must have one task document.

Required sections: Goal, Acceptance, Phases, Decision Matrix, Ambiguity Log, Progress Snapshot, Verification.

Completion requires all in-scope checkboxes outside Backlog and Follow-up to be checked.
<!-- agent-skill:operational:end -->
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/task-ledger/index.md.hbs -->
# Task Index

<!-- agent-skill:operational:start -->
## Active

## Completed

## Backlog
<!-- agent-skill:operational:end -->
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/task-ledger/_template.md.hbs -->
# {{title}}

## Goal

## Acceptance

## Scope

## Out of Scope

## File Ownership

## Phases

## Decision Matrix

| Decision | Options | Choice | Rationale |
|---|---|---|---|

## Ambiguity Log

## Progress Snapshot

Current phase:
Completed:
Remaining:
Blockers:
Latest validation:
Next action:

## Verification

## Risk / Rollback

## Handoff

## Follow-up
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/task-ledger/_handoff-template.md.hbs -->
# Handoff: {{title}}

## Active Task

## Completed

## Remaining

## Blockers

## Latest Validation Evidence

## Current Git State

## Next Action
```

```javascript
// plugins/harness-builder/skills/agent-init/templates/task-ledger/agent-task-ledger-check.mjs
#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const REQUIRED = ["Goal", "Acceptance", "Phases", "Decision Matrix", "Ambiguity Log", "Progress Snapshot", "Verification"];
const EXCLUDED = new Set(["Backlog", "Follow-up"]);

function sections(text) {
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const next = headings[index + 1]?.index ?? text.length;
    return { title: heading[1].trim(), body: text.slice(heading.index, next) };
  });
}

function validateTaskDoc(text) {
  const errors = [];
  const parsed = sections(text);
  const names = new Set(parsed.map((section) => section.title));
  for (const required of REQUIRED) {
    if (!names.has(required)) errors.push(`missing section: ${required}`);
  }
  for (const section of parsed) {
    if (EXCLUDED.has(section.title)) continue;
    const unchecked = section.body.match(/^- \[ \]\s+.+$/gm) || [];
    for (const item of unchecked) errors.push(`unchecked item in ${section.title}: ${item.replace(/^- \[ \]\s+/, "")}`);
  }
  return errors;
}

const taskPath = process.argv[2];
const baseErrors = [];
if (!existsSync("docs/tasks/index.md")) baseErrors.push("missing docs/tasks/index.md");
if (!existsSync("docs/tasks/_template.md")) baseErrors.push("missing docs/tasks/_template.md");
if (!taskPath) baseErrors.push("usage: node scripts/agent-task-ledger-check.mjs docs/tasks/NN-slug.md");
if (taskPath && !existsSync(taskPath)) baseErrors.push(`task file not found: ${taskPath}`);

const taskErrors = taskPath && existsSync(taskPath) ? validateTaskDoc(readFileSync(taskPath, "utf-8")) : [];
const errors = [...baseErrors, ...taskErrors];
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(`task ledger ok: ${taskPath}`);
```

- [ ] **Step 4b: Add Claude operational role templates**

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/orchestrator.md.hbs -->
---
name: orchestrator
description: Own wave sequencing, HOT file detection, pathspec commit verification, retry policy, and handoff health.
---

# Orchestrator

Use this agent when work spans multiple files, roles, waves, or sessions.

Responsibilities:

- Split work into waves with clear file ownership.
- Detect HOT/shared files and serialize conflicting work.
- Enforce pathspec commit discipline.
- Keep `docs/tasks/*` Progress Snapshot current.
- Escalate the same repeated finding after 3 failed cycles.

Return a concise status with completed work, remaining work, blockers, validation evidence, and next action.
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/integration-dev.md.hbs -->
---
name: integration-dev
description: Implement cross-stack wiring, API contracts, fixtures, seeds, and frontend-backend integration.
---

# Integration Developer

Use this agent when a change touches more than one subsystem.

Responsibilities:

- Align request/response contracts.
- Update fixtures, seeds, and mocks that connect layers.
- Run narrow integration checks before broad verification.
- Document contract decisions in the task Decision Matrix.
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/verification-reviewer.md.hbs -->
---
name: verification-reviewer
description: Audit tests, typecheck, lint, diff scope, and verification evidence before completion.
---

# Verification Reviewer

Check implementation evidence before work is called complete.

Return one line:

- `VERIFICATION_AUDIT: passed`
- `VERIFICATION_AUDIT: failed` with concrete command or diff evidence
- `VERIFICATION_AUDIT: skipped` for documentation-only work
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/qa-reviewer.md.hbs -->
---
name: qa-reviewer
description: Review user flows, persona edge cases, confusing states, and missing scenarios.
---

# QA Reviewer

Review from the user side, not the implementation side.

Check:

- Happy path and failure path coverage.
- Persona-specific confusion.
- Missing empty, loading, permission, and error states.
- Whether task Acceptance matches observable behavior.

Return `QA_AUDIT: passed`, `QA_AUDIT: failed`, or `QA_AUDIT: skipped`.
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/design-reviewer.md.hbs -->
---
name: design-reviewer
description: Review UI hierarchy, spacing, responsive fit, design-token use, and component consistency.
---

# Design Reviewer

Use this reviewer when UI, CSS, design tokens, layout, or visual states changed.

Report issues with file paths, viewport or state, severity, and expected visual correction.
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/security-reviewer.md.hbs -->
---
name: security-reviewer
description: Review authz, secrets, data exposure, unsafe defaults, and destructive action risk.
---

# Security Reviewer

Use this reviewer for auth, permissions, middleware, serializers, API views, tokens, secrets, or destructive commands.

Block completion for privilege escalation, leaked secret material, missing ownership checks, or unsafe destructive defaults.
```

```markdown
<!-- plugins/harness-builder/skills/agent-init/templates/agents/data-reviewer.md.hbs -->
---
name: data-reviewer
description: Review migrations, seed data, fixtures, backfills, mock sync, and rollback paths.
---

# Data Reviewer

Use this reviewer when models, migrations, fixtures, seeds, backfills, or schema files changed.

Check migration safety, deterministic seed behavior, fixture compatibility, and rollback notes.
```

- [ ] **Step 5: Run snapshot test and inspect generated snapshots**

Run: `UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/lib/render.test.mjs tests/lib/__snapshots__ plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs plugins/harness-builder/skills/agent-init/templates/local-guides/CLAUDE.md.hbs plugins/harness-builder/skills/agent-init/templates/task-ledger
git commit -m "feat(init): render operational Claude scaffold"
```

---

### Task 5: Claude Skill Phase Wiring

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/SKILL.md`
- Modify: `plugins/harness-builder/skills/agent-init/phases/1-discover.md`
- Modify: `plugins/harness-builder/skills/agent-init/phases/2-claude-md.md`
- Modify: `plugins/harness-builder/skills/agent-init/phases/3-agents.md`
- Modify: `plugins/harness-builder/skills/agent-init/phases/4-hooks.md`
- Modify: `plugins/harness-builder/skills/agent-init/phases/5-wire.md`
- Create: `plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs`
- Test: `tests/agent-all/lib/pathspec-policy.test.mjs`

- [ ] **Step 1: Extend policy test for the generated hook contract**

```javascript
// Add to tests/agent-all/lib/pathspec-policy.test.mjs
test("allows scoped add and pathspec commit", () => {
  assert.equal(analyzeShellCommand("git add docs/tasks/1-x.md plugins/x.mjs").blocked, false);
  assert.equal(analyzeShellCommand("git commit -m msg -- docs/tasks/1-x.md plugins/x.mjs").blocked, false);
});
```

- [ ] **Step 2: Run policy test**

Run: `node --test tests/agent-all/lib/pathspec-policy.test.mjs`

Expected: PASS after Task 3

- [ ] **Step 3: Add generated Claude policy hook**

```javascript
// plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs
#!/usr/bin/env node
import { analyzeShellCommand } from "../../../../harness-floor/skills/agent-all/lib/pathspec-policy.mjs";

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = input.trim() ? JSON.parse(input) : {};
  } catch {
    payload = {};
  }
  const command = payload.tool_input?.command || payload.command || "";
  const result = analyzeShellCommand(command);
  if (result.blocked) {
    console.error(`agent policy blocked command: ${result.reason}`);
    process.exit(2);
  }
  process.exit(0);
});
```

- [ ] **Step 4: Update `SKILL.md` flags and pipeline rules**

Add these flag definitions:

```markdown
- `--lite` — canonical lightweight mode. Alias for `--theme=lite`; skips task ledger, policy hooks, and global config patch prompts.
- `--update-foundations` — after printing the foundation plan, run the approved update path in strict mode. Does not patch global CLI config.
- `--no-update-foundations` — skip the default terminal Claude/Codex operational foundation auto-update.
- `--platform=claude,codex,gemini` — select platform artifacts to wire. Defaults to prompting in interactive use and Claude-only in non-interactive use.
```

Change the theme text:

```markdown
- `--theme=lite` — compatibility alias for `--lite`. Print a deprecation note and behave exactly like `--lite`.
```

Add this rule:

```markdown
6. **Operational profile is default.** Unless `--lite` or `--theme=lite` is passed, render task ledger, local guides, policy hooks, and foundation checks.
```

- [ ] **Step 5: Update phase docs with exact behavior**

In `phases/1-discover.md`, add:

```markdown
- Resolve profile: `lite = flags.lite || flags.theme === "lite"`. Default profile is operational.
- Call `scanFoundationState` using installed plugin IDs from plugin scan. Continue when degraded.
- Call `detectGuideDirs(projectRoot)` and store `local_guides` in state discovery.
```

In `phases/2-claude-md.md`, add:

```markdown
- Render root `CLAUDE.md` with `operationalProfile: !lite`, `liteProfile: lite`, and `degradedFoundations`.
- Use `mergeSentinelSection` for existing `CLAUDE.md`; never overwrite user-owned content outside sentinel markers.
- When operational, render `templates/local-guides/CLAUDE.md.hbs` for every `local_guides[]` entry.
```

In `phases/5-wire.md`, add:

```markdown
- Operational mode writes `docs/tasks/CLAUDE.md`, `docs/tasks/index.md`, `docs/tasks/_template.md`, `docs/tasks/_handoff-template.md`, and `scripts/agent-task-ledger-check.mjs`.
- Lite mode skips task ledger and policy hook generation.
- `--dry-run` prints planned root files, local guide files, task ledger files, hook files, and the approved foundation update plan without writing.
- Terminal Claude/Codex operational bootstrap auto-runs the approved foundation update path when possible, continues with a degraded foundation warning when `claude` is unavailable or the approved update fails, and accepts `--no-update-foundations` to opt out.
- `--update-foundations` may run `scripts/update.sh` in strict mode; global CLI config patching still requires a separate explicit approval.
```

- [ ] **Step 6: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/SKILL.md plugins/harness-builder/skills/agent-init/phases plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs tests/agent-all/lib/pathspec-policy.test.mjs
git commit -m "feat(init): document operational Claude init flow"
```

---

### Task 6: Codex Operational Init

**Files:**
- Modify: `plugins/harness-builder-codex/bin/init.mjs`
- Modify: `plugins/harness-builder-codex/skills/codex-init/SKILL.md`
- Modify: `plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs`
- Modify: `plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/local-guides/AGENTS.md.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/skills/orchestrator/SKILL.md.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/skills/verification-reviewer/SKILL.md.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/skills/qa-reviewer/SKILL.md.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/skills/design-reviewer/SKILL.md.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/skills/security-reviewer/SKILL.md.hbs`
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/skills/data-reviewer/SKILL.md.hbs`
- Test: `tests/lib/harness-builder-cli-init.test.mjs`

- [ ] **Step 1: Extend Codex CLI integration expectations**

In `tests/lib/harness-builder-cli-init.test.mjs`, extend `PLUGINS.codex.files`:

```javascript
".codex/skills/orchestrator/SKILL.md",
".codex/skills/verification-reviewer/SKILL.md",
".codex/skills/qa-reviewer/SKILL.md",
".codex/skills/design-reviewer/SKILL.md",
".codex/skills/security-reviewer/SKILL.md",
".codex/skills/data-reviewer/SKILL.md",
".codex/hooks/agent-policy-hook.mjs",
"docs/tasks/index.md",
"docs/tasks/_template.md",
```

Add this test in the Codex loop body:

```javascript
test("harness-builder-codex: --lite skips ledger and hooks", () => {
  const target = mkTarget("codex-lite");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--lite"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(resolve(target, "AGENTS.md")));
    assert.equal(existsSync(resolve(target, "docs/tasks/index.md")), false);
    assert.equal(existsSync(resolve(target, ".codex/hooks/agent-policy-hook.mjs")), false);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/harness-builder-cli-init.test.mjs`

Expected: FAIL because Codex init does not write operational files or parse `--lite`

- [ ] **Step 3: Update Codex arg parsing**

In `plugins/harness-builder-codex/bin/init.mjs`, change `parseArgs` to include:

```javascript
const args = { target: null, ctxPath: null, force: false, lite: false, dryRun: false };
```

Add branches:

```javascript
else if (argv[i] === "--lite" || argv[i] === "--theme=lite") args.lite = true;
else if (argv[i] === "--dry-run") args.dryRun = true;
```

Update usage:

```javascript
console.error("Usage: init.mjs <target-project-dir> [--ctx <ctx.json>] [--force] [--lite] [--dry-run]");
```

In `loadCtx`, add:

```javascript
const operationalProfile = !ctx.lite;
const reviewerAgents = operationalProfile ? [
  { name: "orchestrator", when: "wave ownership and shared-tree safety" },
  { name: "verification-reviewer", when: "tests, typecheck, lint, diff scope" },
  { name: "qa-reviewer", when: "user-flow and persona validation" },
  { name: "design-reviewer", when: "UI hierarchy and design tokens" },
  { name: "security-reviewer", when: "authz, secrets, destructive actions" },
  { name: "data-reviewer", when: "migrations, seeds, fixtures, backfills" },
] : [];
```

Return:

```javascript
operationalProfile,
liteProfile: ctx.lite,
agents: [
  { name: "planner", when: "all planning" },
  { name: "dev", when: "implementation" },
  { name: "reviewer", when: "final review" },
  ...reviewerAgents,
],
```

When writing files, skip paths that start with `hooks/`, `local-guides/`, or `skills/*reviewer` only if `args.lite` is true. Keep `planner`, `dev`, and `reviewer`.

For `args.dryRun`, print `dry-run: would write <path>` and do not call `writeFileSync`.

- [ ] **Step 4: Update Codex templates**

Replace `AGENTS.md.hbs` with a Codex equivalent of the Claude operational rules:

```markdown
# {{purpose}}

> Project memory for Codex CLI. Scaffolded by `/codex-init`.

## Stack

{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

1. Plan before edits.
2. Use `apply_patch` for file modifications.
3. Use context-mode for large logs, broad searches, and bulky screenshots when available.
4. Use pathspec commits: `git commit -m "message" -- path/one path/two`.
5. Do not run destructive git, docker, or force-push commands without explicit user approval.

{{#if operationalProfile}}
## Operational Harness

- Every `/agent-all` run resolves to `docs/tasks/NN-slug.md`.
- Keep Decision Matrix, Ambiguity Log, Progress Snapshot, and Verification current.
- Root `AGENTS.md` is the index. Folder-level `AGENTS.md` files provide local scope.
- Reviewer personas are selected by changed-file classifier rules.
{{/if}}

{{#if liteProfile}}
## Lite Harness

Lite mode skips task ledger and hard policy hook artifacts.
{{/if}}

## Roles

| Role | When to use | File |
|------|-------------|------|
{{#each agents}}| {{name}} | {{when}} | `.codex/skills/{{name}}/SKILL.md` |
{{/each}}

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}
```

Use the same local guide text as Claude but with `AGENTS.md` and `.codex/skills/`.

- [ ] **Step 5: Add Codex role templates**

Each reviewer skill file must use this structure with the role-specific focus:

```markdown
---
name: verification-reviewer
description: Audit tests, typecheck, lint, diff scope, and verification evidence before completion.
---

# Verification Reviewer

Check:

- The implementation matches the task doc and plan.
- Required tests, typecheck, lint, or project-specific verification ran.
- The diff contains only intended files.
- Commits use explicit pathspecs and do not sweep unrelated work.

Return:

- `VERIFICATION_AUDIT: passed` when evidence is sufficient.
- `VERIFICATION_AUDIT: failed` with concrete file/command evidence when not sufficient.
- `VERIFICATION_AUDIT: skipped` only when the task is documentation-only or explicitly out of scope.
```

Create the other reviewer files with the same frontmatter shape and these check lists:

- `qa-reviewer`: user flow, missing scenario, persona confusion, accessibility-visible behavior.
- `design-reviewer`: visual hierarchy, spacing, typography, component conventions, responsive fit.
- `security-reviewer`: authz, secrets, data exposure, destructive command risk, unsafe defaults.
- `data-reviewer`: migrations, seeds, fixtures, backfills, mock sync, rollback.
- `orchestrator`: task ownership, HOT file detection, wave sequencing, repeated failure escalation after 3 attempts.

- [ ] **Step 6: Run Codex init tests**

Run: `node --test tests/lib/harness-builder-cli-init.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/lib/harness-builder-cli-init.test.mjs plugins/harness-builder-codex
git commit -m "feat(codex): operational init scaffold"
```

---

### Task 7: Gemini Soft Operational Rules

**Files:**
- Modify: `plugins/harness-builder-gemini/bin/init.mjs`
- Modify: `plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs`
- Test: `tests/lib/harness-builder-cli-init.test.mjs`

- [ ] **Step 1: Extend Gemini expectation**

In `tests/lib/harness-builder-cli-init.test.mjs`, add assertions after reading `GEMINI.md`:

```javascript
if (name === "gemini") {
  assert.match(body, /soft enforcement/i);
  assert.match(body, /docs\/tasks/);
  assert.match(body, /pathspec/i);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/harness-builder-cli-init.test.mjs`

Expected: FAIL because `GEMINI.md` lacks operational soft rules

- [ ] **Step 3: Update `GEMINI.md.hbs`**

Add this section:

```markdown
## Operational Soft Rules

Gemini does not get hard hook blocking in this release. Follow these rules as prompt-level policy:

- Use task docs under `docs/tasks/` for `/agent-all` work.
- Keep Decision Matrix, Ambiguity Log, Progress Snapshot, and Verification current.
- Use pathspec commits: `git commit -m "message" -- path/one path/two`.
- Avoid `git add -A`, `git commit -a`, `git commit --amend`, force push, `git reset --hard`, and `git checkout --` unless the user explicitly approves the exact command.
- Use superpowers-style planning and verification where available.
- Route large logs and broad searches through context-mode or file-backed artifacts where available.
```

- [ ] **Step 4: Run test**

Run: `node --test tests/lib/harness-builder-cli-init.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/lib/harness-builder-cli-init.test.mjs plugins/harness-builder-gemini/bin/init.mjs plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs
git commit -m "feat(gemini): add operational soft rules"
```

---

### Task 8: Agent-All Task Ledger and Handoff Runtime

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/handoff-writer.mjs`
- Modify: `plugins/harness-floor/skills/agent-all/phases/0-preflight.md`
- Modify: `plugins/harness-floor/skills/agent-all/phases/1-intent.md`
- Modify: `plugins/harness-floor/skills/agent-all/phases/5-pr.md`
- Modify: `plugins/harness-floor/skills/agent-all/phases/6-loop.md`
- Test: `tests/agent-all/lib/handoff-writer.test.mjs`

- [ ] **Step 1: Write failing handoff test**

```javascript
// tests/agent-all/lib/handoff-writer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHandoff } from "../../../plugins/harness-floor/skills/agent-all/lib/handoff-writer.mjs";

test("renders concise handoff without raw logs", () => {
  const out = renderHandoff({
    title: "Task 3",
    completed: ["Phase 1 task doc", "Phase 2 plan"],
    remaining: ["Phase 3 implementation"],
    blockers: ["None"],
    validation: "node --test tests/agent-all/lib/task-ledger.test.mjs PASS",
    gitState: "main ahead 1",
    nextAction: "Run Phase 3",
  });
  assert.match(out, /# Handoff: Task 3/);
  assert.match(out, /Run Phase 3/);
  assert.equal(out.includes("\x60\x60\x60"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/lib/handoff-writer.test.mjs`

Expected: FAIL with missing module

- [ ] **Step 3: Implement handoff writer**

```javascript
// plugins/harness-floor/skills/agent-all/lib/handoff-writer.mjs
function list(items) {
  const values = Array.isArray(items) && items.length > 0 ? items : ["None"];
  return values.map((item) => `- ${String(item).replace(/\r?\n/g, " ").trim()}`).join("\n");
}

export function renderHandoff({
  title = "Task",
  completed = [],
  remaining = [],
  blockers = [],
  validation = "Not run",
  gitState = "Unknown",
  nextAction = "Resume from the next incomplete phase",
} = {}) {
  return [
    `# Handoff: ${title}`,
    "",
    "## Completed",
    list(completed),
    "",
    "## Remaining",
    list(remaining),
    "",
    "## Blockers",
    list(blockers),
    "",
    "## Latest Validation Evidence",
    `- ${validation}`,
    "",
    "## Current Git State",
    `- ${gitState}`,
    "",
    "## Next Action",
    `- ${nextAction}`,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Update phase docs**

In `phases/0-preflight.md`, add:

```markdown
- Validate `docs/tasks/index.md` and `docs/tasks/_template.md` exist unless the command is creating the first task in Phase 1.
- Accept `--task-id=<N>` and store it in state for Phase 1.
```

In `phases/1-intent.md`, replace the ad hoc task creation branch with:

```markdown
- Use `allocateTaskId({ indexText, filenames, requestedId })`.
- Render the full task template with required sections.
- Add the task to `docs/tasks/index.md` under Active.
- Free-form prompts become `docs/tasks/NN-slug.md`; existing task paths are validated with `validateTaskDoc`.
```

In `phases/5-pr.md`, add before PR creation:

```markdown
- Run task ledger validation for `task.path`.
- Abort PR creation when required sections are missing or in-scope checkboxes remain unchecked.
```

In `phases/6-loop.md`, add:

```markdown
- On exhausted, blocked, or interrupted runs, call `renderHandoff` and update the task doc Handoff section or write a sibling handoff file.
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/agent-all/lib/handoff-writer.test.mjs tests/agent-all/lib/task-id-allocator.test.mjs tests/agent-all/lib/task-ledger.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/agent-all/lib/handoff-writer.test.mjs plugins/harness-floor/skills/agent-all/lib/handoff-writer.mjs plugins/harness-floor/skills/agent-all/phases/0-preflight.md plugins/harness-floor/skills/agent-all/phases/1-intent.md plugins/harness-floor/skills/agent-all/phases/5-pr.md plugins/harness-floor/skills/agent-all/phases/6-loop.md
git commit -m "feat(agent-all): require task ledger and handoff updates"
```

---

### Task 9: Changed-File Classifier and Persona Gates

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs`
- Modify: `plugins/harness-floor/skills/agent-all/phases/4-gate.md`
- Test: `tests/agent-all/lib/changed-file-classifier.test.mjs`

- [ ] **Step 1: Write failing classifier test**

```javascript
// tests/agent-all/lib/changed-file-classifier.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChangedFiles } from "../../../plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs";

test("adds design and QA reviewers for frontend UI files", () => {
  const result = classifyChangedFiles(["frontend/src/Button.tsx", "frontend/src/Button.css"]);
  assert.deepEqual(result.reviewers.sort(), ["design-reviewer", "qa-reviewer", "reviewer", "verification-reviewer"].sort());
});

test("adds security and data reviewers for migrations and models", () => {
  const result = classifyChangedFiles(["backend/users/models.py", "backend/users/migrations/0002_add.py"]);
  assert.ok(result.reviewers.includes("security-reviewer"));
  assert.ok(result.reviewers.includes("data-reviewer"));
});

test("adds integration reviewer when frontend and backend are both touched", () => {
  const result = classifyChangedFiles(["frontend/src/App.tsx", "backend/api/views.py"]);
  assert.ok(result.reviewers.includes("integration-dev"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/lib/changed-file-classifier.test.mjs`

Expected: FAIL with missing module

- [ ] **Step 3: Implement classifier**

```javascript
// plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs
function any(files, regex) {
  return files.some((file) => regex.test(file));
}

export function classifyChangedFiles(files = []) {
  const reviewers = new Set(["reviewer", "verification-reviewer"]);
  const frontend = any(files, /(^|\/)(frontend|client|web|app|pages|components|src)\/.*\.(tsx|jsx|css|scss|vue|svelte)$/);
  const backend = any(files, /(^|\/)(backend|server|api)\//) || any(files, /(views|serializers|controllers|routes)\.(py|ts|js|go|rs)$/);
  if (frontend) {
    reviewers.add("design-reviewer");
    reviewers.add("qa-reviewer");
  }
  if (any(files, /(auth|permission|middleware|serializer|serializers|views|api|secret|token)/i)) {
    reviewers.add("security-reviewer");
  }
  if (any(files, /(migrations?\/|models\.py$|schema\.prisma$|seed|fixture|backfill)/i)) {
    reviewers.add("data-reviewer");
  }
  if (frontend && backend) {
    reviewers.add("integration-dev");
  }
  return { reviewers: [...reviewers].sort() };
}
```

- [ ] **Step 4: Update Phase 4 gate docs**

In `phases/4-gate.md`, replace the fixed QA-only logic with:

```markdown
3b. Changed-file reviewer classifier:

- Collect changed files for the wave from `git diff --name-only <wave.startCommit>..<wave.endCommit>`.
- Call `classifyChangedFiles(files)`.
- Dispatch one reviewer subagent per returned reviewer.
- Always include `reviewer` and `verification-reviewer`.
- Add `design-reviewer`, `qa-reviewer`, `security-reviewer`, `data-reviewer`, and `integration-dev` only when classifier rules require them.
- If the same issue repeats through 3 retry cycles, stop the retry loop and escalate to planner/user decision.
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/agent-all/lib/changed-file-classifier.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/agent-all/lib/changed-file-classifier.test.mjs plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs plugins/harness-floor/skills/agent-all/phases/4-gate.md
git commit -m "feat(agent-all): classify changed files for reviewer gates"
```

---

### Task 10: Foundation Update Flow

**Files:**
- Modify: `scripts/update.sh`
- Modify: `plugins/harness-builder/skills/agent-init/phases/5-wire.md`
- Test: `tests/lib/update-script-contract.test.mjs`

- [ ] **Step 1: Write shell contract test**

```javascript
// tests/lib/update-script-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/update.sh", "utf-8");

test("update script supports dry-run and platform selection flags", () => {
  assert.match(script, /--dry-run/);
  assert.match(script, /--cli=codex/);
  assert.match(script, /install-all\.sh/);
});

test("update script describes foundation update before changing state", () => {
  assert.match(script, /foundation/i);
  assert.match(script, /Dry run/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/update-script-contract.test.mjs`

Expected: FAIL because `scripts/update.sh` does not expose foundation wording or dry-run planning

- [ ] **Step 3: Update `scripts/update.sh` argument handling**

Add variables near the top:

```bash
DRY_RUN=0
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1; PASSTHROUGH+=("$arg") ;;
    --all|--cli=codex|--cli=copilot|--cli=gemini|--cli=cursor|--claude-code) PASSTHROUGH+=("$arg") ;;
    *) PASSTHROUGH+=("$arg") ;;
  esac
done
```

Before any `git pull`, add:

```bash
echo "→ foundation update plan"
echo "  - refresh agent-skill marketplace/cache"
echo "  - verify vendored libs"
echo "  - reinstall selected platform artifacts"
echo "  - no global CLI config files are patched by this script"
if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run requested; no git pull, marketplace update, uninstall, or install command will run."
  exit 0
fi
```

At the end, use:

```bash
exec bash "$REPO_ROOT/scripts/install-all.sh" "${PASSTHROUGH[@]}"
```

- [ ] **Step 4: Run test**

Run: `node --test tests/lib/update-script-contract.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/update.sh tests/lib/update-script-contract.test.mjs plugins/harness-builder/skills/agent-init/phases/5-wire.md
git commit -m "feat(init): add foundation update planning flow"
```

---

### Task 11: Documentation and Release Notes

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.ko.md`
- Modify: `tests/manual-checklist.md`
- Modify: `tests/agent-all/manual-checklist.md`

- [ ] **Step 1: Update README command reference**

In `README.md`, replace `/agent-init` examples with:

```markdown
/agent-init                 # default: operational/heavy scaffold
/agent-init --lite          # minimal root memory + minimal roles
/agent-init --dry-run       # print planned files and config patches
/agent-init --update-foundations  # update approved foundation plugins only
```

Add:

```markdown
Operational mode creates task ledger files, local folder guides, Claude/Codex policy hooks, and reviewer personas. Existing `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` files are updated by an `agent-skill:operational` sentinel section instead of being overwritten.
```

- [ ] **Step 2: Update Korean README with equivalent content**

In `README.ko.md`, add:

```markdown
/agent-init                 # 기본값: 운영형/무거운 scaffold
/agent-init --lite          # 최소 루트 메모리 + 최소 역할
/agent-init --dry-run       # 생성/패치 계획만 출력
/agent-init --update-foundations  # 승인된 foundation 플러그인만 업데이트
```

Add:

```markdown
운영형 모드는 task ledger, 폴더별 가이드, Claude/Codex 정책 훅, reviewer persona를 생성합니다. 기존 `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`는 덮어쓰지 않고 `agent-skill:operational` sentinel 섹션으로 병합합니다.
```

- [ ] **Step 3: Update changelog**

Add under Unreleased in `CHANGELOG.md`:

```markdown
## Unreleased

- Changed `/agent-init` default to operational/heavy scaffold with `/agent-init --lite` as the minimal path.
- Added task ledger scaffolding, sentinel merge policy, Claude/Codex hard policy artifacts, Gemini soft rules, and changed-file reviewer classifier.
- Added foundation detection/update guidance for superpowers and context-mode.
```

Add Korean equivalent in `CHANGELOG.ko.md`.

- [ ] **Step 4: Update manual checklists**

In `tests/manual-checklist.md`, add checks:

```markdown
- [ ] `/agent-init` default creates `docs/tasks/index.md`, folder guides, and policy hook artifacts.
- [ ] `/agent-init --lite` skips task ledger and policy hooks.
- [ ] Re-running `/agent-init` against existing `CLAUDE.md` appends or replaces only the sentinel section.
- [ ] `--dry-run` prints the approved foundation update plan without changing files; `--no-update-foundations` skips that default plan.
```

In `tests/agent-all/manual-checklist.md`, add:

```markdown
- [ ] `/agent-all "prompt"` creates `docs/tasks/NN-slug.md`.
- [ ] Completion/PR is blocked when required task sections are missing.
- [ ] Handoff is updated when a loop exhausts or a wave blocks.
- [ ] Changed-file classifier dispatches security/data/design reviewers for matching files.
```

- [ ] **Step 5: Commit**

```bash
git add README.md README.ko.md CHANGELOG.md CHANGELOG.ko.md tests/manual-checklist.md tests/agent-all/manual-checklist.md
git commit -m "docs: describe operational harness defaults"
```

---

### Task 12: Full Verification and Release Audit

**Files:**
- Inspect: all changed files

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/lib/sentinel-merge.test.mjs tests/lib/folder-guides.test.mjs tests/lib/foundation-check.test.mjs tests/lib/harness-builder-cli-init.test.mjs tests/agent-all/lib/task-id-allocator.test.mjs tests/agent-all/lib/task-ledger.test.mjs tests/agent-all/lib/pathspec-policy.test.mjs tests/agent-all/lib/handoff-writer.test.mjs tests/agent-all/lib/changed-file-classifier.test.mjs tests/lib/update-script-contract.test.mjs
```

Expected: PASS

- [ ] **Step 2: Run full Node test suite**

Run:

```bash
node --test $(find tests -name '*.test.mjs' | sort)
```

Expected: all tests pass

- [ ] **Step 3: Verify no placeholder text in new operational files**

Run:

```bash
PATTERN='TB[D]|TO''DO|PLACE''HOLDER|fill[[:space:]]in'
rg -n "$PATTERN" plugins/harness-builder plugins/harness-builder-codex plugins/harness-builder-gemini plugins/harness-floor/skills/agent-all docs/superpowers/plans/2026-06-01-operational-agent-init-agent-all-hardening.md
```

Expected: no matches except historical comments unrelated to the new implementation; remove or rewrite matches introduced by this plan.

- [ ] **Step 4: Verify git scope**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended files from this plan are changed.

- [ ] **Step 5: Final commit if verification fixes were needed**

If verification required small fixes, commit with:

```bash
git add <fixed-paths>
git commit -m "test: verify operational harness hardening"
```

Expected: `git status --short` clean after the commit.
