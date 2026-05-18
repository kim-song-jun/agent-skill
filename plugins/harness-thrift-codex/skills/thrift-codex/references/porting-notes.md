# harness-thrift-codex — porting notes

## Why TOML and not JSON?

Codex's user-global config lives at `~/.codex/config.toml`. Per the
existing `harness-builder-codex` and `harness-floor-codex` templates,
hooks are registered under a top-level `[hooks]` section with TOML's
array-of-tables syntax (`[[hooks.pre_tool_use]]`, etc.). This is
explicitly different from Claude Code's `.claude/settings.local.json`
which uses a project-local JSON array structure.

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
3. **Append-only suffices.** Our snippets are `[[hooks.<event>]]`
   array-of-tables, which TOML allows in any number, anywhere in the
   file (per spec). Appending to EOF is structurally valid regardless
   of what's above.
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
- One `[hooks]` section per file. Codex permits multiple `[[hooks.X]]`
  array-tables but the `[hooks]` header itself appears at most once
  in idiomatic configs. We don't validate this; if violated, our
  append still works because we use `[[hooks.X]]` array-of-table
  syntax which doesn't require a preceding `[hooks]` header.

## Open questions (deferred to live-validation iterations)

1. **Hook event names.** Are Codex's events actually `pre_tool_use`,
   `post_tool_use`, `session_start`, `session_end`? The
   `harness-builder-codex` templates use snake_case event names per
   the spec, but we have no live Codex CLI to confirm. If the actual
   names differ, the templates need a one-line search/replace.
2. **`matcher` semantics for shell hooks.** The CC matcher matches
   tool *names* (e.g. `"Bash"`); on Codex it presumably matches
   `"shell_command"`. The patcher snippets use `"shell_command"` —
   verify against live Codex behaviour.
3. **`session_end` reliability.** Does Codex fire `session_end` on
   Ctrl-C or only on graceful exit? CC's `SessionEnd` fires on both
   per the hook-precedence spike. Phase 5 audit's "always runs"
   guarantee depends on reliable session_end.
4. **Stderr → TUI surface.** Phase 3's summariser advisory leans on
   Codex routing hook stderr to the TUI as system reminders. Verified
   in the agent-builder-codex docs but not load-tested.
5. **Cheap-summariser model.** `gpt-5-nano` is a placeholder. The
   actual cheapest model exposed by Codex's session may differ; needs
   `codex models list` (or equivalent) check.
6. **`exec_command` cache reuse.** The Phase 4 cache-prime mechanic
   assumes `exec_command` can re-enter the same session and benefit
   from OpenAI's prompt cache. If Codex spins a fresh session per
   call, the prime is pure cost. Spike needed before flipping
   `cache.enabled = true` to default.

## Differences from `harness-thrift` (CC source-of-truth)

| Aspect | CC | Codex |
|---|---|---|
| Hook config | `.claude/settings.local.json` | `~/.codex/config.toml` |
| Hook config format | JSON object with `hooks: {Event: [...]}` arrays | TOML `[[hooks.<event>]]` array-of-tables |
| Hook event names | PascalCase: `PreToolUse`, `SessionEnd`, ... | snake_case: `pre_tool_use`, `session_end`, ... |
| Notification channel | `Notification` hook | stderr + `~/.codex/notifications/*.md` |
| Summariser model | `claude-haiku-4-5-20251001` | `gpt-5-nano` (TBD) |
| Cache-read multiplier | 0.1× input (Anthropic) | 0.5× input (OpenAI, average) |
| Cache-prime API | Anthropic SDK direct call | `exec_command` session reuse (best-effort) |
| Cache-hit observability | Response metadata gives counts | Not exposed via Codex; audit savings are heuristic |
| Patcher contract | JSON parse + mutate + serialize | Text-only append + sentinel-removal |

## Estimated work

Per the decomposition: **~1.5 weeks** (this scaffold satisfies
roughly the "TOML patcher + OpenAI rate table + phase docs" subset;
remaining work is the live spikes listed above + summariser-via-stderr
load-test on a real Codex install).
