# wiki-codex — porting notes

## Why PreToolUse first-call instead of SessionStart

Codex does support a `SessionStart` command hook event. However, the wiki's
CC `SessionStart` digest is not a pure "on startup" event — in practice it
needs to fire exactly once per session, output a status line visible to the
model before any work begins, and then be completely suppressed for the rest
of the session.

Spec decision 7 locks the wiki digest as a **PreToolUse first-call hook**:

> Codex near-native (live-CLI verified) | `.codex/skills/wiki-*` +
> PreToolUse first-call digest

The sentinel-based PreToolUse approach provides stronger "exactly once"
semantics than a SessionStart hook in this context:

1. **Sentinel-guarded suppression.** After the first tool call, a file
   `.wiki/.session-digest-<sessionId>` is written. Every subsequent
   PreToolUse invocation finds the sentinel and exits 0 in under a
   millisecond — no index read, no output.

2. **Session ID from hook payload.** The Codex PreToolUse payload carries
   `session_id` (verified in live CLI). Falling back to
   `process.env.CODEX_SESSION_ID ?? "default"` if absent.

3. **Matcher = ".*".** The hook fires on the first tool call regardless of
   which tool is invoked. The `matcher = ".*"` is intentionally broad but
   is safe because the sentinel guard makes it a no-op after the first call.

## Why self-contained hook body (no lib import)

The PreToolUse digest hook body (`.mjs.hbs`) is rendered into the target
project's `.codex/hooks/` directory. This is a DIFFERENT directory from
`.codex/skills/wiki/lib/` where `wiki-index.mjs` lives after install.

A relative import like `../lib/wiki-index.mjs` from `.codex/hooks/` would
resolve to `.codex/lib/wiki-index.mjs`, which does not exist. This is
exactly the `ERR_MODULE_NOT_FOUND` class that thrift-codex hooks avoid by
being self-contained.

The `bin/wiki-session-digest.mjs` inside the skill dir CAN import
`../lib/wiki-index.mjs` because it lives adjacent to the lib inside
`.codex/skills/wiki/`. This is a separate artifact kept for manual invocation
(`run /wiki status` style). The hook body is the inline self-contained one.

## Source–target mapping

| Component | CC source | Codex artifact |
|---|---|---|
| Executable lib (compile/route logic) | `plugins/harness-floor/skills/wiki/lib/wiki-index.mjs` | `plugins/harness-floor-codex/skills/wiki-codex/lib/wiki-index.mjs` (vendored verbatim via sync-lib) → installed to `.codex/skills/wiki/lib/wiki-index.mjs` |
| In-skill digest binary | `plugins/harness-floor/skills/wiki/bin/wiki-session-digest.mjs` | `plugins/harness-floor-codex/skills/wiki-codex/bin/wiki-session-digest.mjs` (authored per-port; uses CODEX_PROJECT_DIR) |
| Session digest hook | `bin/wiki-session-digest.mjs` (CC SessionStart hook) | `templates/hooks/wiki-pretool-first-call-digest.mjs.hbs` (self-contained; rendered to `.codex/hooks/`) |
| Hook registration | CC `.claude/settings.local.json` SessionStart array | `templates/hooks/wiki-pretool-first-call-digest.toml.hbs` → printed by `init.mjs` for manual merge into `config.toml` |
| Phases 1–3 | `plugins/harness-floor/skills/wiki/phases/` | `plugins/harness-floor-codex/skills/wiki-codex/phases/` (per-port; 0-preflight.md has CODEX_PROJECT_DIR) |
| Templates | `plugins/harness-floor/skills/wiki/templates/` | `plugins/harness-floor-codex/skills/wiki-codex/templates/` (verbatim) |

## Port-SSOT: phases are per-host authored

Phase prose files (0-preflight through 3-compile) are hand-authored per-port,
not auto-synced. Phase 0 changes `$CLAUDE_PROJECT_DIR` → `$CODEX_PROJECT_DIR`.
Phases 1–3 are near-verbatim with CC-specific prompt patterns replaced by
Codex `ask_user` / `apply_patch` notes. This matches the `agent-all-codex`
convention where 4-gate.md is per-host.

## Differences from CC wiki

| Aspect | CC (`/wiki`) | Codex (`run /wiki`) |
|---|---|---|
| Session digest | SessionStart hook → `bin/wiki-session-digest.mjs` | PreToolUse first-call hook → `.codex/hooks/wiki-pretool-first-call-digest.mjs` |
| Digest output channel | stdout | stderr (Codex surfaces hook stderr; stdout can interfere with tool flow) |
| Write primitive | Write tool | `apply_patch` |
| Confirm primitive | Inline y/n prompt | `ask_user` |
| Skill location | `.claude-plugin/` (CC native) | `.codex/skills/wiki/` (Codex native) |
| Install config location | `.claude/settings.local.json` | `~/.codex/config.toml` (snippet printed for manual merge) |

## Config.toml registration: print-only, manual merge

The wiki `init.mjs` installer writes the hook files into `.codex/hooks/` and
**prints** a sentinel-bracketed TOML snippet to stdout for the user to merge
into `~/.codex/config.toml` (or the project `.codex/config.toml`) manually.
There is no auto-patch of `config.toml` — the installer never modifies the
file. This matches all other floor-codex buckets (visual-qa, agent-all) which
also print snippets rather than patching config.

## Known nuance: session-id source

The Codex PreToolUse payload `session_id` key has been live-CLI verified.
The fallback chain (`payload.session_id ?? payload.sessionId ??
process.env.CODEX_SESSION_ID ?? "default"`) ensures the sentinel is always
written. If Codex omits a session id entirely, the sentinel falls back to
`.wiki/.session-digest-default` and the digest fires once per project-session
lifetime rather than per session — acceptable conservative behavior.

## References

- CC wiki SKILL.md: `plugins/harness-floor/skills/wiki/SKILL.md`
- Spec decision 7: "Codex near-native (live-CLI verified) — PreToolUse first-call digest"
- sync-lib.mjs: WIKI_INDEX block (verbatim, no transform needed)
