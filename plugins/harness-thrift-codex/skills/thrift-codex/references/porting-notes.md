# harness-thrift-codex — porting notes

## Why TOML and not JSON?

Codex's user-global config lives at `~/.codex/config.toml`. Current
Codex command hooks use TOML array-of-tables such as
`[[hooks.PreToolUse]]` with nested handler tables like
`[[hooks.PreToolUse.hooks]]`. This is explicitly different from Claude
Code's `.claude/settings.local.json`, which uses a project-local JSON
array structure.

The decomposition spec
(`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`)
identifies this as the largest semantic delta of the Codex port.

## Why not use a full TOML library?

We deliberately do NOT pull in a TOML parser. The patcher is text-only,
sentinel-comment-based. Reasoning:

1. **No new runtime dependencies.** Plugins in this marketplace avoid
   `npm install` requirements wherever possible. Pulling `@iarna/toml`
   or `smol-toml` would add 30-100 KB of dependency surface for a
   patch operation that's fundamentally line-oriented.
2. **TOML round-tripping is lossy.** A full parse → mutate → serialize
   cycle reorders keys, drops comments, and normalises whitespace.
   That would surprise users who hand-edit their `config.toml`.
3. **Append-only suffices.** Our snippets are `[[hooks.<Event>]]`
   array-of-tables with nested command-handler tables, which TOML
   allows in any number, anywhere in the file. Appending to EOF is
   structurally valid regardless of what's above.
4. **Sentinel comments are auditable.** A user grepping their
   config.toml for `# thrift:` sees exactly what was patched in.

## TOML patcher assumptions (codified)

The patcher in `lib/settings-patcher.mjs` assumes:

- The user has run `codex` at least once. The patcher refuses to
  create `config.toml` from scratch (too risky without knowing what
  other config the user wants).
- Sentinel lines are *exact*: `# thrift: <name>` (start) and
  `# end thrift: <name>` (end), where `<name>` matches the hook key.
  Whitespace before `#` and around `<name>` is tolerated.
- Snippets being added do NOT themselves contain text that matches
  another snippet's start sentinel (would cause confusion at uninstall).
- No multi-line strings in user content contain literal `# thrift:`
  prefixes that could be mistaken for sentinels. This is exceedingly
  unlikely; we document it rather than guard against it.
- Codex permits multiple `[[hooks.X]]` array-tables. We append complete
  hook and handler tables and do not require a preceding `[hooks]`
  header.

## Release caveats

1. **Stop-event reliability.** Codex currently exposes `Stop` rather
   than a dedicated session-end event. Phase 5 audit may therefore run
   at turn boundaries rather than only at process exit.
2. **Stderr → TUI surface.** Phase 3's summariser advisory leans on
   Codex routing hook stderr to the TUI as system reminders. Verified
   in the agent-builder-codex docs but not load-tested.
3. **Summariser model selection.** `gpt-5-nano` is the packaged default.
   If a local Codex install exposes a different allowed roster, set
   `summariser.model` in `.thrift.json`.
4. **`exec_command` cache reuse.** The Phase 4 cache-prime mechanic
   assumes `exec_command` can re-enter the same session and benefit
   from OpenAI's prompt cache. If Codex spins a fresh session per
   call, the prime is pure cost. Validate locally before flipping
   `cache.enabled = true` to default.

## Differences from `harness-thrift` (CC source-of-truth)

| Aspect | CC | Codex |
|---|---|---|
| Hook config | `.claude/settings.local.json` | `~/.codex/config.toml` |
| Hook config format | JSON object with `hooks: {Event: [...]}` arrays | TOML event tables plus nested command handlers |
| Hook event names | PascalCase: `PreToolUse`, `SessionEnd`, ... | `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop` |
| Notification channel | `Notification` hook | stderr + `~/.codex/notifications/*.md` |
| Summariser model | `claude-haiku-4-5-20251001` | `gpt-5-nano` packaged default; override via `.thrift.json` |
| Cache-read multiplier | 0.1× input (Anthropic) | 0.5× input (OpenAI, average) |
| Cache-prime API | Anthropic SDK direct call | `exec_command` session reuse (best-effort) |
| Cache-hit observability | Response metadata gives counts | Not exposed via Codex; audit savings are heuristic |
| Patcher contract | JSON parse + mutate + serialize | Text-only append + sentinel-removal |

## Validation before relying on runtime hooks

Before treating thrift-codex hooks as enforcement on a specific machine,
run a small Codex CLI smoke test that exercises `PreToolUse`,
`PostToolUse`, `SessionStart`, and `Stop` command hooks. The installer
ships project-local config and TOML snippets; global config patching is
explicit and sentinel-delimited.
