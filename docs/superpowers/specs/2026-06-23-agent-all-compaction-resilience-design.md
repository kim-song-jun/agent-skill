# agent-all Compaction-Resilient Progress — Design

**Status:** Approved for planning (2026-06-23)
**Scope:** `/agent-all` (harness-floor plugin) + the `agent-init` install template (harness-builder).
**Supersedes/relates:** independent of the dirty-tree PROTECT mode (v0.7.7); rides the same `/agent-init` re-init that v0.7.7 already requires.

## Problem

During a long `/agent-all` run, an **in-session context compaction** (auto-compaction when the window fills, or a manual `/compact`) can erase the orchestrator's working memory of *where it is in the pipeline*. The observed symptom: the orchestrator completes **Phase 2 (plan)** and then **stalls without entering Phase 3 (task creation / dispatch)** — "plan까지만 하고 task를 안 만들어."

### Root cause

1. Phase→phase advancement relies on **conversation memory**. The SKILL text and phase files were read earlier in the session via tool calls; a compaction summarizes those tool results away, so the orchestrator loses both its *place* in the pipeline and the *phase instructions* themselves.
2. The only existing recovery path, `--resume`, assumes **session death** — a fresh `/agent-all --resume` invocation that re-runs Phase 0 (step 5/5b) to reconstruct state and skip completed phases. **In-session compaction is not session death**: the process keeps running, `/agent-all --resume` is never re-invoked, so Phase 0 recovery never fires.
3. The memory-agent checkpoint (`.agent-skill/memory/checkpoint_LATEST.json`, `inFlight` flag) is **only written starting at Phase 3 (3a.0)**. At the exact 2→3 stall point there is no checkpoint at all — only `.agent-all-state.json` with `phases:[{0},{1},{2}]`.

So the data needed to recover *already exists on disk* (`state.json` pushes `{phase:N}` at the end of every phase, including Phase 2). What is missing is (a) a deterministic mechanism to **re-inject** a recovery directive after compaction, and (b) a way to tell an **in-flight** run apart from a finished one.

## Goal

After any in-session compaction during a `/agent-all` run, the orchestrator is deterministically re-oriented to **continue the pipeline from the correct next phase** — for every phase boundary (0→1→…→6), not just 2→3 — without restarting from Phase 0 and without stopping after the plan.

## Non-goals

- Steering the compaction *summary content* itself (PreCompact hooks cannot do this — side-effects only; confirmed).
- Mid-subagent (within a single Phase 3 wave) state reconstruction beyond what `state.json` + the existing checkpoint already carry. The re-injection points the orchestrator back into Phase 3, which then uses its existing 3a.0 checkpoint / `--resume` machinery.
- A new human-readable run ledger. (Considered and dropped — YAGNI. `state.json` is the single source of truth; a second artifact would need synchronizing.)

## Key platform facts (verified)

- `SessionStart` fires after a compaction with `source: "compact"` (both auto and manual). Other sources: `"resume"`, `"startup"`, `"clear"`.
- A `SessionStart` hook's `additionalContext` (or stdout) is injected into the **post-compaction** context window — this is the re-injection lever.
- **Plugin-level** SessionStart `additionalContext` is unreliable (Claude Code issue #16538). **Project-level** hooks registered in `settings.local.json` work as documented. → the hook is installed at project level by `agent-init`, not at plugin level.
- `SessionStart` does **not** support matchers. The hook must **self-filter** by reading `source` from its stdin payload.
- `${CLAUDE_PROJECT_DIR}` is available to settings-registered hook commands (already used throughout the existing template).

## Architecture

Three thin layers; data already on disk, so the new code is small.

### Layer 1 — `state.json` status lifecycle (data)

Add three top-level fields to `.agent-all-state.json`:

| Field | Type | Set when |
|-------|------|----------|
| `status` | `"running" \| "done" \| "aborted"` | `running` at Phase 0; `done` at "When done"; `aborted` on abort paths that can still write |
| `runId` | string | Phase 0 (generated once; reused verbatim on `--resume` per the existing dirty-snapshot rule) |
| `updatedAt` | ISO 8601 string | refreshed at **every** phase-boundary write |

- Phase 0 step 9: when initializing/creating state, set `status:"running"`, `runId:<runId>`, `updatedAt:<iso>`. This also closes an existing gap — `state.runId` is read at Phase 5 (`?? "agent-all"`) but never explicitly persisted today.
- Every phase's final "Push `{phase:N}` to `phases`" step also refreshes `updatedAt` (and keeps `status:"running"`).
- SKILL "When done": set `status:"done"`, refresh `updatedAt`.
- Abort paths: set `status:"aborted"` before aborting where the orchestrator still controls the write. Aborts that cannot write (crash) leave `status:"running"`; the staleness guard (Layer 2) prevents zombie nags.
- All writes atomic (temp + rename), consistent with the existing Phase 0 step 9.

### Layer 2 — `session-resume.mjs` SessionStart hook (re-injection)

New `agent-init` hook template: `plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs`. Installed to `${CLAUDE_PROJECT_DIR}/.claude/hooks/session-resume.mjs`.

Behavior:

1. Read stdin payload; parse `source`. Act only when `source ∈ {"compact", "resume"}`. For any other source (`startup`, `clear`, unknown) → exit 0 silently. (`startup` excluded: a brand-new session is more likely unrelated work; `--resume` already has Phase 0 recovery but `resume` is kept here as a belt-and-suspenders re-injection.)
2. Resolve `${CLAUDE_PROJECT_DIR} || process.cwd()`; read `.agent-all-state.json`. Absent or unparseable → non-fatal (stderr warn for parse error), exit 0.
3. If `status !== "running"` → exit 0 silently (done/aborted).
4. **Staleness guard:** if `updatedAt` is older than `STALE_AFTER_MS` (12h) → exit 0 silently. (An in-session compaction is by definition recent; this suppresses zombie state from a run that died without cleanup.)
5. Compute `completed = phases.map(p => p.phase)`; `nextPhase = max(completed) + 1`. If `nextPhase > 6` → exit 0 silently (pipeline already past the last phase).
6. Emit a directive via the documented JSON envelope:
   ```json
   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<directive>"}}
   ```
   Directive text (runId omitted if absent):
   > ⚠️ A `/agent-all` run (`<runId>`) is IN PROGRESS — not finished. Completed phases: `<list>`. NEXT: **Phase `<Y>` (`<name>`)**. This context was just compacted, so your memory of the run may be incomplete. Re-read the agent-all SKILL and `phases/<Y>-<slug>.md`, then CONTINUE the pipeline from Phase `<Y>`. Do NOT stop after the plan; do NOT restart from Phase 0. Progress SSOT: `.agent-all-state.json`.
7. Phase number → file slug from an internal const map: `{0:"0-preflight",1:"1-intent",2:"2-plan",3:"3-dispatch",4:"4-gate",5:"5-pr",6:"6-loop"}`.
8. Any error → stderr warn, exit 0. The hook never blocks and never fails the session (mirrors `wiki-session-digest.mjs` / `session-summary.mjs`).

Directive size is well under the 10k additionalContext budget.

### Layer 3 — settings registration + SKILL recovery discipline

- `settings.local.json.hbs`: add to the existing `SessionStart` array, next to `cache-heal.mjs`:
  ```json
  { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-resume.mjs\"" }
  ```
  Ungated by `operationalProfile` — harmless when no `state.json` exists (exits silently), matching `cache-heal.mjs`.
- SKILL.md gains a **"Compaction recovery (in-session)"** section:
  - In-session compaction (not session death) can erase your place; unlike `--resume`, nothing re-enters Phase 0 automatically.
  - When you see the `session-resume.mjs` directive after a compaction, obey it: re-read the SKILL + the named phase file, continue from the named phase.
  - Self-heal even without the hook: if unsure where you are mid-run, read `.agent-all-state.json` and resume after `max(phases[*].phase)`. Trust `state.json` over recollection (the subagent-driven-development "Durable Progress" principle).
  - On a `status:"running"` state, never restart from Phase 0; never stop after Phase 2.
- Rule 2's documented `state.json` shape updated to include `status`, `runId`, `updatedAt`.
- Each phase file's boundary step augmented with the `updatedAt`/`status` refresh (one line each).

## Data flow (the 2→3 case)

1. Phase 0 writes `state.json` `{status:"running", runId, updatedAt, phases:[]}`.
2. Phases 0,1,2 each push `{phase:N}` and refresh `updatedAt`. After Phase 2: `phases:[{0},{1},{2}]`, `status:"running"`.
3. Compaction fires before Phase 3 begins. The orchestrator's memory is summarized.
4. `SessionStart(source="compact")` runs `session-resume.mjs`: reads `state.json`, `status==="running"`, fresh, `max(phase)=2`, `nextPhase=3` → injects the "continue from Phase 3 (3-dispatch)" directive into the post-compaction window.
5. The orchestrator re-reads `phases/3-dispatch.md` and proceeds with task creation / dispatch. No Phase 0 restart, no stall.

## Testing (node --test, phase-contract style)

- `tests/agent-init/session-resume-hook.test.mjs` — `execFileSync` the real hook with crafted stdin + a temp `state.json`:
  - `source:"compact"`, `status:"running"`, `phases:[0,1,2]` → stdout JSON `additionalContext` contains "Phase 3" and "do not stop" / "do NOT restart"; exit 0.
  - `source:"clear"` → no directive (empty/`{}`); exit 0.
  - `status:"done"` → no directive; exit 0.
  - no `state.json` → exit 0, no stdout directive.
  - stale `updatedAt` (>12h) → no directive.
  - malformed `state.json` → exit 0, stderr warn (non-fatal).
  - `phases:[0..5]`, `nextPhase=6` → mentions Phase 6; `nextPhase>6` → silent.
- `tests/agent-all/state-status-contract.test.mjs` — pin the real wiring: Phase 0 doc + SKILL set `status:"running"`/`"done"`; phase docs refresh `status`/`updatedAt` at the boundary; the SKILL "Compaction recovery" section exists. Each assertion must fail meaningfully against the pre-change docs (non-toothless).
- Regenerate the `settings.local.json.hbs` operational-heavy snapshot.

## Definition of Done

- Hook unit-proven (the tests above, green; the new tests fail against pre-change code).
- A real `/agent-all` run + a manual `/compact` shows the directive injected into the post-compaction window and the orchestrator continues to the correct next phase. Honest scope: deterministically forcing an *auto*-compaction mid-run is impractical to stage, so the live check uses manual `/compact` during a real run.
- `/agent-init` (operational profile) installs `session-resume.mjs` and registers it; existing installs need one re-init (the same one v0.7.7 already requires).
- Full test suite green.

Release (separate, post-implementation): version bump 0.7.7 → 0.7.8 with the full version-bump-tax (manifests, README badges, CHANGELOG ×2, release-doc-contract escaped-regex asserts, test-count assertions, sync-lib `--check`, provenance/checksum), plus a RELEASE CHECKLIST note that operational installs must re-run `/agent-init` to get the new SessionStart hook.

## Tuning defaults (adopted)

- Hook fires on `source ∈ {compact, resume}` (excludes `startup`, `clear`).
- `STALE_AFTER_MS = 12h`.

Both are single constants, easily revisited if field experience warrants.
