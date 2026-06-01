# thrift-gemini — porting notes

This document records the per-phase deltas from the Claude Code source
(`plugins/harness-thrift/skills/thrift/`) to the Gemini port.

## Phase contract preserved

| Aspect | Claude Code | Gemini |
|---|---|---|
| Config file | `.thrift.json` at project root | Same (portable) |
| Config schema | `summariser`/`cache`/`contextMode`/`audit` | Same + new `cache.vertex` sub-block |
| State file | `.thrift-state.json` | Same |
| Hook file | `.claude/settings.local.json` (project) | `~/.gemini/settings.json` (user-scope) |
| Pre-tool event | `PreToolUse` | `BeforeTool` |
| Post-tool event | `PostToolUse` | `AfterTool` |
| Session-start event | `SessionStart` | `SessionStart` |
| Session-end event | `SessionEnd` | **none** — Phase 5 fires on next SessionStart |
| Bash matcher | `Bash` | `run_shell_command` |
| Read matcher | `Read` | `read_file` |
| Read input field | `tool_input.file_path` | `tool_input.absolute_path` |
| Compact equivalent | `/compact` | `/compress` |
| Summariser model | `claude-haiku-4-5-20251001` | `gemini-flash` |
| Cache primitive | Anthropic prompt cache (5-min TTL) | Vertex context caching (hours-scale, billed per cache-hour) |
| Cache-read rate | 0.1× input | Advisory rate-table value, approximately 0.25× input |
| Cache-write rate | (implicit; Anthropic auto-writes) | Advisory rate-table value, approximately 1.0× input on first read |
| Storage cost | none | Advisory rate-table value, per cache-hour per 1M tokens |
| Min-token threshold | none (caches any size) | Advisory threshold from the rate table |
| Free-tier handling | n/a | ROI gate refuses to prime on free tier |

## Phase-by-phase deltas

### Phase 0 — Preflight
- New: Gemini CLI version check (BeforeTool/AfterTool requires v0.5+).
- New: Vertex tier detection (config or `gemini auth list`).
- Removed: `ctx_stats` MCP check (substitute with `mcpServers["context-mode"]` presence test).

### Phase 1 — Config
- New `cache.vertex` sub-block: `{minTokenThreshold, storageTimeHours, tier}`.
- `summariser.model` default changes from `claude-haiku-4-5-20251001` to `gemini-flash`.
- `audit.estimateBaseline` default changes from `"naive-claude-code"` to `"naive-gemini"`.

### Phase 2 — Instrument
- Patches `~/.gemini/settings.json` (user-scope) instead of `.claude/settings.local.json` (project-scope). **Warn the user prominently.**
- Hook entry shape: `{matcher?, command}` flat (Gemini), not `{matcher?, hooks: [{type, command}]}` (CC).
- Event names: `BeforeTool` / `AfterTool` / `SessionStart` (no `SessionEnd`).
- Matcher names: `run_shell_command` / `read_file`.

### Phase 3 — Summariser
- Model switch to `gemini-flash`. Heuristic summariser unchanged (no SDK call in v1).
- Compact-hint emits `/compress` instead of `/compact`.

### Phase 4 — Cache prime
- Three new skip conditions (in priority order):
  1. `cache.vertex.tier === "free"` — refuses to prime.
  2. accumulated tokens < `cache.vertex.minTokenThreshold` — Vertex won't create a cache entry.
  3. Original CC checks (session length, expected pauses).
- New cost component: `storagePerHour × tokensCached × storageTimeHours`.
- New payback formula in `lib/vertex-cache-eval.mjs`:
  `paybackHits = ceil((cacheWrite + storageCost × storageTimeHours) / (input - cacheRead))`.

### Phase 5 — Audit
- Triggered on next SessionStart (not SessionEnd) because Gemini has no SessionEnd event.
- New `vertexStorageUSD` line in the report.
- New `degradedCallCount` line — counts calls where min-token gate downgraded "cached" tokens to uncached.

## Open questions

1. Does Gemini CLI surface per-call cache-hit-rate in response metadata? If not, savings are heuristic.
2. Does the user-scope `~/.gemini/settings.json` patcher need a per-project override path (`.gemini/extensions/thrift/`)? Per current Gemini docs the extension-scoped path exists but stability is unverified.
3. Verify `BeforeTool` / `AfterTool` event names against a live Gemini CLI ≥ v0.5 release. If event names changed in a recent release, update `lib/settings-patcher.mjs` `GEMINI_HOOK_EVENTS`.
4. Refresh Vertex pricing values (`lib/cost-estimator.mjs` `RATES`) against Google's pricing page during release audits.
5. Free-tier detection — currently relies on explicit `cache.vertex.tier` config. Future: parse `gemini auth list` output.

## Subprocess / lifecycle risks

- **User-scope hook surface.** Patching `~/.gemini/settings.json` affects all Gemini sessions, not just this project. Mitigation: prominent warning in Phase 2 output; sentinel-based revert via `/thrift-gemini uninstall`.
- **Session boundary detection.** Without SessionEnd, audits run lazily on next SessionStart. If a user never starts another session, no audit is written until manual `/thrift-gemini audit`. Acceptable for v1.
- **Cache cost surprise.** Storage cost runs in the background even when no calls happen. Phase 4 ROI gate's `storageTimeHours` parameter caps expected storage; users should set `cache.enabled = false` between long-running sessions.

## Future work

- v2 programmatic `/compress` invocation when Gemini exposes a compact API.
- v2 `gemini-flash` SDK summariser integration once a stable Node SDK ships.
- Per-project hook scoping via `.gemini/extensions/thrift/gemini-extension.json` once verified stable.
- Auto-detect Vertex tier from `gemini auth list`.
- Shared rate-table directory (`plugins/harness-thrift/skills/thrift/lib/rates/gemini.json`) per the decomposition spec's "Cross-cutting concerns" section.
