# Dirty-Tree PROTECT Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/agent-all` run on a dirty working tree by snapshotting the pre-existing uncommitted files, protecting them as read-only, and committing only the files agent-all itself changed.

**Architecture:** Phase 0 captures `state.dirtySnapshot` (the pre-run uncommitted paths) instead of aborting. Three enforcement layers then protect that set: (1) the dispatch prompt lists them as forbidden (instruction), (2) a NEW PreToolUse Edit|Write hook guard blocks writes to them (enforcement — the current architecture gap), (3) Phase 3c commits only the complement via pathspec. `dirtySnapshot` persists in the checkpoint so `--resume` restores it.

**Tech Stack:** Node ESM (`.mjs`), `node --test`, Handlebars templates (`.hbs`), Claude Code hooks (PreToolUse), git.

## Global Constraints

- Repo: `agent-skill`. ① touches BOTH `harness-floor` (agent-all skill) AND `harness-builder` (agent-init hook template + settings template). CC only this slice — Codex/Copilot/Cursor/Gemini ports are out of scope until ① is live-verified.
- Tests: `node --test <file>`; phase-doc changes use the phase-contract regex pattern (see `tests/agent-all/lib/wiki-loop-phase-contract.test.mjs`).
- Git safety (global rules 6-10): pathspec-only commits, NEVER `git stash` / `git add -A` / `git reset --hard` / branch switch. Commit each task with explicit `--` pathspec.
- `git-state-reader.mjs`, `pathspec-policy.mjs`, `memory-agent.mjs` are NOT in the sync-lib vendored set; `agent-policy-hook.mjs` lives only in the agent-init template tree. If a later check flags drift, run `node scripts/sync-lib.mjs --check`.
- DoD (spec): each behavioral slice is NOT done until live-verified on posco-mds (`/Users/sungjun/Documents/molcube/posco/posco-mds`, currently dirty). Task 7 is that gate.
- No plugin version bump in this plan (code feature, not a release). Release/version-bump-tax happens separately when ① ships.

---

### Task 1: `parseDirtyPaths` helper in git-state-reader

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/git-state-reader.mjs`
- Test: `tests/agent-all/lib/git-state-reader.test.mjs` (create)

**Interfaces:**
- Consumes: `readGitState().statusLines` (array of `git status --short` lines, e.g. `" M path"`, `"?? path"`, `"R  old -> new"`).
- Produces: `export function parseDirtyPaths(statusLines): string[]` — the working-tree paths, with rename rows resolved to the NEW path.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/lib/git-state-reader.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirtyPaths } from "../../../plugins/harness-floor/skills/agent-all/lib/git-state-reader.mjs";

test("parseDirtyPaths extracts paths, strips XY status, resolves renames to new path", () => {
  assert.deepEqual(
    parseDirtyPaths([" M src/a.py", "?? new.txt", "R  old.py -> renamed.py", "MM staged-and-dirty.js"]),
    ["src/a.py", "new.txt", "renamed.py", "staged-and-dirty.js"],
  );
});

test("parseDirtyPaths returns [] for an empty/clean status", () => {
  assert.deepEqual(parseDirtyPaths([]), []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-all/lib/git-state-reader.test.mjs`
Expected: FAIL — `parseDirtyPaths is not a function` / not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `git-state-reader.mjs`:

```javascript
// Extract working-tree paths from `git status --short` lines. The first 3 chars
// are the XY status + space; rename rows ("R  old -> new") resolve to the NEW path.
export function parseDirtyPaths(statusLines) {
  return (statusLines ?? [])
    .map((line) => String(line).slice(3).split(" -> ").pop().trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/agent-all/lib/git-state-reader.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/lib/git-state-reader.mjs tests/agent-all/lib/git-state-reader.test.mjs
git commit -m "feat(agent-all): parseDirtyPaths helper for dirty-tree snapshot" -- plugins/harness-floor/skills/agent-all/lib/git-state-reader.mjs tests/agent-all/lib/git-state-reader.test.mjs
```

---

### Task 2: `protectedPaths` option in pathspec-policy

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs`
- Test: `tests/agent-all/lib/pathspec-policy.test.mjs` (add cases)

**Interfaces:**
- Consumes: `analyzeShellCommand(command, options)`.
- Produces: `analyzeShellCommand(cmd, { protectedPaths: string[] })` blocks `git add <p>` / `git checkout <p>` when `<p>` is in `protectedPaths` (Bash-level guard, complements the Task-3 Edit/Write guard).

- [ ] **Step 1: Write the failing test** — add to `tests/agent-all/lib/pathspec-policy.test.mjs`:

```javascript
test("protectedPaths blocks git add of a protected file but allows others", () => {
  const opts = { protectedPaths: ["src/wip.py"] };
  assert.equal(analyzeShellCommand("git add src/wip.py", opts).blocked, true);
  assert.equal(analyzeShellCommand("git add src/other.py", opts).blocked, false);
});
```

(Ensure the file imports `analyzeShellCommand` — it already tests this module.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/agent-all/lib/pathspec-policy.test.mjs`
Expected: FAIL — protected `git add` currently returns `blocked:false`.

- [ ] **Step 3: Implement**

In `analyzeShellCommand`, read `protectedPaths` from options and thread it into `analyzeBuiltInCommand` → `analyzeGitInvocation`. In `analyzeGitInvocation`'s `case "add":` (and `case "checkout":`), after the existing `-A` check, scan the post-subcommand tokens for any token equal to a protected path:

```javascript
// signature change: analyzeShellCommand passes protectedPaths down
export function analyzeShellCommand(command, options = {}) {
  const { destructiveCommands = [], destructiveConfirmFlags = [], protectedPaths = [] } = options || {};
  // ... existing destructive checks unchanged ...
  const builtInResult = analyzeBuiltInCommand(tokens, protectedPaths);
  // ...
}

// analyzeBuiltInCommand(tokens, protectedPaths) → pass protectedPaths to analyzeGitInvocation(tokens, result, protectedPaths)

// in analyzeGitInvocation, add a shared helper after the subcommand switch entry:
function hitsProtected(tokens, start, end, protectedPaths) {
  const set = new Set(protectedPaths);
  for (let c = start; c < end; c += 1) {
    if (tokens[c] === "--") continue;
    if (set.has(tokens[c])) return tokens[c];
  }
  return null;
}
// case "add": and case "checkout":  →  const hit = hitsProtected(tokens, invocation.argsStart, invocation.end, protectedPaths); if (hit) return { blocked: true, reason: `protected path: ${hit}` };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/agent-all/lib/pathspec-policy.test.mjs`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs tests/agent-all/lib/pathspec-policy.test.mjs
git commit -m "feat(agent-all): pathspec-policy protectedPaths guard" -- plugins/harness-floor/skills/agent-all/lib/pathspec-policy.mjs tests/agent-all/lib/pathspec-policy.test.mjs
```

---

### Task 3: PreToolUse Edit|Write hook guard (the real enforcement)

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs` (add an Edit|Write branch)
- Modify: `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs` (register the matcher)
- Test: `tests/agent-init/agent-policy-hook-fileguard.test.mjs` (create)

**Interfaces:**
- Consumes: hook stdin payload `{ hook_event_name, tool_name: "Edit"|"Write", tool_input: { file_path } }`; env `AGENT_ALL_DIRTY_SNAPSHOT` = absolute path to a JSON file holding `string[]` of protected paths (written by Task 4's Phase 0; absent → no protection).
- Produces: exit 2 (block) when `file_path` resolves into the protected set; otherwise falls through to existing behavior.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-init/agent-policy-hook-fileguard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs";

function runHook(payload, env) {
  try {
    execFileSync("node", [HOOK, "PreToolUse"], { input: JSON.stringify(payload), env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    return 0;
  } catch (e) { return e.status; }
}

test("Edit on a protected (pre-existing dirty) file is blocked exit 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "fg-"));
  const snap = join(dir, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "src/wip.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap },
  );
  assert.equal(code, 2);
});

test("Edit on a non-protected file passes (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fg-"));
  const snap = join(dir, "dirty.json");
  writeFileSync(snap, JSON.stringify(["src/wip.py"]));
  const code = runHook(
    { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "src/new.py" } },
    { AGENT_ALL_DIRTY_SNAPSHOT: snap },
  );
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/agent-init/agent-policy-hook-fileguard.test.mjs`
Expected: FAIL — hook has no Edit/Write handling; protected Edit returns 0 (or the dispatcher doesn't recognize Edit).

- [ ] **Step 3: Implement** — add a file-write guard and wire it into the main dispatcher.

Add near the other handlers in `agent-policy-hook.mjs`:

```javascript
function handleFileWriteHook(event, payload) {
  if (event !== "PreToolUse") return false;
  const tool = payload?.tool_name;
  if (tool !== "Edit" && tool !== "Write") return false;
  const snapshotPath = process.env.AGENT_ALL_DIRTY_SNAPSHOT;
  if (!snapshotPath) return true; // no protection configured → allow (exit 0 below)
  let protectedPaths = [];
  try { protectedPaths = JSON.parse(readFileSync(snapshotPath, "utf-8")); } catch { return true; }
  const filePath = payload?.tool_input?.file_path;
  if (filePath && new Set(protectedPaths).has(String(filePath).replace(/^\.\//, ""))) {
    console.error(`protected file (pre-existing uncommitted): ${filePath} — agent-all PROTECT mode forbids editing it. Commit it first, or it stays untouched.`);
    process.exit(2);
  }
  return true; // recognized + allowed
}
```

In the main dispatch block (after stdin is read, alongside the Bash/Task routing around line 1289+), route Edit/Write to it BEFORE the Bash path, and exit 0 if it handled-and-allowed:

```javascript
const payload = JSON.parse(input);
const event = process.argv[2] || payload.hook_event_name || "PreToolUse";
if (handleFileWriteHook(event, payload)) { process.exit(0); }
// ... existing Task / Bash routing unchanged ...
```

(Match the file's existing payload-parse + dispatch idiom; the snippet above is the contract, adapt to the surrounding variable names.)

- [ ] **Step 4: Register the matcher** in `settings.local.json.hbs` — add an Edit|Write PreToolUse entry mirroring the Bash one:

```hbs
{ "matcher": "Edit|Write", "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-policy-hook.mjs\"" } ] }
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/agent-init/agent-policy-hook-fileguard.test.mjs`
Expected: PASS (2). Also run the full agent-init hook suite to confirm no regression: `node --test $(find tests/agent-init -name '*.test.mjs')`.

- [ ] **Step 6: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs tests/agent-init/agent-policy-hook-fileguard.test.mjs
git commit -m "feat(agent-init): PreToolUse Edit|Write guard for protected dirty-tree files" -- plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs tests/agent-init/agent-policy-hook-fileguard.test.mjs
```

---

### Task 4: Phase 0 PROTECT mode (snapshot + warn + confirm + write snapshot file)

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/phases/0-preflight.md` (Step 2)
- Test: `tests/agent-all/lib/dirty-tree-phase-contract.test.mjs` (create — phase-contract regex style)

**Interfaces:**
- Consumes: `parseDirtyPaths` (Task 1); `AGENT_ALL_DIRTY_SNAPSHOT` env contract (Task 3).
- Produces: phase doc mandates capturing `state.dirtySnapshot`, writing it to `.agent-skill/runs/<runId>/dirty-snapshot.json`, exporting `AGENT_ALL_DIRTY_SNAPSHOT`, warning about break-condition influence, and getting user confirmation.

- [ ] **Step 1: Write the failing contract test**

```javascript
// tests/agent-all/lib/dirty-tree-phase-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const PHASES = resolve("plugins/harness-floor/skills/agent-all/phases");
const read = (f) => readFileSync(resolve(PHASES, f), "utf-8");

test("Phase 0 enters PROTECT mode on a dirty tree instead of aborting", () => {
  const body = read("0-preflight.md");
  assert.match(body, /parseDirtyPaths/, "uses parseDirtyPaths to snapshot");
  assert.match(body, /dirtySnapshot/, "stores state.dirtySnapshot");
  assert.match(body, /AGENT_ALL_DIRTY_SNAPSHOT/, "exports the env contract for the Edit/Write guard");
  assert.match(body, /break-condition|test result/i, "warns dirty files can influence the break-condition");
  assert.match(body, /PROTECT/, "names PROTECT mode");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/agent-all/lib/dirty-tree-phase-contract.test.mjs`
Expected: FAIL — preflight currently only aborts.

- [ ] **Step 3: Rewrite Step 2** of `0-preflight.md`. Replace the single abort line with:

```markdown
2. **Working tree (clean → normal; dirty → PROTECT mode).** Run `git status --porcelain`.
   - Empty → set `state.dirtySnapshot = []` and continue (unchanged path).
   - Non-empty → enter **PROTECT mode** (do NOT abort):
     ```javascript
     import { readGitState, parseDirtyPaths } from "./lib/git-state-reader.mjs";
     state.dirtySnapshot = parseDirtyPaths(readGitState({ cwd }).statusLines);
     ```
     a. Write the snapshot to `.agent-skill/runs/<runId>/dirty-snapshot.json` and export
        `AGENT_ALL_DIRTY_SNAPSHOT=<that path>` so the PreToolUse Edit|Write guard protects them.
     b. Show the user the protected list AND warn: *"These N files are uncommitted from before this run.
        agent-all will treat them as read-only and commit only its own changes. They may also influence
        the break-condition test result — agent-all cannot isolate them (git stash is forbidden)."*
        Get confirmation via `agent-interaction/v1` (no silent auto-proceed — rule 14). On decline → abort exit 0.
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/agent-all/lib/dirty-tree-phase-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/0-preflight.md tests/agent-all/lib/dirty-tree-phase-contract.test.mjs
git commit -m "feat(agent-all): Phase 0 PROTECT mode (snapshot dirty tree, warn, confirm)" -- plugins/harness-floor/skills/agent-all/phases/0-preflight.md tests/agent-all/lib/dirty-tree-phase-contract.test.mjs
```

---

### Task 5: Phase 3c commits only agent-all's own files

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md` (3c step c, ~line 141; Forbidden-files block ~line 178-186)
- Test: extend `tests/agent-all/lib/dirty-tree-phase-contract.test.mjs`

**Interfaces:**
- Consumes: `state.dirtySnapshot`.
- Produces: phase doc mandates (a) injecting `dirtySnapshot` into the dispatch "Forbidden files" field, (b) excluding `dirtySnapshot` paths from the staged pathspec at commit.

- [ ] **Step 1: Add failing assertions** to the contract test:

```javascript
test("Phase 3c injects dirtySnapshot as forbidden + excludes it from the commit pathspec", () => {
  const body = readFileSync(resolve(PHASES, "3-dispatch.md"), "utf-8");
  assert.match(body, /dirtySnapshot/, "3-dispatch references the protected set");
  assert.match(body, /[Ff]orbidden[\s\S]{0,200}dirtySnapshot/, "lists dirtySnapshot under Forbidden files for implementers");
  assert.match(body, /dirtySnapshot[\s\S]{0,200}(exclude|complement|not stage)/i, "excludes protected paths from the commit pathspec");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/agent-all/lib/dirty-tree-phase-contract.test.mjs`
Expected: FAIL (3-dispatch has no dirtySnapshot wiring).

- [ ] **Step 3: Edit `3-dispatch.md`.** In the Dispatch Prompt Contract "Forbidden files" area (~178-186) add: *"Forbidden files ALSO include every path in `state.dirtySnapshot` (pre-existing uncommitted user work — read-only this run)."* In 3c step c (~141), after "stage only task-owned pathspecs", add: *"Exclude any path in `state.dirtySnapshot` from the staged set (the complement only); if a reported changed file is in `dirtySnapshot`, do NOT commit it — warn that a protected file was modified despite the guard and re-dispatch/escalate."*

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/agent-all/lib/dirty-tree-phase-contract.test.mjs`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/3-dispatch.md tests/agent-all/lib/dirty-tree-phase-contract.test.mjs
git commit -m "feat(agent-all): Phase 3c commits only agent-all's own files (protect dirtySnapshot)" -- plugins/harness-floor/skills/agent-all/phases/3-dispatch.md tests/agent-all/lib/dirty-tree-phase-contract.test.mjs
```

---

### Task 6: Persist `dirtySnapshot` in the checkpoint (resume survives)

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs` (`flushCheckpoint` params + payload; `recallLatestCheckpoint` already returns the full payload)
- Test: `tests/agent-all/lib/memory-agent.test.mjs` (add a case, or the existing checkpoint test file)

**Interfaces:**
- Consumes: `flushCheckpoint({ ..., dirtySnapshot })`.
- Produces: the persisted checkpoint includes `dirtySnapshot`; `recallLatestCheckpoint` round-trips it so Phase 0 on `--resume` restores `state.dirtySnapshot` + re-exports the env.

- [ ] **Step 1: Write the failing test** — write a checkpoint with `dirtySnapshot`, recall it, assert the array survives. Use the existing checkpoint test's `makeFileMirror` setup pattern (see how `tests/agent-all/lib/*checkpoint*`/`memory-agent` tests construct the mirror) and assert `recalled.checkpoint.dirtySnapshot` deep-equals the written array.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/agent-all/lib/memory-agent.test.mjs`
Expected: FAIL — `dirtySnapshot` is dropped (not in the persisted payload).

- [ ] **Step 3: Implement** — add `dirtySnapshot = []` to `flushCheckpoint`'s destructured params and include it in the object written to the mirror (mirror the existing `miniPlans` field: it appears in the params list ~line 94 and in the persisted payload ~line 125 and ~line 157 — add `dirtySnapshot` at each of those three sites).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/agent-all/lib/memory-agent.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs tests/agent-all/lib/memory-agent.test.mjs
git commit -m "feat(agent-all): persist dirtySnapshot in checkpoint so --resume keeps PROTECT mode" -- plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs tests/agent-all/lib/memory-agent.test.mjs
```

(Also wire Phase 0's resume branch — `0-preflight.md` step 5b — to restore `state.dirtySnapshot` from the recalled checkpoint and re-export `AGENT_ALL_DIRTY_SNAPSHOT`. Add a one-line contract assertion to the Task-4 test: `assert.match(read("0-preflight.md"), /resume[\s\S]{0,300}dirtySnapshot/i)`.)

---

### Task 7: Live verification on posco-mds (DoD gate — not done until this passes)

**Files:** none (manual/observational verification; record evidence in the PR/commit message).

This is the spec's Definition of Done — unit-green is NOT done. Run the FULL suite first, then exercise the real dirty tree.

- [ ] **Step 1: Full suite green**

Run: `node --test $(find tests -name '*.test.mjs')`
Expected: all pass, 0 fail (count = prior + the new tests).

- [ ] **Step 2: Verify the guard on the real dirty tree (no agent-all run needed — probe the hook directly)**

posco-mds has ~13 pre-existing uncommitted files (e.g. `backend/mds_chat/services/chat_actions.py`). Write a snapshot file listing one of them, then confirm the installed/template hook blocks an Edit to it and allows an unrelated path:

```bash
# from agent-skill repo
SNAP=$(mktemp); printf '["backend/mds_chat/services/chat_actions.py"]' > "$SNAP"
echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"backend/mds_chat/services/chat_actions.py"}}' \
  | AGENT_ALL_DIRTY_SNAPSHOT="$SNAP" node plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs PreToolUse; echo "exit=$? (expect 2)"
echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"backend/new_file.py"}}' \
  | AGENT_ALL_DIRTY_SNAPSHOT="$SNAP" node plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs PreToolUse; echo "exit=$? (expect 0)"
```

Expected: first `exit=2` (protected file blocked), second `exit=0` (unrelated file allowed).

- [ ] **Step 3: Note the install gap (report, do not silently skip)**

The Edit/Write guard lives in the agent-init TEMPLATE. posco-mds's already-installed `.claude/settings.local.json` + `.claude/hooks/agent-policy-hook.mjs` predate it, so the guard is NOT active there until posco-mds re-runs `/agent-init` (or its settings + hook are patched). Record this in the completion report — it is the analog of this session's "plugin update ≠ agent-init" finding, inverted: this one DOES need a per-project refresh because it changes the installed hook + settings.

- [ ] **Step 4: Commit the evidence** (if any notes/docs were added) and report results inline (rule 16): the two exit codes, the full-suite count, and the install-gap caveat.

---

## Self-Review

**Spec coverage:** Phase 0 snapshot+warn+confirm → Task 4 ✅; parseDirtyPaths → Task 1 ✅; PreToolUse Edit/Write guard → Task 3 ✅; Phase 3c pathspec filter → Task 5 ✅; pathspec-policy protectedPaths → Task 2 ✅; checkpoint dirtySnapshot field → Task 6 ✅; live-verify posco-mds → Task 7 ✅. Break-condition test-oltution (decision B) → covered as the Phase-0 warning (Task 4 step 3b), consistent with the spec's "warning is the only safe mitigation."

**Placeholder scan:** No "TBD"/"handle edge cases". Task 3 step 3 and Task 6 step 1/3 reference "adapt to the surrounding variable names / existing pattern" because they edit large existing files (agent-policy-hook.mjs 1289 lines, memory-agent.mjs) — the exact insertion contract (function body, the three `miniPlans` sites) is given so the engineer matches the local idiom, not a placeholder.

**Type consistency:** `parseDirtyPaths(statusLines): string[]` (Task 1) is consumed identically in Task 4. `AGENT_ALL_DIRTY_SNAPSHOT` env name is identical across Tasks 3/4/6. `state.dirtySnapshot` is the single state key across Tasks 4/5/6. `protectedPaths` option name matches between Task 2's impl and the pathspec-policy call site.

**Known cross-task ordering:** Task 4 (Phase 0) writes the snapshot file the Task 3 guard reads; Task 3's test stands alone (writes its own snapshot file), so order 1→6 is safe to implement linearly.
