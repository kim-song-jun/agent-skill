# Decision-Surfacing + Policy-Hook Enforcement — Design

**Date:** 2026-05-21
**Status:** Design (pending plan)
**Author:** sungjun + brainstorming session
**Scope:** All 5 harness commands (`/agent-all`, `/visual-qa`, `/debug`, `/explore`, `/agent-init`) and all 6 platform ports (Claude Code, Cursor, Copilot CLI, VS Code Copilot, Codex CLI, Gemini CLI)

## 1. Summary

Today, subagents dispatched by the harness (via `superpowers:subagent-driven-development`) make architectural and spec-interpretation decisions **independently**. The main thread only sees a verdict. This is great for context isolation but blind to user judgment.

This design introduces a **decision-surfacing protocol**: before writing code, an implementer subagent does a **scoping pass**, returns a structured payload of decision points (with options + recommendation), and main asks the user via an interactive panel (`AskUserQuestion` on Claude Code; stdin/rule equivalents elsewhere). The subagent is then re-dispatched with the user's answers baked in.

The protocol is enforced via a **single pair of hooks** (`PreToolUse` + `PostToolUse` on `Task`) so phase markdown can never accidentally drop it. The same hook pair opportunistically enforces two adjacent rules that are currently prompt-only: **verification-before-completion** and **reviewer audit cross-check**.

## 2. Background

The existing pattern in `superpowers:subagent-driven-development` already supports questions ("Ask them now. Raise any concerns before starting work." — `implementer-prompt.md` L21-27) and explicit escalation triggers including "architectural decisions with multiple valid approaches" (L62-66). It returns one of 4 statuses: `DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`.

What's missing:
- The pattern is **opt-in** — implementer decides whether to ask. Most don't.
- Questions are **free-form prose**, not structured. Main can't render them as 1/2/3 tables.
- No batched pre-coding scoping pass — questions come up mid-work, ad hoc.
- No non-TTY fallback — implementer just gets stuck (BLOCKED).
- No parallel-wave coordination — N implementers ask N questions independently.

This design closes those gaps **without forking** `superpowers`. The harness injects a protocol addendum at dispatch time via hook, and adds a router that mediates between main and subagents.

## 3. Design Decisions (from brainstorming session)

| Decision | Choice | Rationale |
|---|---|---|
| Decision scope | Architecture + spec ambiguities (~3-8 per task) | Balance signal vs. main-context cost |
| Timing | Scoping pass before code | Predictable token usage; subagent re-dispatched fresh with answers |
| Apply range | All 5 commands × 6 platforms | Pattern is foundational; consistency over surface area |
| Non-TTY policy | Auto-select recommended + log to state | Preserves `/agent-all --loop --qa` overnight workflow |
| Parallel wave routing | Task-grouped + sequential UI | Clear context per ask, accepts AskUserQuestion's per-call cost |
| Recommendation source | Subagent emits `{options[2-4], recommended_index, reasoning}` | Single round-trip; matches AskUserQuestion's "first = Recommended" idiom |

## 4. Architecture

### 4.1 Components

```
plugins/_shared/lib/decisions/
  schema.mjs              JSON schema + validator for decision payload
  renderer.mjs            payload → AskUserQuestion (CC) / stdin (other CLIs)
  non-tty-resolver.mjs    auto-pick recommended, append to state log
  addendum.md             prompt text injected into Task tool prompts

plugins/_shared/lib/policy/
  verification-validator.mjs    PostToolUse: STATUS=DONE → verify log present?
  reviewer-audit-validator.mjs  PostToolUse: reviewer → 'VERIFICATION_AUDIT: ...' present?

plugins/_shared/hooks/
  floor-policy.mjs        single file. Routes PreToolUse + PostToolUse internally.

plugins/harness-floor/skills/agent-all/lib/
  decision-router.mjs     wave coord: scoping → batched ask → re-dispatch

plugins/harness-floor/skills/agent-all/phases/
  3-dispatch.md           updated with 3a/3b/3c sub-phases (see §6)
```

### 4.2 Data flow

```
                     ┌──────────────────────────────────────────┐
                     │  /agent-all Phase 3 — Dispatch           │
                     └──────────────────────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
       Task subagent #1         Task subagent #2         Task subagent #3
       (scoping pass)           (scoping pass)           (scoping pass)
       [PreToolUse hook injects addendum into prompt]
              │                        │                        │
              ▼                        ▼                        ▼
       NEEDS_DECISIONS         NEEDS_DECISIONS         NEEDS_DECISIONS
       payload                 payload                 payload
              └────────────────────────┼────────────────────────┘
                                       ▼
                          [decision-router.mjs collects]
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                      TTY mode?                Non-TTY mode?
                      AskUserQuestion           non-tty-resolver picks
                      task-by-task              recommended, logs to
                                                .agent-all-state.json
                          └────────────┬────────────┘
                                       ▼
                       Re-dispatch with answers injected
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
       Task subagent #1         Task subagent #2         Task subagent #3
       (implementation)         (implementation)         (implementation)
              │                        │                        │
              ▼                        ▼                        ▼
       STATUS: DONE             STATUS: DONE             STATUS: DONE
       [PostToolUse hook validates verification log]
                                       ▼
                          → Phase 4 Gate (unchanged)
```

## 5. Decision payload schema

```json
{
  "status": "NEEDS_DECISIONS",
  "scope": {
    "task_id": "task-3",
    "task_title": "Add OAuth callback handler"
  },
  "decisions": [
    {
      "id": "d1",
      "title": "Token storage location",
      "context": "Existing code uses cookies for session, but JWT tokens are typically stored in localStorage in this codebase per src/lib/auth.ts:42.",
      "options": [
        { "label": "Cookie (httpOnly, secure)", "description": "Matches existing session pattern, CSRF protection needed" },
        { "label": "localStorage", "description": "Matches existing JWT pattern, XSS risk acknowledged" },
        { "label": "Server-side session store (Redis)", "description": "Most secure, adds Redis dependency" }
      ],
      "recommended_index": 0,
      "reasoning": "Sessions in this app are already cookie-based; mixing storage strategies adds complexity. Cookie aligns with existing pattern."
    }
  ]
}
```

Constraints:
- `decisions[].options.length` must be 2-4 (AskUserQuestion's hard limit).
- `recommended_index` must be a valid index into `options`.
- If subagent identifies more than 4 viable candidates, it MUST condense to the top 3 + an "Other (specify in follow-up)" option.

## 6. Phase 3 sub-phases

`3-dispatch.md` is updated from one monolithic step into three:

- **3a — Scoping**: dispatch implementer subagents (parallel) with the addendum. The addendum tells the subagent: *"This is a scoping pass. Do not Edit/Write any files. Read the codebase, identify decisions, return `NEEDS_DECISIONS` with payload. If you find no decisions, return `STATUS: NO_DECISIONS` and the controller proceeds directly to 3c."* Enforcement is **prompt-only** in 3a — Edit/Write is not hook-blocked. If a subagent ignores the instruction and edits files, it's caught at PostToolUse via a check that any STATUS other than `NEEDS_DECISIONS`/`NO_DECISIONS` in 3a is invalid; offending changes are reverted by the router before 3c re-dispatches.
- **3b — Ask user**: `decision-router.mjs` collects payloads, groups by task, calls `AskUserQuestion` sequentially per task (or non-TTY resolver). Writes answers to `.agent-all-state.json` under `state.decisions[<task_id>]`.
- **3c — Implementation**: re-dispatch implementer subagents (parallel) with answers injected. Now Edit/Write allowed. PostToolUse hook validates the final status and verification log.

## 7. Hook protocol

A single file `plugins/_shared/hooks/floor-policy.mjs` exports both `PreToolUse` and `PostToolUse` handlers. Registered via the sentinel-prefix protocol from `2026-05-18-hook-precedence-integration.md`. Sentinel: `floor-policy-`.

### 7.1 PreToolUse routing

```
on PreToolUse(toolName, payload):
  if toolName !== 'Task':                    return passthrough     # 0.1ms exit
  if not isImplementerDispatch(payload):     return passthrough     # heuristic on description
  inject(decisionAddendum, payload.prompt)                          # mandatory scoping
  inject(verificationDirective, payload.prompt)                     # already in repo, formalized
  if isReviewerDispatch(payload):
    inject(reviewerAuditDirective, payload.prompt)                  # require VERIFICATION_AUDIT token
```

### 7.2 PostToolUse routing

```
on PostToolUse(toolName, result):
  if toolName !== 'Task':                    return passthrough
  status = parseStatus(result.text)
  if status === 'DONE':
    if not findToken(result.text, 'verification_passed'):
      return reject('Implementer claimed DONE without verification log')
  if isReviewerResult(result):
    if not findToken(result.text, 'VERIFICATION_AUDIT: (passed|failed|skipped)'):
      return reject('Reviewer must report VERIFICATION_AUDIT explicitly')
```

`isImplementerDispatch` / `isReviewerDispatch` are matched by the `description` field of the Task tool call. Convention: harness dispatches set descriptions to `"Implement Task N: ..."` and `"Review Task N: ..."` (already the case per `agent-all/phases/3-dispatch.md` and the superpowers prompt templates).

### 7.3 Cheap-matchers principle

Each handler exits within 0.1ms when the tool isn't `Task`. JSON parsing only happens when the tool name + description filter pass. Net per-tool-call overhead in the common case: negligible.

## 8. Wave coordination

`decision-router.mjs` is the only new component beyond shared lib. It:

1. Awaits all scoping-pass returns (parallel).
2. Buckets payloads by `task_id`, in wave order.
3. For each task: invokes AskUserQuestion (or non-TTY resolver) sequentially.
4. Writes results to `.agent-all-state.json` so `/agent-all --resume` can pick up after a crash mid-batch.
5. Hands answer map to phase 3c for re-dispatch.

Failure modes:
- A scoping-pass subagent crashes → router treats as `NEEDS_DECISIONS: []` (proceed with defaults). Logged as a concern.
- User cancels AskUserQuestion → entire phase 3 marked `paused`, state saved, exit. `/agent-all --resume` re-asks.

## 9. Non-TTY policy

Detected via:
- `--yes` flag explicitly set, OR
- `process.stdout.isTTY === false`, OR
- `--loop` runs after iteration 1 (Phase 6 re-entry).

When triggered, `non-tty-resolver.mjs` picks each decision's `recommended_index`, appends to `.agent-all-state.json` as:

```json
"decisions": {
  "task-3": {
    "d1": { "chosen_index": 0, "auto_resolved": true, "timestamp": "..." }
  }
}
```

A summary is written to the iteration's report (`docs/agent-all/iter-<N>/decisions.md`) so the next-morning review surfaces all auto-picks.

## 10. Per-platform port matrix

| Platform | Hook mechanism | Renderer | Enforcement strength |
|---|---|---|---|
| Claude Code | `.claude/settings.local.json` hooks | `AskUserQuestion` MCP-style tool | 🟢 Hard |
| Copilot CLI | `.github/hooks/*.json` | stdin prompt | 🟢 Hard |
| Codex CLI | `[[hooks.PreToolUse]]` in `~/.codex/config.toml` for shell/policy events; floor workflows use prompt-level sequential dispatch | stdin prompt | 🟡 Mixed: hard shell policy, prompt-level floor orchestration |
| Cursor | `.cursor/rules/decision-protocol.mdc` (always-loaded rule) | chat prompt | 🟡 Soft (prompt-only) |
| Gemini CLI | `GEMINI.md` section | chat prompt | 🟡 Soft (prompt-only) |
| VS Code Copilot | `.github/copilot-instructions.md` | chat prompt | 🟡 Soft (prompt-only) |

The shared `lib/decisions/` is platform-agnostic Node. Each platform's port plugin's `bin/install.mjs` emits the right hook/rule artifact pointing at the shared lib.

## 11. Opt-out

Per-project opt-out via `.agent-all.json`:

```json
{
  "policy": {
    "decisionSurfacing": true,
    "verification": true,
    "reviewerAudit": true
  }
}
```

Default: all three `true`. Setting any to `false` makes the hook router skip that rule's injection + validation. Useful for legacy projects where retrofitting verification logs is impractical.

## 12. Limitations (must be documented in README and platform docs)

These are real and should be explicit in README's "Common questions" + a new "Known limitations" subsection:

1. **Cursor / Gemini / VS Code Copilot enforcement is soft.** Those platforms don't have a tool-call hook system today. The protocol is prompt-injected via `rules` / `GEMINI.md` / `copilot-instructions.md`, but a subagent that ignores the prompt cannot be blocked. CC / Copilot CLI / Codex get hard hook enforcement.

2. **Reviewer-audit grep is fragile.** It looks for the literal token `VERIFICATION_AUDIT: passed|failed|skipped`. If the subagent rewrites the wording (e.g., "verification audit: passed"), the regex misses. Mitigation: the prompt addendum is explicit and quoted; reviewer prompt templates enforce the exact token at the end.

3. **Decision-surfacing intentionally breaks `subagent-driven-development`'s "Continuous execution" rule.** That skill says (SKILL.md L14): "Do not pause to check in with your human partner between tasks." Our design pauses **once per task**, before code is written. This is acknowledged and documented; we don't pause between completed tasks.

4. **AskUserQuestion has a hard 4-option limit.** If a subagent finds more than 4 viable candidates, it must condense to top 3 + "Other". Subagent guidance lives in `addendum.md`.

5. **Non-TTY auto-pick can be wrong.** Overnight runs may auto-resolve a critical decision incorrectly and only surface it the next morning. Mitigation: every auto-pick is logged with reasoning to `docs/agent-all/iter-<N>/decisions.md`; the next iteration's plan can flag past auto-picks for re-review if quality regressions appear.

6. **Per-task scoping pass adds ~15-20% subagent dispatch cost.** Each task now has 2 dispatches (scoping + impl) instead of 1. Implementation is unchanged, so the second dispatch is roughly the same cost as before; the first is shorter (no code-writing). Real cost increase is the *extra coordination round-trip*. `--max-cost` already governs this safely.

7. **Hook enforcement does not extend to user-typed Edit/Write.** The hook fires only for the `Task` tool. If a user directly edits a file in main thread, none of this applies. By design — this protocol governs subagent behavior, not human behavior.

8. **`description`-based heuristic for identifying implementers can false-positive.** If a user dispatches their own subagent with the word "Implement" in the description, the decision protocol fires for them too. The opt-out flag is the escape hatch.

9. **Confidence scoring is not part of v1.** Recommendations are binary (one option flagged). Future versions may add confidence scores per option to drive smarter non-TTY thresholds.

10. **`/explore` doesn't fit the pattern well.** It's read-only and rarely faces architectural decisions. The protocol will be wired in for consistency but will rarely activate. This is acceptable — the hook is cheap when it doesn't fire.

## 13. README and docs update plan

In `README.md`:
- Add brief callout near "Self-sustaining workflows" explaining decision-surfacing and the non-TTY auto-pick policy.
- Add **"Known limitations"** subsection (just below "Status") with limitations 1, 5, 7, 8 — the ones user-facing and not just implementation details.
- Update the "Main-thread isolation" table to reflect the new Phase 3a/3b/3c structure (token cost shifts slightly).

In `docs/USAGE.md` (and `.ko.md`):
- Add **"Decision-surfacing"** section: what triggers it, what the panel looks like, how to interpret auto-picks.

In per-platform README (each port plugin's bin output):
- Note the enforcement strength (hard/soft) per limitation #1.

## 14. Testing approach

- **Unit**: `lib/decisions/schema.mjs` validator — golden + invalid payload fixtures.
- **Unit**: `lib/decisions/renderer.mjs` — payload → AskUserQuestion args (snapshot).
- **Unit**: `lib/policy/*-validator.mjs` — token presence/absence cases.
- **Unit**: `lib/decisions/non-tty-resolver.mjs` — state-file write golden.
- **Integration**: `hooks/floor-policy.mjs` — mock Task tool dispatch + return, assert injection/rejection.
- **Integration**: `decision-router.mjs` — mock 3 parallel scoping returns + simulated user answers → assert re-dispatch payload shape.
- **Cross-plugin isolation**: existing `tests/lib/cross-platform-isolation.test.mjs` must still pass after `lib/_shared/` additions (may need rule tweak).
- **Smoke**: end-to-end `/agent-all "trivial task" --yes` exercising the full 3a/3b/3c flow in non-TTY mode.

Target: maintain repo's "1759/1759 passing" green status. Add focused tests for any new lib/hook surface.

## 15. Out of scope (v1)

- Confidence scoring on recommendations (see limitation #9).
- Decision-surfacing for `/explore` and `/agent-init` beyond hook installation (rarely-firing).
- Programmatic compact integration with `/thrift` (separate roadmap item).
- Telemetry on auto-pick correctness rates (deferred to a future version).
