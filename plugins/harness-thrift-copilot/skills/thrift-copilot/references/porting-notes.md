# harness-thrift-copilot — porting notes

Per-platform port of `harness-thrift` (Claude Code) → GitHub Copilot
CLI. Implements the Copilot section of
`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`.

## Why Copilot is harder than visual-qa-copilot

`visual-qa-copilot` was a config-only scaffold (templates + SKILL.md).
`harness-thrift-copilot` is a real implementation because all 6 phases
require Copilot-specific primitives:

- **Hooks** live in `.github/hooks/*.json` (one file per event),
  *not* in a single `settings.local.json`. This needs a different
  patcher (multi-file, append-only, sentinel-revert).
- **State persistence** is file-backed by default. A host-provided private
  memory adapter can mirror state, but current public Copilot CLI docs do not
  expose a memory primitive for this harness.
- **Cache prime (Phase 4)** is *disabled by default* because Copilot
  intermediates the model layer and priming effectiveness is unmeasurable.
- **Cost estimation** uses an OpenAI rate table (`gpt-5`, `gpt-5-nano`,
  etc.) instead of Anthropic's. All rates are marked `assumed; verify
  against current OpenAI pricing` — Copilot doesn't expose per-call
  token counts to the user, so estimates are upstream-rates, not
  billed cost.

## Primitive map (Copilot ↔ Claude Code)

| Action | Claude Code (`harness-thrift`) | Copilot (`harness-thrift-copilot`) |
|---|---|---|
| Hook registration | single `.claude/settings.local.json` JSON array | one `.github/hooks/thrift-<event>.json` file per event |
| PreToolUse event | `PreToolUse` | `preToolUse` (camelCase) |
| PostToolUse event | `PostToolUse` | `postToolUse` |
| SessionStart event | `SessionStart` | `sessionStart` |
| SessionEnd event | `SessionEnd` | `agentStop` (Copilot's closest equivalent) |
| Bash matcher | `Bash` | `bash` / `powershell` |
| Read matcher | `Read` | `view` |
| Summariser delivery | file + `Notification` hook | file + stderr `<system-reminder>` (no `/compact` equivalent); optional memory adapter |
| State persistence | file only | file only by default; optional host memory adapter mirror |
| Cost estimator | Anthropic rates (`claude-opus-4-7`, …) | OpenAI rates (`gpt-5`, `gpt-5-nano`, …); marked `assumed` |
| Cache prime | enabled-by-default (≥30min sessions) | **disabled-by-default**; opt-in requires `cache.intermediationWarning = false` |
| Summariser model | `claude-haiku-4-5-20251001` | `gpt-5-nano` (hint only — Copilot picks the actual model) |

## Key design decisions

### 1. One JSON file per event under `.github/hooks/`

Mirrors `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/`
convention. The patcher in `lib/settings-patcher.mjs` writes
`.github/hooks/thrift-<event>.json` rather than mutating a single
multi-event file. Pro: matches existing Copilot convention; merge
conflicts isolated per event. Con: 4 files to manage instead of 1.

> **TODO: verify Copilot's exact event-name casing (`preToolUse` vs
> `pre_tool_use` vs `PreToolUse`) against live CLI.** We follow
> camelCase per `harness-builder-copilot`'s existing JSON templates.

### 2. File-backed state with optional memory adapter

The shipping Copilot port uses `.thrift-state.json`,
`.thrift/summaries/*.md`, and `.agent-skill/reports/thrift/*.md` as the public
contract. This matches the documented Copilot CLI surface and avoids depending
on private tools.

The bridge in `lib/store-memory-bridge.mjs` remains available for hosts that
provide a private memory adapter. On any error it transparently falls back to
`.thrift/store-memory-fallback/<scope>/<key>.json`. The fallback path keeps the
bridge usable in sandbox/offline runs and in tests.

The invoker contract is intentionally harness-local:
`({action: "set"|"get"|"list"|"delete", scope, key, value?}) → {ok, value?}`.

### 3. Phase 4 disabled by default + force-opt-in flag

`cache.enabled = false` AND `cache.intermediationWarning = true` is the
default. To opt in, the user must set BOTH `cache.enabled = true` AND
`cache.intermediationWarning = false`. This forces an explicit
acknowledgement that priming on Copilot's intermediated model layer is
not observably effective. The `sessionStart` hook records the skip /
opt-in status in state so the audit captures it.

### 4. Independent cost-estimator (no cross-plugin imports)

Per the decomposition spec's "Option B" recommendation, each
per-platform port carries its own `cost-estimator.mjs` with an
inline rate table. We do **not** import from `harness-thrift`'s CC
estimator. Pro: zero cross-plugin coupling, plugin can be installed
standalone. Con: rate-table updates must be applied to each port.

Note: `lib/cost-estimator.mjs` exports `RATE_TABLE_PROVENANCE` with
`source: "assumed"` and `lastVerifiedAt: null`. Update both fields
when verifying against live OpenAI pricing.

### 5. `agentStop` for audit instead of `SessionEnd`

Copilot CLI's audit-equivalent event is `agentStop` (per the
`plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/agentStop.json`
stub). The CC port's `SessionEnd` becomes `agentStop` here. Tests
verify the filename + matcher mapping.

## Known unknowns

1. **Memory adapter payload-size limits.** Private adapters may enforce size
   caps or eviction policy. If the state mirror grows beyond a per-key limit,
   the bridge will error and fall back to file. The state schema is
   intentionally small (sums + arrays, no full transcripts) to mitigate.

2. **Memory adapter GC.** If an adapter evicts a key mid-run, the bridge
   re-reads from file fallback transparently. No mid-run synchronisation
   protocol — last write wins.

3. **Hook payload schemas.** `preToolUse`/`postToolUse`/`agentStop`
   stdin payload shapes are assumed to match Claude Code's (e.g.
   `payload.tool_input.command`, `payload.tool_response.output`). Live
   Copilot CLI may use different field names; the hook scripts fall
   back gracefully (`process.exit(0)` on any parse error).

4. **Per-call token counts.** Copilot doesn't surface per-call
   `inputTokens` / `outputTokens` in public tool responses.
   Cost estimation falls back to byte→token heuristic
   (`estimateTokensFromBytes`). If a future Copilot release exposes
   real counts, swap the
   heuristic for the real values in `metrics-collector.recordTurn`.

5. **`agentStop` exit-fire reliability.** Whether `agentStop` reliably
   fires on Ctrl-C / signal-kill / OOM is unverified. The audit hook
   is best-effort; users can manually run `/thrift-copilot audit` to
   regenerate.

6. **Hook ordering precedence.** Per the decomposition spec, each
   platform needs a hook-ordering spike. The CC spike documented
   array-order-first-to-last. Copilot's ordering across multiple JSON
   files in `.github/hooks/` is unverified — needs spike before
   relying on relative ordering between thrift hooks and
   context-mode-copilot hooks.

## Future work

- Spike optional memory adapter payload size limits + GC policy.
- Spike `agentStop` event semantics on signal-kill.
- Wire to `context-mode-copilot` once that port exists — the coercion
  suggestions in pretool hooks are no-ops until `ctx_execute_file`
  has a Copilot recipient.
- If Copilot exposes per-call token counts, swap the byte heuristic.
- Verify event-name casing against live Copilot CLI; rename hook
  files if the convention is snake_case or PascalCase.
- Refresh OpenAI rate table after verifying against current pricing
  page; update `RATE_TABLE_PROVENANCE.lastVerifiedAt`.
