# Theme B — `harness-thrift` design

**Date:** 2026-05-18
**Status:** Design only — no implementation in this iteration
**Purpose:** Define the third pillar plugin alongside `harness-builder`
(scaffolding) and `harness-floor` (cost-unrestricted runtime). `harness-thrift`
is the cost-conscious counterpart: aggressive context-mode integration,
maximal prompt-cache hit rate, and summariser hooks that compact long
sessions automatically.

## Background

The harness family currently ships two themes:

| Theme | Plugin | Posture |
|---|---|---|
| A | `harness-builder` (+ 4 platform siblings) | Bootstrap scaffolding (one-shot, low cost) |
| C | `harness-floor` (+ 4 platform siblings) | Cost-unrestricted multi-agent pipelines (high cost, high quality) |
| **B** | **`harness-thrift`** (new) | **Cost-conscious long-session optimisation (low cost, sustainable runtime)** |

Theme A is install-time work. Theme C is short-burst cost-unbounded work.
Theme B is for the long-running sessions in between — feature work,
debugging marathons, exploratory research — where the dominant cost
driver is *context accumulation* over many hours and many tool calls.

## Problem

Long Claude Code sessions accumulate context faster than the user
notices:

1. **Raw tool output bloats history.** A single `find` or `git log` can
   dump thousands of lines into the conversation, then sit there for the
   rest of the session even if never referenced again.
2. **Cache misses every 5 minutes.** Anthropic's prompt cache TTL is 5
   minutes. Sessions that pause for inspection, planning, or human input
   blow the cache on resume — every "Let me think..." costs the full
   uncached price on the next turn.
3. **Summariser fires too late.** Claude Code's built-in auto-compact
   triggers near the context limit, which means hours of context survive
   before getting compressed.
4. **Repeated reads re-fetch identical content.** Re-reading the same
   file 5x in a session because the model "forgot" pays 5x the token
   cost.

Net effect: a 4-hour session can easily cost 3-10x what a well-managed
2-hour session would, with no quality improvement. `harness-thrift`
addresses this by enforcing thrift patterns via hooks + lib + skills,
not by asking the user to manually optimize.

## Goals

1. **Reduce per-session token cost by ~3x** for sessions ≥1 hour without
   sacrificing output quality.
2. **Prompt cache hit rate ≥80%** on the system prompt + tools layer
   across normal use (not the worst case).
3. **Auto-compact triggers proactively** at configurable thresholds
   (N turns OR M tokens) rather than waiting for limit-pressure.
4. **Raw tool output isolated** from the conversation surface via
   context-mode (when available) — only printed summaries enter context.
5. **Per-session thrift audit** — at session end, report what was saved
   vs an "unmanaged baseline" estimate.

## Non-goals

- Replace Claude Code's built-in auto-compact (we wrap and augment, not
  replace).
- Implement a custom prompt cache layer (we work with Anthropic's TTL,
  not around it).
- Reduce per-turn intelligence (we're optimizing token cost per task,
  not per turn).
- Reduce model size or feature set (this is a runtime layer, not a model
  selection layer).
- Manage local context-mode knowledge base GC (that's context-mode's
  responsibility).

## Architecture

```
plugins/harness-thrift/
├── plugin.json
├── README.md
├── skills/
│   └── thrift/                              # User-facing skill: /thrift
│       ├── SKILL.md
│       ├── phases/
│       │   ├── 0-preflight.md               # Detect context-mode, configure hooks
│       │   ├── 1-config.md                  # Load .thrift.json; compute thresholds
│       │   ├── 2-instrument.md              # Register hooks for current session
│       │   ├── 3-summariser.md              # Periodic context summariser
│       │   ├── 4-cache-prime.md             # Warm-up call to maximize cache cohort
│       │   └── 5-audit.md                   # End-of-session cost report
│       ├── lib/
│       │   ├── config-loader.mjs
│       │   ├── threshold-evaluator.mjs
│       │   ├── summariser.mjs
│       │   └── cost-estimator.mjs
│       ├── templates/
│       │   ├── thrift.config.json.hbs
│       │   ├── audit-report.md.hbs
│       │   └── hooks/
│       │       ├── pretool-context-mode-coerce.json.hbs
│       │       ├── posttool-summarise-when-large.json.hbs
│       │       └── sessionstart-cache-prime.json.hbs
│       └── references/
│           └── thrift-patterns.md
└── hooks/                                   # Bundled hook scripts (optional)
    ├── coerce-bash-to-ctx-execute.mjs
    └── summariser-rolling-window.mjs
```

## `.thrift.json` schema

```json
{
  "version": "0.1.0",
  "summariser": {
    "everyNTurns": 25,
    "everyMTokensOutput": 30000,
    "preserveLastTurns": 6,
    "preserveSpecPaths": true,
    "model": "claude-haiku-4-5-20251001"
  },
  "cache": {
    "primingStrategy": "tools-only" | "system-and-tools",
    "warmInterval": 240,
    "shareCohortAcross": ["session", "branch"]
  },
  "contextMode": {
    "coerceBashWhenOutputExceeds": 20,
    "coerceReadWhenOutputExceeds": 200,
    "blockedTools": []
  },
  "audit": {
    "estimateBaseline": "naive-claude-code",
    "outputPath": "docs/thrift/audit-<date>.md"
  }
}
```

## Component detail

### 5.1 Phase 0 — Preflight

- Detect context-mode availability (call `ctx_stats` MCP tool). If
  missing: warn and disable contextMode features; other thrift features
  still work.
- Confirm `.thrift.json` exists or seed from template.
- Register hooks for this session via `settings.local.json` patch (revert
  on session end via 5-audit).

### 5.2 Phase 1 — Config

- Load `.thrift.json`. Validate. Compute derived thresholds:
  - `summariserTokenThreshold = everyMTokensOutput * 1.0`
  - `summariserTurnThreshold = everyNTurns`
- Stash in `.thrift-state.json`.

### 5.3 Phase 2 — Instrument

Patch `.claude/settings.local.json` with hooks:

- **PreToolUse(Bash)** — if `command` likely produces >20 lines, suggest
  `ctx_execute(language: "shell", code: ...)` instead. (Hook script:
  `coerce-bash-to-ctx-execute.mjs`.)
- **PreToolUse(Read)** — if file is known-large (>200 lines per a quick
  `wc -l` probe), suggest `ctx_execute_file` for analysis-mode reads.
- **PostToolUse(*)** — accumulate output token count. If
  `>= summariserTokenThreshold`: fire summariser (Phase 3).
- **SessionEnd** — invoke Phase 5 audit, revert hook patches.

### 5.4 Phase 3 — Summariser

Triggered by hook OR manual `/thrift summarise`:

1. Pick a fast model (default haiku-4.5).
2. Render a compact summary of the last N turns (excluding preserved
   tail).
3. Inject the summary back into context as a system message; drop the
   summarized turns from the conversation history (via Claude Code's
   compact API — TBD).
4. Preserve `docs/superpowers/specs/*` paths mentioned in summarised
   turns so spec references survive.
5. Log to `.thrift-state.json`: `{summarises: [{at, tokensBefore, tokensAfter, savedRatio}]}`.

### 5.5 Phase 4 — Cache prime

A no-op tool call every `cache.warmInterval` seconds (default 240s — 4
minutes, just under TTL) to keep the system+tools cohort warm during
human-input pauses. Implementation: registered as a background timer
via Claude Code's scheduling API (or via `/loop` if scheduling is not
available).

If `cache.shareCohortAcross` includes `"branch"`, the prime call
includes the current branch name in the system prompt so the cache
cohort is per-branch (not cross-contaminated by other branches).

### 5.6 Phase 5 — Audit

End-of-session report:

```
docs/thrift/audit-2026-05-18-1430.md
```

Contents:
- Session duration, total turns.
- Tokens in/out (cached vs uncached).
- Cache hit rate.
- Summariser fires (N), tokens saved per fire.
- Tool-call coercions (Bash → ctx_execute, Read → ctx_execute_file).
- Estimated baseline cost (no-thrift) vs actual cost; **savings ratio**.

## Component: cost-estimator.mjs

```javascript
export function estimateBaseline({tokensIn, tokensOut, cacheHits, turnCount}) {
  // Naive: assume no cache hits, no summarisation, no coercion.
  const unCachedIn = tokensIn + cacheHits; // baseline: every "cached" token would have been re-read
  // Real cost = same out tokens × per-1M rate + uncached in × per-1M rate
  return {
    actualCost: tokensIn * RATE_IN + tokensOut * RATE_OUT,
    baselineCost: unCachedIn * RATE_IN + tokensOut * RATE_OUT,
    savedRatio: 1 - actualCost / baselineCost,
  };
}
```

Rates pulled from a static table per model. Update quarterly.

## Testing strategy

| Layer | Tests |
|---|---|
| `lib/config-loader.mjs` | schema validation; defaults |
| `lib/threshold-evaluator.mjs` | summariser-trigger logic per turns/tokens |
| `lib/summariser.mjs` | uses mock LLM; verifies preserveLast/preserveSpecPaths |
| `lib/cost-estimator.mjs` | rate-table math; cache hit savings computation |
| `hooks/coerce-bash-to-ctx-execute.mjs` | unit tests with synthetic bash command list |
| `phases/2-instrument.md` (integration) | hook registration round-trip; settings.local.json patched + reverted |
| `phases/5-audit.md` (integration) | audit report renders correctly given mock session metrics |

## Decomposition into sub-projects

| Sub-project | Scope | Estimate |
|---|---|---|
| `thrift-core` | plugin shell, config-loader, threshold-evaluator, cost-estimator | 3 days |
| `thrift-instrument` | hooks (coerce-bash, coerce-read, posttool-summariser-trigger) + Phase 2 | 4 days |
| `thrift-summariser` | summariser lib + Phase 3 + integration with Claude Code's compact API | 5 days |
| `thrift-cache` | Phase 4 prime + cohort strategy + branch-scoped priming | 3 days |
| `thrift-audit` | Phase 5 report + per-session metrics collection | 2 days |
| `thrift-cli-integration` | wire into Claude Code via `/thrift` slash command + manual `/thrift summarise` trigger | 2 days |
| Tests + manual checklist | end-to-end harness with synthetic long session | 3 days |

**Total: ~3 weeks.**

## Decomposition into per-platform sub-projects (if Theme B ports)

Like `harness-builder` and `harness-floor`, `harness-thrift` may need
per-platform siblings:
- `harness-thrift-codex` — Codex has its own context limits + cache
  semantics; thrift patterns translate, hook syntax differs.
- `harness-thrift-copilot` — Copilot has `store_memory` which could
  augment the summariser as durable scratch.
- `harness-thrift-gemini` — Gemini's free-tier rate-limits make
  cache-priming counterproductive; cache strategy needs platform-specific
  tuning.
- `harness-thrift-cursor` — Cursor's planner handles some of this
  automatically; thrift becomes lighter (mostly summariser + audit).

This porting decomposition would be its own spec, mirroring
`docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md`.
**Recommendation:** ship Claude-Code-only Theme B first (validate the
patterns work), THEN decompose ports.

## Open questions

1. **Claude Code's compact API.** Does CC expose a programmatic way to
   compact history mid-session? If not, the summariser becomes
   advisory — emits the summary to the user, asks them to `/compact`.
   Need to read Claude Code's plugin API docs.

2. **`SessionEnd` hook reliability.** If the session crashes or the user
   closes the terminal, `SessionEnd` may not fire. Audit report would
   be lost. Mitigation: also write incremental state on every
   summariser fire so the report can be reconstructed from
   `.thrift-state.json` post-hoc.

3. **Cache-prime cost vs savings.** Cache-prime calls themselves cost
   tokens. For sessions <30 min, the prime cost may exceed savings.
   Recommendation: enable prime only when `.thrift.json` `cache.minSessionMinutes`
   threshold is set or session was started with `--long`.

4. **Hook conflicts with `harness-floor` and `context-mode`.** All
   three layers register hooks; ordering matters. Need a hook-precedence
   spec across the family. (Could be a separate ~3d project.)

5. **Token counting accuracy.** Claude API doesn't always surface
   per-tool-call token counts. The summariser-trigger threshold may
   fire late if we can only count after tokens accumulate. Mitigation:
   approximate via output byte count × empirical bytes-per-token ratio.

## Recommended next sessions

1. **Spike: Claude Code compact API discovery.** ~1 day. Read CC plugin
   docs + experiment. Outcome: either Phase 3 summariser is
   programmatic (preferred) or advisory.

2. **Spike: hook precedence.** ~2 days. Run a session with `harness-floor`
   + `context-mode` + a stub `harness-thrift` hook. Observe firing order.
   Document. Maybe inform a shared hook-precedence config in `.claude/settings.json`.

3. **Implement thrift-core + thrift-audit.** ~5 days combined. These are
   the least-dependent components — get them shipping value first
   (audit report alone is useful even without summariser).

4. **Implement thrift-instrument + thrift-summariser.** ~9 days. The
   meat of the thrift gains.

5. **Implement thrift-cache.** ~3 days. Most-likely-to-be-counterproductive;
   ship behind a flag (`thrift.cache.enabled = false` by default).

## Out of scope (this design iteration)

- Implementation of any sub-project.
- Per-platform Theme B ports.
- Custom prompt cache layer (we use Anthropic's; not building our own).
- ML-based summariser tuning (heuristic for v1).
- IDE-side dashboards.

## Marketplace entry (when implemented)

```json
{
  "name": "harness-thrift",
  "source": "./plugins/harness-thrift",
  "description": "Theme B — cost-conscious long-session optimisation: context-mode aggressive integration, prompt cache priming, automatic summariser hooks, end-of-session audit"
}
```
