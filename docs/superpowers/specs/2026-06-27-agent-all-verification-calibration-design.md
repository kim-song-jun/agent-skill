# agent-all Verification Calibration (scoped-during-waves, full-at-gate) — Design Spec

**Status:** Implemented (rollout §6 steps 1–4 landed: config-loader knob+resolver+tests, adversarial-verifier explicit `command`+tests, Phase 3/4/loop doc edits, full `node --test` 2389 pass + release-smoke 613 pass + vendor-sync clean). Step 5 (release/version bump) is user-gated and pending.
**Date:** 2026-06-27
**Author:** sungjun
**Origin:** Global CLAUDE.md rule 24 (proportionate verification) ported into the agent-all RUNTIME. The real-world driver: in target projects (e.g. posco-mds), the full test command (`tsc` typecheck + full suite, or `pytest`) is re-run many times per run — burning CPU/memory/time/tokens.

---

## 1. Problem (verified)

agent-all runs ONE verification command (`.agent-all.json` `loop.breakCondition`, default `npm test`, resolved by `break-resolver.mjs` `test-auto` → the project's WHOLE test command) repeatedly, with NO change-file scoping:

| Where the full command runs | Frequency |
|---|---|
| Phase 3 — each implementer's `superpowers:verification-before-completion` (runs `breakCondition`) | **N tasks/wave × full command** |
| Phase 4 — gate `verification-reviewer` + the mandatory `verification-reviewer-adversarial` (`adversarialVerify({breakCondition})`) | +1–2 full runs |
| `--loop` — `breakCondition` every iteration until `stableIters` | × iteration count |

For a large TS project, `npm test` (full tsc + full jest) × 5–10 per wave is the CPU/memory/time/token culprit. There is no backend/DB-special handling — the harness just shell-runs the configured command; containerized/DB projects must point `breakCondition` at e.g. `docker compose exec backend pytest …` and the test command owns DB setup.

## 2. Goal

Make verification PROPORTIONATE without losing the safety net:
- **Waves run a cheap SCOPED command; the FULL authoritative run happens ONCE at the gate.**
- Remove redundant full re-runs (implementers + gate-reviewer + adversarial all re-running full).
- Zero behavior change when unconfigured (full backward-compat): if the new knobs are unset, fall back to today's `breakCondition` everywhere.

## 3. Design

### 3.1 Config knob (`lib/config-loader.mjs`)
Add under `loop` (or a new `verification` block):
```jsonc
"verification": {
  "scopedCommand": null,   // cheap per-wave/per-implementer check; null → fall back to loop.breakCondition
  "fullCommand": null      // authoritative full check at the gate; null → fall back to loop.breakCondition
}
```
- Defaults `null` → **no regression** (everything still uses `breakCondition`).
- Deep-merge like the other config blocks; both fall back to `loop.breakCondition` when null.
- Projects opt into savings, e.g. scoped = `vitest related --run` / `pytest tests/<area> -q` / `docker compose exec backend pytest tests/<area>`, full = the whole suite.

### 3.2 Phase 3 (dispatch) — implementers run SCOPED
`phases/3-dispatch.md`: the implementer-verification directive uses `verification.scopedCommand ?? loop.breakCondition` (not the full command). Implementers still MUST verify — just with the cheaper scoped command. Keep TDD per task; the cost cut is the *command*, not the discipline.

### 3.3 Phase 4 (gate) — FULL once, de-duplicated
`phases/4-gate.md`: the **authoritative full run** is `verification.fullCommand ?? loop.breakCondition`, run ONCE — by the mandatory `verification-reviewer-adversarial` (`adversarialVerify({command: fullCommand ?? breakCondition, …})`). The per-reviewer "confirm verification happened" check (line ~146-154) reads the implementers' scoped evidence + the single gate full run; it does NOT make every reviewer re-run the full suite. One full run per wave, at the gate, is the gate of record.

### 3.4 `--loop` — scoped per iteration, full at the final stable check
The loop break-condition check uses the scoped command per iteration; the FULL command runs at the wave gate (3.3) and/or on the iteration that would declare success (the last `stableIters` confirmation), so a loop doesn't pay the full suite every iteration.

### 3.5 adversarial-verifier wrapper
`lib/verification-adapters/adversarial-verifier.mjs` `adversarialVerify({...})` accepts an explicit `command` (the resolved full command) instead of always pulling `breakCondition` — so the gate passes `fullCommand ?? breakCondition`.

## 4. Non-goals / YAGNI
- NOT auto-deriving a scoped command from changed files (stack-specific, brittle) — the project configures `scopedCommand`. Auto-scope is a deferred slice.
- NOT changing the default command when unconfigured (backward-compat).
- NOT touching the TDD discipline itself (rule 3 stays) — only the command's *scope/frequency*.

## 5. Testing (proportionate — per rule 24)
- REAL logic test: `config-loader` merges `verification.scopedCommand/fullCommand`, defaults null, and the resolution falls back to `breakCondition` when null. (One focused test — this is genuine contract logic.)
- adversarial-verifier accepts an explicit `command` and uses it. (Focused test.)
- Do NOT add doc-mention contract tests for the phase-doc edits — read-verify them. Run the affected targeted tests, then the FULL suite ONCE before release (integration gate).

## 6. Rollout (lean — controller-direct, no subagent swarm)
1. `config-loader.mjs` knob + merge + test.
2. `adversarial-verifier.mjs` explicit `command` + test.
3. Phase 3 + Phase 4 + loop doc edits (read-verify).
4. One full `node --test` (integration gate). Vendor-sync (`sync-lib.mjs --check`) + re-vendor to ports if config-loader/adversarial-verifier are vendored (the copilot/cursor/gemini/codex ports mirror these libs — bump there too or the cross-platform contracts drift).
5. Release: bump v0.7.11 → v0.7.12 across manifests (mirror the v0.7.11 release commit's file set) + CHANGELOG (en+ko) + README Versioning + version-assertion fixtures + push + tag. (User-gated.)
