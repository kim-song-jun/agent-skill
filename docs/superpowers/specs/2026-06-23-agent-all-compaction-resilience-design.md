# agent-all Compaction-Resilient & Multi-Run Progress — Design

**Status:** Approved for planning (2026-06-23)
**Scope:** `/agent-all` (harness-floor) + the `agent-init` install template (harness-builder).
**Builds on:** dirty-tree PROTECT mode (v0.7.7). Rides the same `/agent-init` re-init that v0.7.7 already requires.

This design covers four interlocking robustness gaps surfaced together:

1. **Compaction survival** — an in-session compaction strands the orchestrator mid-run (Phase 2 done, Phase 3 never entered).
2. **Tier-A enforcement** — make "don't stop mid-pipeline" a *blocked action*, not just a nudge.
3. **PROTECT/task overlap** — a pre-existing uncommitted file that the task itself must modify is currently un-editable (file-guard blocks it).
4. **Sequential multi-session** — splitting a job into several runs across fresh sessions must be safe on the shared worktree.

## Problem & root cause (compaction)

During a long `/agent-all` run, an in-session context compaction (auto when the window fills, or manual `/compact`) summarizes away the SKILL text and phase-file tool results, so the orchestrator loses both its *place* in the pipeline and the *phase instructions*. Observed symptom: completes **Phase 2 (plan)** then stalls without entering **Phase 3 (dispatch)** — "plan까지만 하고 task를 안 만들어."

Why existing machinery doesn't catch it:

- Phase→phase advancement relies on **conversation memory**, which compaction erases.
- The only recovery path, `--resume`, assumes **session death** (a fresh `/agent-all --resume` re-runs Phase 0 recovery). In-session compaction is not death: the process keeps running, `--resume` is never re-invoked, Phase 0 recovery never fires.
- The memory-agent checkpoint is only written from **Phase 3 (3a.0)** onward; at the 2→3 stall there is no checkpoint — only `.agent-all-state.json` with `phases:[{0},{1},{2}]`.

The recovery data already exists on disk (every phase pushes `{phase:N}` at its end). What is missing is a deterministic way to (a) **re-inject** a recovery directive after compaction, (b) tell an **in-flight** run from a finished one, and (c) **prevent** premature stops.

## Platform capability model (the load-bearing distinction)

Claude Code has **no primitive that forces an agent to take an action.** Every guarantee reduces to one of two tiers:

- **Tier A — deterministic (cannot be ignored):** `PreToolUse` blocks a bad action; `PostToolUse` requires an audit token before completion; a `Stop` hook refuses to end the turn. Code enforces regardless of LLM cooperation.
- **Tier B — trust-based (strong nudge, can be ignored):** the orchestrator reads a phase file and chooses to advance. Re-injection (`SessionStart`) raises reliability but is still Tier B.

This design uses **both**: `SessionStart` re-injection (Tier B — supplies the instructions to continue) **plus** a `Stop` hook (Tier A — forbids stopping mid-pipeline). They are complementary: Stop forbids premature *yielding*; SessionStart supplies the *instructions* to yield-correctly-later.

## Verified platform facts

- `SessionStart` fires post-compaction with `source:"compact"` (auto and manual); other sources `"resume"`, `"startup"`, `"clear"`. No matcher support — hooks self-filter on `source` from stdin.
- A `SessionStart` hook's `additionalContext` is injected into the post-compaction window. **Plugin-level** `additionalContext` is unreliable (CC issue #16538); **project-level** (settings.local.json) hooks work as documented → install at project level via `agent-init`.
- A `Stop` hook can force continuation by emitting `{"decision":"block","reason":"…"}`; its payload carries `stop_hook_active` (true once a Stop-block has already fired this cycle) — honor it to avoid infinite loops.
- On Claude, in-band user prompts (`AskUserQuestion` / native `agent-interaction`) are **tool calls, not turn-ends**, so they do **not** trigger `Stop`. The Stop-enforcement false-positive surface is therefore small; `awaitingUser` (below) covers only the rare "yield to ask the user to do something external" case and non-Claude surfaces.
- `${CLAUDE_PROJECT_DIR}` is available to settings-registered hook commands.
- `PreCompact` cannot steer summary content (side-effects only) — not used here.

## Architecture — six layers

### Layer 1 — `state.json` status lifecycle (data)

Add top-level fields to `.agent-all-state.json`:

| Field | Type | Set when |
|-------|------|----------|
| `status` | `"running" \| "done" \| "aborted"` | `running` at Phase 0; `done` at "When done"; `aborted` on abort paths that can still write |
| `runId` | string | Phase 0 (generated once; reused verbatim on `--resume`) |
| `sessionId` | string \| null | the owning session id, claimed at run start (multi-session guard); null if unknown |
| `updatedAt` | ISO 8601 | refreshed at **every** phase-boundary write |
| `awaitingUser` | `{at:ISO} \| null` | set just before the orchestrator yields the turn to wait on an **external** user action; cleared when the run resumes |

- Phase 0 step 9: initialize `status:"running"`, `runId`, `updatedAt`; persist `runId` top-level (closes an existing gap — `state.runId` is read at Phase 5 `?? "agent-all"` but never explicitly written today).
- Every phase's final "Push `{phase:N}`" step refreshes `updatedAt`, keeps `status:"running"`.
- "When done": `status:"done"`. Abort paths: `status:"aborted"` where the orchestrator still controls the write (crash leaves `running`; staleness guard covers it).
- All writes atomic (temp + rename).

### Layer 2 — `session-resume.mjs` SessionStart hook (Tier B re-injection)

New `agent-init` template → `${CLAUDE_PROJECT_DIR}/.claude/hooks/session-resume.mjs`. Self-contained (tiny phase-map + state read; no shared install artifact).

0. **Always (every source):** persist this session's `session_id` (from the stdin payload) to `.agent-skill/runs/current-session.json` (`{sessionId, at}`, atomic). This is how Phase 0 later learns its own session id to claim run ownership (Layer 5) — the skill runtime has no reliable env path to it, but the hook payload always carries it. Then:
1. Act on the directive only when `source ∈ {"compact","resume"}` (else exit 0 after the step-0 write — `startup` excluded to avoid nagging unrelated new sessions; `clear` is a deliberate wipe).
2. Read `.agent-all-state.json` (`${CLAUDE_PROJECT_DIR}||cwd`); absent/unparseable → non-fatal, exit 0.
3. `status !== "running"` → silent. Staleness guard: `updatedAt` older than `STALE_AFTER_MS` (12h) → silent.
4. `nextPhase = max(phases[].phase)+1`; if `> 6` → silent.
5. Emit `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<directive>"}}`:
   > ⚠️ A `/agent-all` run (`<runId>`) is IN PROGRESS — not finished. Completed phases: `<list>`. NEXT: **Phase `<Y>` (`<name>`)**. This context was just compacted, so your run memory may be incomplete. Re-read the agent-all SKILL and `phases/<Y>-<slug>.md`, then CONTINUE from Phase `<Y>`. Do NOT stop after the plan; do NOT restart from Phase 0. If you intended to start a *different* task, ignore this and proceed with the new request. Progress SSOT: `.agent-all-state.json`.
6. Phase→slug const map `{0:"0-preflight",…,6:"6-loop"}`. Any error → stderr warn, exit 0. Never blocks.

### Layer 3 — `agent-all-continue.mjs` Stop hook (Tier A enforcement)

New `agent-init` template → `${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-all-continue.mjs`. Registered under `Stop` in settings.

1. Parse stdin. If `stop_hook_active === true` → exit 0 (allow; loop guard).
2. Read `.agent-all-state.json`; absent/unparseable/`status!=="running"` → exit 0 (allow stop).
3. Staleness guard (`updatedAt` > 12h) → exit 0 (allow stop; zombie run shouldn't trap the user).
4. `awaitingUser` fresh (`at` within `AWAITING_USER_TTL`, 10m) → exit 0 (allow stop; legit external-action pause).
5. `nextPhase = max(phases[].phase)+1`; if `> 6` → exit 0 (pipeline complete).
6. Otherwise emit `{"decision":"block","reason":"<continue directive>"}` — the reason mirrors the Layer-2 directive ("continue from Phase `<Y>`; re-read `phases/<Y>-<slug>.md`; do not stop mid-pipeline"). This *forbids* the orchestrator from yielding after Phase 2.

Subagent dispatches don't end the main turn (they're `SubagentStop`), so the hook only fires on a true orchestrator yield — exactly the premature-stop case.

### Layer 4 — PROTECT/task overlap adopt-decision (dirty file the task must edit)

PROTECT mode (v0.7.7) snapshots pre-existing uncommitted files read-only via the Edit|Write file-guard. When the task itself must modify one, the guard blocks the agent's own work. Resolution:

- In **Phase 3**, after parsing the plan, compute `overlap = state.dirtySnapshot ∩ {plan Create/Modify target files}`.
- If `overlap` is non-empty, surface an `agent-interaction/v1` decision (rule 14 — no auto-approve). Per overlapping file:
  - **Adopt into this run** — remove it from `state.dirtySnapshot`, re-write the snapshot file + re-export `AGENT_ALL_DIRTY_SNAPSHOT`, so the file-guard now permits edits and Phase 3c may stage+commit it together with the run's changes.
  - **Keep protected** (default) — the file stays read-only; the task cannot touch it → the orchestrator re-scopes the task to exclude it, or aborts if it cannot.
- The adopt set persists in `state` (mutated `dirtySnapshot`) and survives compaction via Layer 1 + the existing Phase-3 checkpoint, so re-injection/Stop operate on the *current* protected set.
- This decision sets `awaitingUser` while it waits (covers non-Claude surfaces / external pauses), cleared on resume.

### Layer 5 — Sequential multi-session guard

Goal: split a job into several runs across fresh sessions, safely, on the shared worktree. Concurrent runs on one worktree are **out of scope** (single `state.json` + interleaved commits make it fundamentally unsafe; a worktree-isolated future slice is the only true-concurrency answer and requires a git-safety opt-in).

- **Phase 0 status-guard:** when a new (non-`--resume`) run finds an existing `state.json` with `status:"running"`:
  - If stale (`updatedAt` > 12h) → treat as a dead prior run; offer **start fresh** (default) vs **resume**.
  - If fresh → another run is likely in progress (possibly a concurrent session). Surface an `agent-interaction/v1` decision: **Resume that run** / **Start fresh (overwrites state — only if the other run is truly dead)** / **Abort**. Warn that concurrent runs on one worktree are unsafe. Default: **Abort** (safest).
- **Session ownership:** Phase 0 reads `.agent-skill/runs/current-session.json` (written by `session-resume.mjs` step 0 on every session entry) and records its `sessionId` into `state.sessionId`. The `session-resume`/`agent-all-continue` hooks read `session_id` from their own stdin payload; if `state.sessionId` is set and differs, the hook **does not act** (it isn't this session's run) — preventing cross-session re-injection/Stop corruption even if a user ignores the warning and runs concurrently. If `current-session.json` is missing (first install, hook hasn't run yet) `state.sessionId` stays null and the hooks fall back to acting (single-session assumption — the safe status quo).
- **Hand-off** between sequential sessions continues to use the existing `/agent-handoff` + `lib/session-prompt-writer.mjs` + `lib/resume-artifacts.mjs`; this layer adds only the status-guard and ownership tagging.

### Layer 6 — SKILL recovery discipline (Tier B backstop + docs)

- SKILL.md gains **"Compaction recovery (in-session)"**: obey the `session-resume` directive when it appears; self-heal without it by reading `state.json` and resuming after `max(phases[].phase)` (trust `state.json` over recollection — the subagent-driven-development "Durable Progress" principle); on `status:"running"` never restart from Phase 0, never stop after Phase 2.
- Rule 2's documented `state.json` shape updated with `status`, `runId`, `sessionId`, `updatedAt`, `awaitingUser`.
- Each phase's boundary step augmented with the `updatedAt`/`status` refresh (one line each). The decision-surfacing / break-condition / PROTECT-confirm / adopt steps set+clear `awaitingUser` around an external yield.
- "On error" / "When done" sections updated for `status` transitions and the Phase 0 status-guard.

## Data flow (the 2→3 case, with Tier A)

1. Phase 0 writes `{status:"running",runId,sessionId,updatedAt,phases:[]}`.
2. Phases 0–2 push `{phase:N}` + refresh `updatedAt`. After Phase 2: `phases:[0,1,2]`, `running`.
3. Compaction fires; orchestrator memory is summarized.
4. The orchestrator tries to yield after "wrote the plan" → **Stop hook** sees `running`, `nextPhase=3`, not awaiting, owns the session → `decision:block` → forces continuation.
5. (If a `SessionStart(compact)` also fired) the **re-injection** supplies "continue from Phase 3 (3-dispatch), don't restart."
6. Orchestrator re-reads `phases/3-dispatch.md` and dispatches. No stall, no Phase 0 restart.

## Testing (node --test, phase-contract style)

- `tests/agent-init/session-resume-hook.test.mjs` — `execFileSync` real hook + temp state: compact+running[0,1,2] → `additionalContext` mentions "Phase 3" + "do NOT stop"/"do NOT restart", exit 0; clear → no directive (but step-0 `current-session.json` still written); startup → no directive + `current-session.json` written; done → no directive; absent → silent; stale → no directive; malformed → exit 0 + stderr warn; `nextPhase>6` → silent; `sessionId` mismatch vs payload → no directive.
- `tests/agent-init/agent-all-continue-hook.test.mjs` — `execFileSync` real hook: running + nextPhase≤6 + not awaiting + owner-match → stdout `{"decision":"block",…}`; `stop_hook_active` → allow (exit 0/no block); `status:"done"` → allow; fresh `awaitingUser` → allow; stale `awaitingUser` → block; `nextPhase>6` → allow; `sessionId` mismatch → allow.
- `tests/agent-all/state-status-contract.test.mjs` — pin real wiring in the phase/SKILL docs: Phase 0 sets `status:"running"`+`runId`+`sessionId`; boundaries refresh `updatedAt`; "When done" sets `done`; SKILL "Compaction recovery" section exists; Phase 0 status-guard branch present; Phase 3 overlap/adopt branch present. Each assertion must fail meaningfully against pre-change docs.
- Regenerate the `settings.local.json.hbs` operational-heavy snapshot (now two new SessionStart/Stop entries).

## Definition of Done

- All new hook tests green; the new tests fail against pre-change code (non-tautological).
- Live: a real `/agent-all` run + manual `/compact` shows the orchestrator continue to the correct next phase (re-injection observed); a forced premature yield is blocked by the Stop hook. (Auto-compaction can't be staged deterministically — manual `/compact` is the honest live check.)
- A dirty file listed in the plan triggers the adopt/keep decision; adopt makes the edit succeed; keep-protected keeps the guard blocking.
- A second run started while a fresh `running` state exists hits the Phase 0 status-guard.
- `/agent-init` (operational profile) installs both hooks + registers them. Existing installs need one re-init — the same one v0.7.7 already requires.
- Full suite green.

Release (separate, post-implementation): 0.7.7 → 0.7.8 with the full version-bump-tax (manifests, README badges, CHANGELOG ×2, release-doc-contract escaped-regex asserts, test-count, sync-lib `--check`, provenance/checksum) + a RELEASE CHECKLIST note that operational installs must re-run `/agent-init` for the two new hooks.

## Non-goals

- Steering compaction summary content (PreCompact can't).
- A human-readable run ledger (YAGNI — `state.json` is the SSOT).
- **Concurrent** `/agent-all` runs on one shared worktree (unsafe: shared state + interleaved commits). Worktree-isolated true concurrency is a deferred, git-safety-opt-in slice.
- Mid-subagent reconstruction beyond the existing `state.json` + checkpoint; re-injection points back into Phase 3, which uses its own machinery.

## Tuning defaults (adopted)

- `session-resume` fires on `source ∈ {compact, resume}`.
- `STALE_AFTER_MS = 12h`; `AWAITING_USER_TTL = 10m`.
- Phase 0 status-guard default: **Abort** on a fresh foreign `running` state; **start fresh** on a stale one.
- PROTECT/task overlap default: **keep protected**.

All single constants / default-arms, easily revisited from field experience.
