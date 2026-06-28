# Orphan /agent-all run handling — Stop-hook self-heal

- **Date:** 2026-06-29
- **Status:** Approved (design)
- **Scope:** `plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs` + its test only.
- **Human-readable rendering:** `2026-06-29-orphan-run-handling-design.html` (same dir).

## 1. Problem

A `/agent-all` run that dies at **Phase 0** (preflight writes `.agent-all-state.json` + acquires the
lease, but the turn ends before Phase 1 captures a `task`) becomes an **orphan**: `status:"running"`,
`task:null`, `sessionId:null`, stuck at `phase 0`. The `Stop` hook `agent-all-continue.mjs` then
blocks **every** turn-end with "continue from Phase 1" — but there is no task to continue, so it is a
dead-end trap that persists for up to **12 hours**.

Root cause is a **liveness-model mismatch** between two state files:

| File | Liveness signal | Stale window |
|---|---|---|
| `.agent-skill/runs/active-lease.json` (authoritative) | heartbeat, refreshed per phase | **15 min** (`LEASE_STALE_MS`) |
| `.agent-all-state.json` (what the Stop hook reads) | `status:"running"` | **12 h** |

The Stop hook is unaware of the lease and never checks whether a `task` exists, so it cannot tell a
genuinely-active mid-pipeline run from an abandoned preflight stub.

## 2. Design — two-bucket decision model

Refactor the hook into a pure decision function + a thin I/O shell so the logic is unit-testable:

```
evaluateStop({ state, lease, now, sessionId }) →
    { action: "allow" }                       // not our run / legit / orphan-not-reapable
  | { action: "allow", reap: {runId, updatedAt} }  // orphan, safe + stale → mark aborted
  | { action: "block", reason }               // live mid-pipeline run → force continue (unchanged)
```

The top-level I/O runs only when invoked as the main script
(`import.meta.url === pathToFileURL(process.argv[1]).href`); importing the module for tests does not
read stdin.

**Bucket A — allow stop, never write** (existing behavior, preserved):
`stop_hook_active` · no state file · `status≠running` · fresh `awaitingUser` (≤10 min) ·
`nextPhase>6` · foreign `state.sessionId` · **fresh lease held by another session**.

**Bucket B — orphan → allow stop, write `aborted` only when safe + stale:**
- **ⓐ no-task orphan** — `task` is null/empty **and** `maxPhase ≤ 0` (never left preflight).
- **ⓑ dead lease** — `active-lease.json` exists and its heartbeat is older than 15 min.
- **ⓒ 12 h zombie** — `updatedAt` older than 12 h (legacy backstop, covers no-lease installs).

**Otherwise → block** (live, mid-pipeline, ours) — the compaction-recovery guarantee is unchanged.

## 3. Self-heal — write only the safe cases

The `aborted` write (`status:"aborted"`, refreshed `updatedAt`, `abortedReason:"orphan-reaped-by-stop-hook"`)
happens only when **all** hold:

1. **Reapable kind:** ⓐ no-task orphan **or** ⓒ 12 h zombie. (ⓑ dead-lease with real progress,
   `maxPhase>0`, is allow-stop **only** — never auto-aborted; it survives for `--resume` or 12 h cleanup,
   so we never throw away real work after just 15 min.)
2. **Owned safely:** `state.sessionId === sessionId` (our run) **or** `state.sessionId == null` with no
   fresh foreign lease. A fresh lease held by another session forbids the write outright.
3. **Provably stale:** `updatedAt` older than 15 min. A just-started run is never auto-aborted.

Trap removal (the **allow-stop**) is immediate and read-only even for a fresh no-task orphan; only the
*write* waits for staleness.

## 4. Concurrency — shared worktree

`.agent-all-state.json` is a single file shared by every session, and the hook now writes it, so:

| Threat | Scenario | Defense |
|---|---|---|
| TOCTOU clobber | Another session's Phase 0 writes a fresh run into the same file between our check and write | **staleness gate** (never reap a <15 min run) + **CAS-on-reread** |
| Live concurrent run | Another session holds a fresh lease | fresh foreign lease ⇒ **never block, never reap** |
| Double reap | Two Stop hooks reap the same orphan | **idempotent** terminal write (`status:"aborted"` only) |
| Lease violation (rules 6–10) | Hook touches another session's lease | hook reads the lease **read-only**; never writes/releases it (lease self-heals via its own 15 min window + Phase 0 takeover) |
| Torn read | Reading mid-write | all writes are atomic temp+rename; `JSON.parse` in try/catch ⇒ malformed → non-fatal allow |

**CAS-on-reread:** immediately before the atomic rename, re-read `.agent-all-state.json`; write only if
`runId` + `updatedAt` + `status:"running"` still match the evaluated orphan. Residual window is two
adjacent fs calls (sub-ms) against Phase-0 writes that occur at model-orchestration cadence (seconds) →
effectively zero collision probability.

**Explicitly NOT done** (recorded to prevent re-litigation):
- No `O_EXCL` lock file — staleness + CAS + idempotent write already cover the meaningful races; a lock
  only adds leak risk for near-zero benefit.
- No Phase 0 / SessionStart / doctor changes — scope is the Stop hook only (per approval).

## 5. Implementation tasks

1. Rewrite `agent-all-continue.mjs`: `evaluateStop` pure function, `isMain` guard, inline best-effort
   lease read, `reapState` with CAS + atomic temp+rename, non-fatal write failure.
2. Keep `LEASE_STALE_MS = 15*60*1000` with a comment pointing at `run-lease.mjs` as SSOT (standalone
   template cannot import the plugin lib).
3. Preserve the existing block reason text and phase maps.

## 6. Test matrix (`tests/agent-init/agent-all-continue-hook.test.mjs`)

Real-bug-catching cases (rule 3); `evaluateStop` imported directly + subprocess E2E for writes:

- **Regression fix:** no-task + phase 0 + stale → `allow`, not `block` (the bug the user hit).
- Fresh no-task orphan (<15 min) → `allow`, **file unchanged** (no premature reap).
- Stale no-task orphan (≥15 min, ownerless) → `allow` + **file written `aborted`**.
- Fresh foreign lease over a stale orphan → `allow`, **file unchanged** (concurrency).
- Dead-lease run with real progress (`maxPhase>0`) → `allow`, **file unchanged** (no work destroyed).
- 12 h zombie, ownerless → `allow` + reap.
- CAS: runId changed between evaluate and write → write skipped.
- **Preserved:** healthy mid-pipeline (phase 0–2, fresh) → still `block` from the correct next phase.
- Malformed state/lease → non-fatal `allow`.

## 7. Local update

After commit (pathspec-scoped, rules 6–10): bump `harness-builder` patch version and reinstall locally
so the corrected hook template is live in the user's environment. Mechanism (full release preflight vs.
quick reinstall) confirmed with the user before running.
