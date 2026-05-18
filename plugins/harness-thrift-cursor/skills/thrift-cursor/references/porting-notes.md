# thrift-cursor — porting notes

## Why the Cursor port is the smallest of the four

Per the per-platform decomposition spec
(`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`),
Cursor lacks three of the platform primitives the Claude Code skill
relies on:

1. **No programmatic hook system.** Cursor's automation surface is
   `.cursor/rules/*.mdc` advisory directives consumed by the planner.
   There is no `PreToolUse` / `PostToolUse` / `SessionStart` /
   `SessionEnd` equivalent. The Claude Code skill's Phase 2
   (instrument) patches `.claude/settings.local.json` with hook
   entries; on Cursor that machinery doesn't exist, so Phase 2 collapses
   to a single-file rule write.

2. **No prompt-cache primitive.** Cursor does not expose a prompt-cache
   surface to plugins or rules. The Claude Code skill's Phase 4 (cache
   prime) is **removed entirely** — there is nothing to prime. The
   `.thrift.json` schema here omits the `cache` section to avoid
   implying an unimplemented feature.

3. **No token / cost telemetry surface.** Cursor's planner output does
   not include per-call token counts or cost. The Claude Code skill's
   Phase 5 (audit) produces a quantified token-cost report; on Cursor
   that degrades to a **textual recap** the planner writes
   narratively, with optional hand-pasted numbers from the Cursor
   usage panel.

Net effect: this port is **scaffold + advisory rule**, no orchestrator,
no metrics. Spec estimate: ~5 days.

## What's preserved from the Claude Code version

- **`.thrift.json` config shape** (minus the `cache` section). Users
  can copy `.thrift.json` from a Claude Code workspace to a Cursor
  workspace with at most stripping the `cache` block.
- **`lib/config-loader.mjs` contract** — same
  `{ok, config | errors, warning?}` return shape; same
  field-level error format.
- **`lib/cost-estimator.mjs` contract** — same
  `estimate({tokensInUncached, tokensInCached, tokensOut, model})` →
  `{actualUSD, baselineUSD, savedRatio, breakdown}` shape; same
  `estimateSession()` aggregation.
- **Workflow intent** — coerce large outputs to context-mode, summarise
  every N turns / M tokens, recap at session end. The rule text encodes
  these in narrative form for the planner.

## What's omitted

| Claude Code feature | Cursor disposition |
|---|---|
| `lib/settings-patcher.mjs` | omitted — no settings file to patch |
| `lib/cache-prime.mjs` | omitted — no cache surface |
| `lib/metrics-collector.mjs` | omitted — no state file produced |
| `lib/summariser.mjs` | omitted — rule asks planner to summarise inline |
| `lib/threshold-evaluator.mjs` | omitted — planner self-assesses thresholds |
| `lib/anthropic-summariser.mjs` | omitted — planner writes summary itself |
| `lib/audit-renderer.mjs` | omitted — recap is narrative + optional numbers |
| `templates/hooks/*.mjs.hbs` | omitted — no hooks to render |
| `.thrift-state.json` | not produced |
| Phase 4 (cache prime) | removed |

## Independent cost-estimator copy (Option B)

Per the decomposition spec's "Cross-cutting concerns" section, each
per-platform plugin keeps its own `cost-estimator.mjs` with an inline
rate table (Option B), rather than importing a base estimator (Option
A). Reasons:
- Avoids cross-plugin import fragility — Cursor's plugin loader
  doesn't exist, so import paths would be entirely relative-to-repo
  with no guarantee of survival across project copies.
- The estimator is ~50 lines; duplication cost is small.
- On Cursor specifically, the estimator is "advisory only" anyway —
  there's no programmatic source of token counts to feed it.

The rate table here matches the Claude Code source-of-truth as of the
file creation date. Refresh quarterly against vendor pricing pages.
Note that on Cursor the actual cost a user pays may differ from the
raw model rates because Cursor mediates the underlying model
(subscription tier, throttle bands, etc.).

## Differences from sibling per-platform ports

| Aspect | Cursor | Copilot | Codex | Gemini |
|---|---|---|---|---|
| Hook surface | none (rule only) | `.github/hooks/*.yaml` | `[hooks.*]` TOML | `gemini-extension.json` hooks |
| Cache prime | removed | disabled-by-default | session-priming spike | sub-threshold guard + storage-time |
| Summariser delivery | rule reminder | `store_memory` | stderr | `/compress` hint |
| Audit | narrative recap | local file + `store_memory` mirror | local file | local file w/ Vertex rate table |
| Cost estimator | advisory only | best-effort (Copilot intermediates) | OpenAI rates | Vertex rates + storage term |
| Estimated effort | ~5 days | ~1.5 weeks | ~1.5 weeks | ~2 weeks |

## Known limitations

1. **No threshold enforcement.** The rule asks the planner to suggest
   summarisation every ~25 turns, but the planner has no authoritative
   turn or token counter. The rule fires when the planner thinks it
   should, not when a hook says it must.

2. **No revert sentinel.** `.cursor/rules/thrift.mdc` is owned entirely
   by this plugin. Revert = delete the file manually. There is no
   append-only patcher because there is nothing to share.

3. **No live verification.** Sandbox does not run Cursor, so the rule
   text has not been observed in a live Cursor chat. Future iterations
   should verify the rule fires as written.

4. **Coerce telemetry is advisory.** Even if context-mode-cursor exists
   and the planner respects the coerce suggestion, there is no
   `PreToolUse` hook recording acceptance / rejection rates. The
   `coercionFires` section of the recap template will almost always
   read `(none recorded)`.

## Future work

- Once Cursor exposes a per-turn cost surface (no public timeline),
  upgrade Phase 5 from narrative recap to a quantified report.
- If Cursor adds a programmatic hook system (no public timeline),
  port Phase 2 to use it and re-enable telemetry collection.
- Cross-platform `.thrift.json` schema standardisation — currently the
  Cursor schema is a strict subset of the Claude Code schema. If sister
  ports diverge further, lift the shared schema into a shared package.
