# Smarter agent-all — Design Spec

- **Date:** 2026-06-21
- **Status:** Approved design → spec under user review (pre-implementation)
- **Owner session purpose:** Make `/agent-all` smarter by folding in `github.com/fivetaku/llm-wiki` patterns, adding *genuinely independent* adversarial verification on every implementation, and a dedicated context/memory agent that survives main-session context exhaustion — with zero tech debt and no pass-only tests.

---

## 1. Reframed reality (from the audit-first pass)

An opus synthesis over four sonnet audits of the live tree established that **most "smarter orchestration" already ships** — building it again is the single largest waste risk. The build is therefore small and sharp.

### Already ships — DO NOT rebuild
| Capability | Evidence (current tree) |
|---|---|
| Dynamic orchestration | `lib/orchestration/wave-planner.mjs:38` `planDynamicWave(...)`, called `phases/3-dispatch.md:40-55` |
| Unified policy hook engine | `lib/policy/policy-engine.mjs:11` `evaluatePolicyEvent(...)` |
| Unlimited loop | `lib/loop-evaluator.mjs:4-9` `isUnlimitedMaxIter`; `SKILL.md:77` documents `--max-iter=0` |
| Verification adapters (3 schemas) | `lib/verification-adapters/schema.mjs` `verification-{adapter,plan,evidence}/v1`; `registry.mjs:822` `runVerificationAdapterSpec` |
| Cost telemetry | `lib/cost-telemetry.mjs:5` `agent-cost-telemetry/v1`; `:341` append pattern |
| Reviewer gate dispatch | `lib/gate-plan.mjs:130` `buildGatePlan`, `:97` `makeDispatch` |
| Handoff / resume | `lib/handoff-writer.mjs:114` `renderHandoff`; `lib/resume-artifacts.mjs`; `/agent-handoff` skill |

### Real gaps — what we build
1. **Verification independence (the crux).** `phases/4-gate.md:131` tells reviewers to *"Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself."* The reviewer is instructed to trust the implementer's self-report first → effectively a rubber stamp. There is no separate adversarial-verifier role and no structural guarantee of independence.
2. **Auto-flush on context exhaustion.** `handoff.md` is written only on explicit `/agent-handoff` or an orchestrator decision; no trigger detects context pressure, so in-flight Phase-3a scoping payloads are lost on a mid-wave death.
3. **llm-wiki surface is absent.**

---

## 2. Locked decisions (8)

| # | Decision | Value |
|---|---|---|
| 1 | llm-wiki integration scope | Ported (overrode minimal patterns-only) |
| 2 | Memory persistence | **File + JSONL, NO git** (`.agent-skill/memory/*`) |
| 3 | Work focus | Audit-first → close the **verification-independence** gap |
| 4 | Smartness platform scope | **CC + Codex + Copilot** |
| 5 | Sequencing | **Skeleton-first**: prove on CC, then fan out |
| 6 | Copilot posture | spec-level impl **with visible `live-CLI-unverified (#27)` flag**; tests honestly labeled presence/contract |
| 7 | Wiki fidelity | CC native + Codex near-native + Copilot/Gemini prose-only; **Cursor excluded** |
| 8 | Wiki placement | **harness-floor plugin family** (agent-all-adjacent), NOT a new plugin |

**Net scope:** smartness agents → CC + Codex + Copilot (3). wiki → CC + Codex + Copilot + Gemini (4; Cursor out). Build order: CC smartness first.

---

## 3. Architecture (fixed by audit)

### 3.1 Independent adversarial-verifier
- **Module:** `plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs`
- **Contract:** pure async `adversarialVerify({diff, acceptanceCriteria, breakCondition, cwd}) → { audit, evidence, exitCode }`.
  - **Independence is structural, not promised:** the signature **MUST NOT contain `implementerOutput` / self-report**. It re-derives the verdict by running `breakCondition` against the **wave tip commit** via `runVerificationAdapterSpec()` (`registry.mjs:822`).
  - Emits `verification-evidence/v1` (reuse existing schema) plus the literal token `VERIFICATION_AUDIT: passed` / `VERIFICATION_AUDIT: failed`.
- **Wiring seam:** add a new dispatch kind `verification-reviewer-adversarial` in `buildGatePlan().dispatches[]` (`lib/gate-plan.mjs:130-181`, via the `makeDispatch` path at `:97`) and an authored step in `phases/4-gate.md` (step 3). The orchestrator/main coordinator (the only layer holding `Task`) dispatches it; it joins the existing block-on-critical retry loop.
- **Nesting fact:** roster subagents are engine-forbidden from `Agent`/`Task`/`Workflow` (`references/orchestrator-routing.md:28-37,63`). The verifier therefore lives at the orchestrator level, never spawned by a reviewer/implementer.
- **Model tier (rule 11):** verifier = **opus** (judge node); implementers it audits = **sonnet**. Never invert.

### 3.2 Memory / context agent (no-git)
- **Module:** `plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs`
- **Layer 1 — structured file mirror:** reuse `makeFileMirror({rootDir})` verbatim from `harness-floor-copilot/.../memory-bridge.mjs:33` pointed at `.agent-skill/memory/`. Stores task state, iter, open decisions, **and a free-form scratchpad field** (closes the "no model-reasoning capture" gap).
- **Layer 2 — append-only JSONL:** new `.agent-skill/runs/<runId>/memory-log.jsonl`, written with the `appendCostTelemetry` pattern (`cost-telemetry.mjs:341`). **At most ONE new schema:** `memory-log/v1`. **(audit trail; not a recovery source — recall reads Layer-1 only)**
- **Single source of truth:** this becomes the *single* main-loop memory wiring across CC/Codex/Copilot; the Copilot-only memory-bridge is absorbed, not duplicated.
- **Git safety:** the agent performs **zero git operations** — no push, stash, branch, `add -A`. Durability is filesystem-only.

### 3.3 Auto-flush checkpoint trigger

**Trigger point (corrected):** the orchestrator flushes the **in-flight Phase-3a scoping intent** at the **TOP of sub-phase 3a (`3a.0`), BEFORE any scoping subagent is dispatched** — not at the wave-4→5 boundary. The prior boundary flush only ran *after* `waveResult` was captured, so it stored completed tasks and a death *during* 3a was never checkpointed. The 3a.0 flush captures `{inFlight:true, phase:"3a", wave, iter, runId, planPath, taskIds, miniPlans:[{taskId,title,files,role}], requiredAgents, decisionsSoFar}` — derived from the wave plan, so it exists before any subagent returns. A completion flush (`inFlight:false, phase:"3-complete"`) runs after `state.waves` is appended and supersedes the in-flight pointer.

**Durability layers:**
- **Layer 1 (recovery SSOT):** `makeFileMirror({rootDir:".agent-skill/memory"})`, reused verbatim from `harness-floor-copilot/.../memory-bridge.mjs:33`. flushCheckpoint writes TWO keys: the history key `checkpoint/wave-<wave>-iter-<iter>` (append-style audit) and a **fixed pointer key `checkpoint/LATEST`** that the file mirror overwrites each flush. `checkpoint/LATEST` carries `pointerTo` + the full in-flight payload.
- **Layer 2 (audit only):** `.agent-skill/runs/<runId>/memory-log.jsonl` (`memory-log/v1`). **Never read back** — recall reads Layer-1 only. Best-effort forensic trail.

**Mandatory-mirror contract:** `flushCheckpoint` returns `{ok:false, recoverable:false}` when no `fileMirror` is supplied. Layer-2 alone is unrecoverable, so ok:true is gated on Layer-1 success.

**Recovery path (the real resume path):** Phase 0 (`0-preflight.md` step 5b), on `--resume`, calls `recallLatestCheckpoint({fileMirror, toolCaller:null})` — a new fixed-key helper in `memory-agent.mjs` that reads `checkpoint/LATEST`. A **fresh post-death session needs no lost coordinate** (no `wave-i-iter-n` key required). If the recalled checkpoint is `inFlight`, Phase 0 reconstructs `state.resumeCheckpoint` (miniPlans, iter, decisionsSoFar) FROM DISK; Phase 3 step 3 re-enters the dead wave at 3a using `miniPlans` instead of re-parsing. `discoverResumeArtifacts` (the handoff md) remains a *separate, complementary* signal — it is NOT the checkpoint and never carried recovery state.

**Single source of truth:** one main-loop memory wiring across CC/Codex/Copilot; reuses G3 exports (`memoryLogPath`, `sanitizeRunId`, `MEMORY_LOG_SCHEMA_VERSION`, `recallRepoMemory`). **Zero new schema** beyond `memory-log/v1`. **Zero git.**

### 3.4 llm-wiki port (fidelity-tiered)
`llm-wiki` is a Karpathy "LLM Wiki" pattern template (MIT): Index-as-Router, 2-Phase A/B routing, provenance grading, contradiction preservation, BLUF + fixed sections, SessionStart status digest, compile self-audit `diff=0` gate.

| Host | Fidelity | Surface |
|---|---|---|
| Claude Code | native | 4 commands (`/ingest /compile /query /lint`) + SessionStart hook + CLAUDE.md/conventions + 3 templates |
| Codex | near-native (live-CLI verified) | `.codex/skills/wiki-*` + PreToolUse first-call digest |
| Copilot | prose-only (`#27` flag) | command specs inlined in instructions; digest = documented "first thing to do" |
| Gemini | prose-only | command specs inlined in `GEMINI.md`; no real hook |
| Cursor | **excluded** | — |

Lands additively inside the **harness-floor** plugin family — never a 20th plugin (would trip the nineteen-plugin marketplace `deepEqual`, the 19/19 checksum, and the badge guard simultaneously).

---

## 4. Safety & contracts

- **Git safety (rules 6-9/21):** memory agent does no git; build-time commits are **pathspec-only on `main`** + `git show --stat HEAD` verification + user-gated for the first commit. No branch/stash/`add -A`/reset.
- **Schema sprawl guard:** exactly **one** new schema (`memory-log/v1`); everything else reuses `verification-evidence/v1`, `agent-cost-telemetry/v1`, and the policy JSONL.
- **Independence guard:** a dedicated test fails if `implementerOutput`/self-report ever enters `adversarialVerify`'s signature (one such Edit silently reverts it to a rubber stamp).
- **Port-SSOT:** `gate-plan.mjs` is vendored to codex/copilot/gemini but NOT cursor; `4-gate.md` is authored per-port with no auto-sync. The adversarial dispatch requires editing the codex + copilot `4-gate.md` by hand and extending `port-ssot-contract.test.mjs` to assert **blocking (not advisory)** language for [codex, copilot] only (gemini/cursor explicitly excluded with a comment citing decision #4).
- **Version-bump tax:** batched **once per slice** (badge bump + banned-count regex append + manifest fan-out), not per-test.

---

## 5. Test strategy — zero fake tests

Every slice is guarded by a test that fails on a **real** regression, never a pass-only shape check.

- **Adversarial-verifier:** feed a synthetic diff that deletes a required test file → assert `exitCode !== 0` **and** `audit === 'VERIFICATION_AUDIT: failed'` as an EXACT value; feed a passing diff → assert `passed`. Spawn it as a child process and assert stderr+exit. **Never** assert bare `/VERIFICATION_AUDIT/` presence (the documented token-key tautology).
- **Memory agent:** `mkdtempSync` real disk I/O; store a payload; simulate context reset by nulling the adapter → recall from file mirror only → assert `ok === true`, `source === 'file'`, and value round-trips. The stub must actually drop the adapter so the file-fallback path is exercised.
- **Auto-flush:** write a checkpoint mid-wave to a tmpdir, discard in-memory state, run `discoverResumeArtifacts` + memory replay, assert the in-flight scoping payload survives.
- **Wiki compile gate:** run `/compile` against a real fixture wiki dir; assert the generated index contains every expected entry key by name (sorted-array `deepEqual`) and that a missing index entry actually **blocks** (self-audit `diff=0` gate).
- **Prose-only hosts (Copilot/Gemini):** presence/contract tests, **honestly labeled** as such — never dressed up as behavior verification.

---

## 6. Build methodology — adversarial verification on every implementation

This build **dogfoods the features it ships.** Each slice runs:

1. **Implement** — sonnet worker subagent(s) make the change.
2. **Independent adversarial verify** — an **opus** subagent re-derives the verdict from the diff + acceptance criteria **without access to the implementer's self-report** (Workflow `parallel`/`pipeline`; verify nodes = opus, workers = sonnet per rule 11). ≥majority-refute kills the slice.
3. **Memory/context persistence** — a context-preserving step writes progress, decisions, and open threads to (a) the session memory files under `~/.claude/.../memory/` and (b) `.agent-skill/memory/`, so a main-session context overflow loses nothing.
4. **Checkpoint commit** — at each slice boundary, a **pathspec-only** commit of the slice's own files onto `main` (user-gated), verified with `git show --stat HEAD`. This is the build-time analogue of decision #5 "prove, then fan out."
5. **Goal re-verification** — periodically, an opus adversary re-checks the work-in-progress against the locked decisions + session purpose (this spec §2) and flags drift before it compounds.

---

## 7. Goal backlog (this build + all remaining work)

Ordered. `must` = CC skeleton; `should` = fan-out after CC proof; `later`/`backlog` = remaining work captured so nothing is lost.

| ID | Pri | Goal | Ports | Acceptance / real test |
|----|-----|------|-------|------------------------|
| G1 | must | Adversarial-verifier core module | CC | §5 verifier test green; signature excludes self-report |
| G2 | must | gate-plan + `4-gate.md` adversarial dispatch wiring | CC | blocking-language port-ssot assertion; dispatch enters retry loop |
| G3 | should | Memory agent (`memory-agent.mjs`, Layer1+Layer2) | CC | §5 memory test green; `memory-log/v1` only new schema |
| G4 | should | Auto-flush checkpoint trigger | CC | §5 auto-flush round-trip test green |
| G5 | gate | **Live `agent-all` proof run on CC** | CC | one real run exercises G1-G4 end-to-end with evidence |
| G6 | should | Port verifier + memory agent → Codex | Codex | vendored via sync-lib; codex `4-gate.md` authored; tests extended |
| G7 | should | Port verifier + memory agent → Copilot | Copilot | spec-level + `#27` flag; presence/contract tests labeled honestly |
| G8 | should | llm-wiki port — Claude Code (native) | CC | wiki compile-gate test green; lands in harness-floor family |
| G9 | should | llm-wiki port — Codex (skills + PreToolUse digest) | Codex | shared compile logic tested; 4 command surfaces present |
| G10 | later | llm-wiki port — Copilot (prose) | Copilot | doc-surface contract test; honest no-runnable-surface note |
| G11 | later | llm-wiki port — Gemini (prose) | Gemini | doc-surface contract test |
| G12 | backlog | Copilot/Gemini live-CLI verification (`#27`/`#28`) | Copilot/Gemini | unblocks promoting spec-level features to behavior-verified |
| G13 | backlog | Cursor wiki + smartness (deferred) | Cursor | revisit only if a hook/command surface is added |
| G14 | cross | Version-bump + release-doc-contract maintenance | all touched | batched once per slice |
| G15 | cross | `port-ssot-contract` extensions for adversarial dispatch | codex/copilot | iterate [codex, copilot] only; gemini/cursor excluded w/ comment |

---

## 8. Out of scope (YAGNI / anti-sprawl)

- Rebuilding any of the seven shipped capabilities in §1.
- A `.rag` BM25/vector layer from llm-wiki (explicitly out — context-survival is file+JSONL, not retrieval).
- A 20th plugin; any git-based memory; Cursor smartness; promoting Copilot/Gemini claims to "behavior-verified" before `#27`/`#28` live-CLI spikes.

---

## 9. Known risks

- **Independence is one Edit from death** — guarded by a dedicated signature test (§4).
- **Port fan-out debt** — `4-gate.md` authored per-port by hand; mitigated by the [codex, copilot]-only port-ssot assertion.
- **Copilot/Gemini live-CLI unverified** — surfaced via the `#27` flag; their tests are presence/contract by honest design.
- **Version-bump tax compounding** — batched per slice.
- **Abrupt context death** — boundary-flush covers wave/phase edges, not an arbitrary mid-tool-call death; documented, not silently assumed away.
