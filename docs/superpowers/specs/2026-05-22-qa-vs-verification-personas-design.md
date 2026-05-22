# QA persona vs Verification persona — design

**Date:** 2026-05-22
**Status:** Design (proceeding to impl)
**Target release:** `harness-floor` v0.5.0

## 1. Summary

Today the harness conflates two distinct review concerns under "reviewer":

- **Spec / code-quality reviewer** (technical) — does the code match the spec, are the patterns clean, did the implementer run `verification-before-completion`?
- **User-flow QA** — does the change *make sense to a user*? Are the flows complete? Are edge cases handled from the persona's perspective?

The current `.claude/agents/` templates already have a `qa.md` that's persona-driven (it talks about `{{persona}}` flows), but Phase 4 (Gate) only dispatches the **technical** reviewers and only enforces `VERIFICATION_AUDIT` — there's no equivalent gate for the user-side audit.

This release explicitly separates the two as **Verification team** and **QA team** with parallel audit tokens, and the gate requires both to pass.

## 2. Personas — formal split

| Persona | "Team" | Asks | Outputs | Audit token |
|---|---|---|---|---|
| `qa.md` | **QA team** (user-side) | Does the **{{persona}} user** get what they need? Is the flow complete? Edge cases as the user sees them? | Acceptance scenarios, UAT checklists, defect reports under `docs/qa/{{persona}}/` | `QA_AUDIT: passed \| failed \| skipped` |
| `tester.md` + `reviewer.md` | **Verification team** (technical) | Do the tests pass? Does the code match the spec? Did the implementer run verification? | Test-run reports under `docs/test-runs/`, review reports under `docs/reviews/` | `VERIFICATION_AUDIT: passed \| failed \| skipped` |

Both are dispatched by Phase 4. The wave gate **passes only when both audit tokens land non-`failed`** (`skipped` is allowed when an audit is not applicable, e.g. pure docs change).

## 3. Hook changes

`plugins/harness-floor/bin/floor-policy-hook.mjs`:

- **PreToolUse**: detect new `^qa review task` (case-insensitive) prefix on the `Task` tool's `description`. When matched, inject a QA directive (user-side focus + persona reference + audit-token contract).
- **PostToolUse**: validate the `QA_AUDIT` token on QA reviewer returns. Existing `^review task` → `VERIFICATION_AUDIT` path remains untouched.

Localization mirrors the existing pattern — English directive by default, Korean variant when `language=ko`. Tokens (`QA_AUDIT: passed|failed|skipped`) stay English-only by design.

## 4. New validator

`plugins/harness-floor/skills/agent-all/lib/policy/qa-audit-validator.mjs` — mirror of `reviewer-audit-validator.mjs` but matches `QA_AUDIT:` token. Same `{ ok, reason }` return shape.

## 5. Phase 4 Gate dispatch

`phases/4-gate.md` updated:

1. Existing spec-reviewer + quality-reviewer dispatches preserved.
2. NEW: when `config.policy.qaAudit !== false` (default `true`), dispatch a QA reviewer per wave with description `QA Review Task <N>: <title>` and the wave's persona context (from `.claude/agents/qa.md`).
3. Wave gate verdict aggregates: pass iff `VERIFICATION_AUDIT in {passed, skipped}` AND `QA_AUDIT in {passed, skipped}` for every dispatched reviewer.
4. Conflict policy: if `VERIFICATION_AUDIT: passed` but `QA_AUDIT: failed` (or vice versa), the wave **fails** — the offending audit's report becomes the next iteration's input. Tech success ≠ user-flow success.

## 6. Config opt-out

`.agent-all.json`:

```json
{
  "policy": {
    "decisionSurfacing": true,
    "verification": true,
    "reviewerAudit": true,
    "qaAudit": true
  }
}
```

`qaAudit: false` → Phase 4 skips QA dispatch entirely; hook PostToolUse skips QA-reviewer token validation. Useful for projects without explicit user personas (libraries, CLIs without UI).

## 7. Persona template clarifications

Existing `qa.md.hbs` is already user-persona-focused. We just:
- Add a `## Audit token` section requiring the reviewer to emit `QA_AUDIT: passed|failed|skipped` as the final line.
- Document the QA team vs Verification team distinction inline.

`tester.md.hbs` and `reviewer.md.hbs` get a parallel `## Audit token` section for `VERIFICATION_AUDIT`.

## 8. Limitations

1. **`qa.md` is per-persona.** Projects without an explicit persona declared in `/agent-init` get a default `qa.md` with `{{persona}}` unresolved. Recommended: set persona via `/agent-init --persona="end user"` (or whatever fits). Without it, the QA dispatch falls back to "generic end-user perspective" prose.
2. **Tokens stay English.** Same as `VERIFICATION_AUDIT` — machine-parsed contract; the Korean directive variant just asks the agent to emit the English token literally.
3. **No mid-wave abort on QA failure alone.** Phase 4 still completes both reviewers before deciding; QA failure can only be detected after the QA reviewer returns. Acceptable — the Phase 4 retry budget (3 cycles) covers correction loops.
4. **Conflict resolution is binary.** Either both pass or wave fails — no severity-weighted blending. Future work could add `qaAuditSeverity: warn | fail` toggle to downgrade QA-only failures into warnings.

## 9. Tests

- `tests/agent-all/policy/qa-audit-validator.test.mjs` — token presence/absence/invalid value (mirror of reviewer-audit tests)
- `tests/agent-all/policy/hook-router-qa.test.mjs` — Pre/Post on `QA Review Task` dispatch
- Existing hook-router tests stay green (English default, Korean variant unaffected).
