# harness-thrift per-platform porting — decomposition spec

**Date:** 2026-05-18
**Status:** Decomposition only — no implementation in this iteration
**Purpose:** Document why `harness-thrift` (Theme B) requires more per-platform
adaptation than `visual-qa` or `agent-all`, and break the porting work into
per-platform sub-projects with clear scope, prerequisites, and estimates.

## Why harness-thrift is harder than visual-qa or agent-all to port

`harness-thrift`'s value depends on three pieces of platform machinery that each
target CLI implements *differently*:

1. **Hook system shape.** Phase 2 (instrument) patches a settings file with
   `PreToolUse` / `PostToolUse` / `SessionStart` / `SessionEnd` entries. The
   *concept* is portable; the *file format and event names* are not:
   - Claude Code: `.claude/settings.local.json` with `PreToolUse[]` array of
     `{matcher, hooks[]}` entries.
   - Codex CLI: `[hooks.<event_name>]` TOML stanza in `codex-config.toml`
     (see `plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs`).
     Event names differ (`pre_tool_use` not `PreToolUse`).
   - Copilot CLI: `.github/hooks/*.yaml` directory convention (one file per
     hook), with GitHub-style event triggers.
   - Gemini CLI: `BeforeTool` and `AfterTool` events declared in
     `gemini-extension.json` `hooks` block. No native `SessionEnd`; closest
     is `OnExit` (presence unconfirmed).
   - Cursor: **no programmatic hook system.** Cursor relies on
     `.cursor/rules/*.mdc` advisory directives consumed by the planner.

2. **Context-mode integration surface.** Thrift's Phase 2 coerce-bash and
   coerce-read suggestions are designed to delegate to context-mode's MCP
   tools (`ctx_execute`, `ctx_execute_file`). Per the hook-precedence spike
   (`docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md`),
   the v1 design uses **Option C — telemetry only** — letting the existing
   `context-mode-router` stay authoritative on coercion. This assumes:
   - context-mode is installed and its router hook exists.
   - The target CLI can address the same context-mode MCP server.
   context-mode itself is a separate plugin with its own per-CLI port story.
   Where context-mode is not yet ported, harness-thrift's coerce
   recommendations have no recipient and the telemetry hook degrades to a
   pure observer.

3. **Prompt cache API differs per provider.** Phase 4 (cache prime) is
   modeled on Anthropic's 5-minute TTL prompt cache. The exact API,
   cache-read rate, and cohort semantics vary by platform:
   - Claude Code: Anthropic-native; rates in `lib/cost-estimator.mjs`
     (`opus-4-7`, `sonnet-4-6`, `haiku-4-5`); cache read ≈ 0.1× input.
   - Codex CLI: OpenAI models (`gpt-5`, `o-series`). OpenAI cache behavior
     and pricing tier differ; cohort key inputs differ; `claude-haiku-4-5`
     is not available as a cheap summariser model.
   - Copilot CLI: GitHub Models / OpenAI passthrough. Cache semantics
     are intermediated by Copilot — direct prompt-cache priming may not
     be observable to the user.
   - Gemini CLI: Vertex / Google Gemini pricing. Cache primitive
     ("context caching") has *minimum token thresholds* (large
     prefix required) — sub-threshold prime calls cost money but yield no
     cache. Free-tier rate limits further complicate priming.
   - Cursor: no exposed prompt-cache surface. Priming is meaningless;
     Phase 4 becomes a no-op.

4. **Programmatic compact API.** Per the compact-API spike
   (`docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`),
   even on Claude Code the v1 design is advisory (summary written to file
   + Notification asking the user to `/compact`). On other platforms the
   advisory model still works, but the Notification surface differs and
   user-invoked compact equivalents differ:
   - Codex: `/compact` exists in TUI; emit advice via stderr or a TUI hint.
   - Copilot: no documented `/compact` equivalent; advisory becomes
     "consider `gh copilot reset` or starting a new session".
   - Gemini: `/compress` slash command (per Gemini CLI docs as of 2026-05).
   - Cursor: chat thread management is user-side; advisory becomes a
     `.cursor/rules/thrift.mdc` directive baked into the planner prompt.

Net effect: `visual-qa` ported via config-only scaffolding (3 platforms ×
~2h each). `harness-thrift` cannot — each platform port is a real
implementation lift that touches hooks + cache layer + summariser delivery.

## Per-platform implementation requirements

### Codex CLI — `harness-thrift-codex`

**Hook system.** Codex uses `[hooks.pre_tool_use]`-style TOML in
`codex-config.toml`. Phase 2 instrument logic must:
- Read existing `codex-config.toml` (TOML, not JSON).
- Detect existing context-mode-router-equivalent entries (if any).
- Append-only patch a `[[hooks.pre_tool_use]]` table for thrift telemetry.
- Append a `[[hooks.post_tool_use]]` table for the summariser trigger.
- On uninstall, remove only entries whose `command` matches the
  `thrift-*.mjs` sentinel.

**Phase translations.**

| Phase | CC implementation | Codex translation |
|---|---|---|
| 0 preflight | Detect context-mode + CC version | Detect context-mode-codex + Codex version; verify `[hooks]` block supported |
| 1 config | `.thrift.json` loader (portable) | Same file, same schema |
| 2 instrument | Patch `.claude/settings.local.json` | Patch `codex-config.toml` via a TOML-aware patcher |
| 3 summariser | Advisory via Notification hook | Codex has no `Notification` hook; surface advice via stderr from a `post_tool_use` hook that writes to `~/.codex/notifications/thrift-<ts>.md` |
| 4 cache prime | Anthropic SDK no-op call (or `ctx_execute` heuristic) | Codex session-priming: if `exec_command` exposes session reuse, prime via a no-op `exec_command`; otherwise skip (priming OpenAI cache through Codex's intermediation is not observably effective) |
| 5 audit | Write `docs/thrift/audit-*.md` from `.thrift-state.json` | Same — state file is platform-agnostic; cost-estimator subclass for OpenAI rate table |

**Cache prime sub-decisions.**
- If Codex `exec_command` returns reusable session IDs, prime by re-issuing
  the same minimal `exec_command` payload every `warmInterval` to keep the
  OpenAI session-cache cohort warm.
- If Codex models do not surface cache hit rate in their response metadata,
  Phase 5 audit `savedRatio` becomes a *heuristic estimate* not a
  measurement. Document this clearly in the audit report.

**Cost-estimator subclass.** New `cost-estimator-codex.mjs` with OpenAI
rate table (`gpt-5`, `o4-mini`, etc.). Cache-read multiplier per OpenAI
pricing (currently 0.5×; verify quarterly).

**Estimated work**: ~1.5 weeks (research spike on Codex session-cache
semantics + TOML patcher + OpenAI rate table + summariser-via-stderr
verification).

### Copilot CLI — `harness-thrift-copilot`

**Hook system.** Copilot uses `.github/hooks/*.yaml` (per
`plugins/harness-builder-copilot/skills/copilot-init/templates/copilot-config.yaml.hbs`
conventions). Phase 2 instrument logic must:
- Create `.github/hooks/thrift-pretool-telemetry.yaml`,
  `.github/hooks/thrift-posttool-summariser.yaml`,
  `.github/hooks/thrift-sessionend-audit.yaml`.
- Use the YAML hook schema (one event per file, command + matcher in YAML).
- Append-only: do not overwrite existing files with the same names. Use a
  `thrift-` filename prefix sentinel for revert.

**`store_memory` as durable summariser scratch.** Copilot's `store_memory`
tool (per v0.0.380+ changelog) gives durable per-repo key-value storage.
Use it as:
- Summariser output destination: `store_memory(scope: repository, key:
  "thrift/summary/<ts>", value: <summary-text>)`. Instead of writing to
  `.thrift/summaries/*.md`, the summary lives in Copilot's own memory.
  Upside: survives across sessions natively; downside: not git-trackable.
- State persistence: `.thrift-state.json` mirror in `store_memory` so
  audit reconstruction works even if the file is wiped.

**Phase translations.**

| Phase | CC implementation | Copilot translation |
|---|---|---|
| 0 preflight | Detect context-mode + CC | Detect context-mode-copilot + Copilot version + `store_memory` availability |
| 1 config | `.thrift.json` portable | Same |
| 2 instrument | `.claude/settings.local.json` patch | Render YAML hook files into `.github/hooks/` |
| 3 summariser | Notification + file write | `store_memory` write + GitHub-style notification (Copilot's native notification channel — TBD) |
| 4 cache prime | Anthropic no-op call | Copilot intermediates OpenAI; likely NOT effective. Document as a no-op + warn. Phase becomes opt-in only. |
| 5 audit | Local file | Local file + `store_memory` mirror |

**Cost-estimator subclass.** `cost-estimator-copilot.mjs`. Copilot may not
expose token counts at all (it intermediates the underlying model). If so,
audit savings become heuristic only — document this prominently.

**Estimated work**: ~1.5 weeks. Hooks are simpler (YAML) but cache prime
likely needs to be disabled-by-default and `store_memory` integration is
new ground.

### Gemini CLI — `harness-thrift-gemini`

**Hook system.** Gemini extensions declare hooks in
`gemini-extension.json`:
```json
{
  "hooks": {
    "BeforeTool": [...],
    "AfterTool": [...]
  }
}
```
Phase 2 instrument patches `gemini-extension.json` (or
`.gemini/extensions/thrift/gemini-extension.json` if scoped). Append-only,
sentinel-based revert as on CC.

**Phase translations.**

| Phase | CC implementation | Gemini translation |
|---|---|---|
| 0 preflight | Detect context-mode + CC | Detect context-mode-gemini + Gemini CLI version; verify `BeforeTool` hook surface present |
| 1 config | `.thrift.json` portable | Same |
| 2 instrument | `settings.local.json` patch | Patch `gemini-extension.json` `hooks` block |
| 3 summariser | Notification + file write | File write + suggest `/compress` (Gemini's compact equivalent) |
| 4 cache prime | Anthropic no-op | **Special handling required** — Vertex context caching has minimum token thresholds (currently ~32k tokens for `gemini-1.5-pro`, larger for newer models). Sub-threshold primes are pure cost. Phase 4 must compute whether the current session has accumulated enough context for caching to apply; if not, skip the prime. |
| 5 audit | Local file | Local file with Vertex rate table |

**Vertex / Gemini API specifics.**
- Cache is "context caching" via Vertex API. Pricing tier:
  per-1M cached-input tokens billed at a discounted rate vs uncached input.
  Storage is *separately* billed per cache hour. Cache-prime cost model
  thus has a *time component* the CC version lacks.
- Free-tier rate limits (per Gemini API docs as of 2026-05) make cache
  priming counterproductive on free accounts — the prime call consumes
  request budget. Detect tier via `gemini auth list` or config flag;
  disable Phase 4 on free tier with a warning.

**Cost-estimator subclass.** `cost-estimator-gemini.mjs` with Vertex /
Gemini rate table (`gemini-2.0-pro`, `gemini-2.0-flash`, etc.), plus a
cache-storage-time term in the baseline formula.

**Summariser model.** No haiku equivalent; use `gemini-flash` (cheapest
Gemini model) for the summariser call.

**Estimated work**: ~2 weeks. Heaviest port due to:
- Custom rate table with storage-time term.
- Vertex API quirks (minimum cache threshold, free-tier guardrails).
- New summariser model integration (`gemini-flash`).
- `BeforeTool` / `AfterTool` event-shape verification.

### Cursor — `harness-thrift-cursor`

**No programmatic hooks.** Cursor's automation surface is rule-based
(`.cursor/rules/*.mdc`). Thrift on Cursor becomes **advisory-only**:

- Phase 2 instrument writes `.cursor/rules/thrift.mdc` containing rule
  text such as:
  > Before invoking `run_shell_command`, consider context-mode's
  > `ctx_execute` for any command expected to produce >20 lines of
  > output.
  > Every ~25 turns or after significant tool output, consider asking
  > the user if a summarisation pass would help.
- The planner is expected to obey these rules. There is no enforcement.

**Phase translations.**

| Phase | CC implementation | Cursor translation |
|---|---|---|
| 0 preflight | Detect context-mode + CC | Verify Cursor + `.cursor/` directory exists |
| 1 config | `.thrift.json` portable | Same (read by the rule itself if at all) |
| 2 instrument | Patch settings.local.json | Write `.cursor/rules/thrift.mdc` (idempotent overwrite with sentinel header) |
| 3 summariser | Notification + file write | Rule includes "if approaching context limit, ask the user to summarise the current conversation and start fresh" |
| 4 cache prime | Anthropic no-op | **N/A** — Cursor exposes no cache surface. Phase removed. |
| 5 audit | Local file | Best-effort: `.cursor/rules/thrift.mdc` includes a "before ending a long session, write a one-page recap to `docs/thrift/cursor-recap-<date>.md`" rule. Heuristic-only; no metrics. |

**No cost-estimator subclass** — Cursor doesn't surface token counts at
all in its planner output. Audit becomes a textual recap, not a
quantified savings report.

**Estimated work**: ~5 days. Smallest port. Deliverable is a single
`.cursor/rules/thrift.mdc` template plus a minimal `SKILL.md` describing
when to install it. No lib code worth porting.

## Common shared prerequisites

Before porting harness-thrift to any platform, these must land (or be
formally accepted as missing and worked around):

1. **Per-platform context-mode port.** harness-thrift's coerce
   recommendations assume `ctx_execute` / `ctx_execute_file` MCP tools
   exist for the target CLI. Without context-mode-{codex,copilot,gemini,cursor}
   the coerce hooks degrade to pure observers with no actionable
   suggestion. Each port should detect context-mode presence in Phase 0
   and document the degraded mode.

2. **Per-platform cost-estimator subclass.** Each platform needs its own
   rate table file (`cost-estimator-<platform>.mjs`) wrapping the same
   `estimate({tokensInUncached, tokensInCached, tokensOut, model})` contract
   defined in `plugins/harness-thrift/skills/thrift/lib/cost-estimator.mjs`.
   Subclasses must:
   - Pick the right SUPPORTED_MODELS for the platform.
   - Use the platform's actual cache-read multiplier (0.1× Anthropic, 0.5×
     OpenAI, varies for Gemini, N/A for Cursor).
   - Add platform-specific terms (storage time on Gemini; nothing on the
     others).

3. **Per-platform settings-patcher.** The CC version
   (`lib/settings-patcher.mjs`) edits JSON. Codex needs TOML; Copilot
   needs multi-file YAML directory; Gemini needs nested-JSON in
   `gemini-extension.json`; Cursor needs single-file `.mdc` overwrite.
   Each port needs its own patcher module honoring the same append-only,
   sentinel-revert contract.

4. **Summariser portability.** `lib/summariser.mjs` already follows
   Option C (deferred prompt emission) — it writes a summary prompt to a
   file and does not call any model SDK directly. This is portable as-is.
   The *delivery* of the summary path (Notification on CC, stderr on
   Codex, `store_memory` on Copilot, `/compress` hint on Gemini, rule
   reminder on Cursor) differs per platform but the summary content is
   identical.

5. **Threshold-evaluator + config-loader portability.** Both are pure
   functions over JSON; portable as-is. No platform-specific changes.

6. **Hook-precedence per platform.** Each platform may have its own hook
   ordering rules. The CC spike documented array-order-first-to-last;
   Codex, Copilot, Gemini each need their own ordering verification.
   Spike per platform before implementation (estimated ~0.5d each).

## Decomposition into per-platform sub-projects

| Sub-project | Scope | Prereqs | Est. effort |
|---|---|---|---|
| `harness-thrift-cursor` | `.cursor/rules/thrift.mdc` template + SKILL.md describing install + advisory-only operation. No lib code. No metrics. | None (Cursor needs no context-mode equivalent for advisory mode). | **~5 days** |
| `harness-thrift-copilot` | YAML hook directory (3 files), `store_memory` integration for summariser scratch, `cost-estimator-copilot.mjs` subclass, Phase 4 disabled-by-default. | context-mode-copilot (optional, degrades gracefully). Copilot hook-ordering spike. | **~1.5 weeks** |
| `harness-thrift-codex` | TOML patcher for `codex-config.toml`, summariser-via-stderr delivery, `cost-estimator-codex.mjs` (OpenAI rates), session-priming Phase 4 spike. | context-mode-codex (optional). Codex `exec_command` cache-semantics spike. Codex hook-ordering spike. | **~1.5 weeks** |
| `harness-thrift-gemini` | `gemini-extension.json` hooks patcher, `cost-estimator-gemini.mjs` with storage-time term, free-tier detection, sub-threshold cache-prime gating, `gemini-flash` summariser model integration. | context-mode-gemini (optional). Vertex caching API research. Free-tier detection mechanism. Gemini hook-ordering spike. | **~2 weeks** |

Each sub-project follows its own brainstorm → spec → plan → implementation
cycle. **Do not attempt more than one per session.**

## What this iteration does NOT deliver

- No `harness-thrift-<platform>` plugins. Zero implementation.
- No per-platform `cost-estimator-*.mjs` subclasses.
- No per-platform settings-patcher modules (TOML / YAML / Vertex JSON).
- No live verification of hook-firing order on Codex, Copilot, or Gemini.
- No verification that `store_memory` (Copilot) accepts the payload
  shapes summariser produces.
- No measurement of Vertex context-caching minimum-token thresholds
  against real Gemini sessions.
- No marketplace updates. The four future plugins are not registered.

## Recommended next session(s)

Order of attack (highest value first):

1. **Cursor** — least effort, lowest risk. Ship a single `.mdc` rule
   template; Cursor users get advisory thrift patterns immediately. Sets
   the floor for "what does thrift mean when there are no programmatic
   hooks?" — useful reference for the harder ports.

2. **Copilot** — `store_memory` is genuinely novel territory for the
   harness family; getting one port that exercises it informs future
   plugins. YAML hooks are simpler than CC's JSON arrays. Phase 4
   (cache prime) being disabled-by-default lets us defer the
   intermediation question.

3. **Codex** — needs a session-cache-semantics spike before committing.
   TOML patcher is moderate work. OpenAI rate table is the easy part.

4. **Gemini** — postpone. Vertex caching API + free-tier guardrails +
   storage-time cost model + new summariser model = highest risk and
   biggest "TBD" surface. Ship the easier three first, then tackle
   Gemini with lessons learned.

Mirrors the agent-all decomposition's "Cursor first, Gemini last"
ordering for the same reasons: smaller ports first, learn, then attack
the platform with the most quirks.

## Cross-cutting concerns

### Shared rate-table maintenance

Five rate tables (Claude on CC, OpenAI on Codex, OpenAI-via-Copilot,
Vertex/Gemini, N/A on Cursor) need quarterly refresh against vendor
pricing pages. Recommendation: a single `lib/rates/` directory at the
`harness-thrift` package root containing per-platform JSON rate files
that each port's `cost-estimator-*.mjs` imports. Updating one file
updates all ports.

```
plugins/harness-thrift/skills/thrift/lib/rates/
├── anthropic.json          # used by harness-thrift (CC)
├── openai.json             # used by harness-thrift-codex
├── copilot.json            # used by harness-thrift-copilot (best-effort)
└── gemini.json             # used by harness-thrift-gemini
```

Each per-platform plugin imports the relevant JSON via a relative path
into the canonical harness-thrift skill (or vendors a copy if symlinking
across plugin boundaries is not supported by the marketplace). Decision
deferred until first port implementation.

### Per-platform cost-estimator subclass strategy

Two options:

- **A. Inheritance / mixin.** Each `cost-estimator-<platform>.mjs`
  imports the CC base estimator and overrides the rate table + cache
  multiplier. Cleanest dependency graph but requires either
  monorepo-style shared imports or vendoring.
- **B. Independent copies.** Each per-platform plugin contains a
  self-contained `cost-estimator.mjs` with its own rate table inline.
  Higher duplication but no cross-plugin dependency.

**Recommendation**: Option B for v1 (avoid cross-plugin import
fragility); revisit if maintenance burden grows. The estimator function
is ~50 lines — duplication cost is small relative to the dependency-graph
cost of getting cross-plugin imports right across four package types.

### Context-mode dependency surface

Each port has an *optional* dependency on the matching context-mode plugin
for the target CLI:
- harness-thrift (CC) → context-mode (CC)
- harness-thrift-codex → context-mode-codex
- harness-thrift-copilot → context-mode-copilot
- harness-thrift-gemini → context-mode-gemini
- harness-thrift-cursor → (none — Cursor advisory mode)

Where the matching context-mode port does not exist, harness-thrift on
that platform still functions in degraded mode (summariser + audit work;
coerce hooks observe but suggest nothing actionable). Each port's Phase
0 must detect this and warn clearly. This dependency surface is documented
but not enforced via `plugin.json` declarations in v1 — too brittle for
the marketplace's current state.

### Summariser model availability per platform

| Platform | Cheap summariser model | Notes |
|---|---|---|
| Claude Code | `claude-haiku-4-5-20251001` | $0.80/M in, $4/M out |
| Codex | `gpt-5-nano` or equivalent | Verify availability via Codex's `model.list` |
| Copilot | (intermediated; cannot select directly) | Copilot picks; summariser cost = whatever Copilot uses |
| Gemini | `gemini-2.0-flash` | Cheapest Gemini family member; free tier available |
| Cursor | N/A | Advisory only; user runs summariser manually |

Each port's `phases/3-summariser.md` must document the chosen model and
the rationale.

## Out of scope (this decomposition)

- Implementation of any per-platform port.
- The base harness-thrift (CC) plugin's own remaining v1 work (already
  scoped in `2026-05-18-harness-thrift-design.md`).
- Cross-platform shared-config standardisation (whether `.thrift.json`
  should live at `./` or `.harness/thrift.json` or platform-specific
  paths). Defer until first port implementation surfaces the friction.
- Marketplace registration for the four future plugins.
- CI/test scaffolding across the per-platform plugins.
- A unified `/thrift status` command that works across all five
  plugin variants from a single invocation.
- ML-based platform-specific summariser tuning (heuristic suffices for v1
  on every platform).
- Custom prompt cache layers for any platform (we use vendor-provided
  caching on each; we do not implement our own).

## Marketplace entries (when implemented)

Not delivered in this iteration. For reference, future entries would
follow the harness-floor sibling pattern:

```json
{
  "name": "harness-thrift-codex",
  "source": "./plugins/harness-thrift-codex",
  "description": "Theme B for Codex CLI — TOML-hook-based thrift patterns, OpenAI rate table, session-priming variant of Phase 4"
},
{
  "name": "harness-thrift-copilot",
  "source": "./plugins/harness-thrift-copilot",
  "description": "Theme B for Copilot CLI — YAML hooks under .github/hooks/, store_memory summariser scratch, Phase 4 disabled by default"
},
{
  "name": "harness-thrift-gemini",
  "source": "./plugins/harness-thrift-gemini",
  "description": "Theme B for Gemini CLI — gemini-extension.json hook patcher, Vertex rate table with storage-time term, free-tier guardrails"
},
{
  "name": "harness-thrift-cursor",
  "source": "./plugins/harness-thrift-cursor",
  "description": "Theme B for Cursor — advisory-only via .cursor/rules/thrift.mdc; no programmatic hooks, no metrics"
}
```

These are sketches only — actual registration happens in each
sub-project's implementation iteration.
