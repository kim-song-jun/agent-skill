# Phase 0 — Preflight (Gemini)

## Steps

1. Confirm `pwd` is a git repo (recommended for state file + audit
   reproducibility). If not: warn but continue — thrift works without git.
2. Confirm `gemini` binary in PATH:
   `run_shell_command("command -v gemini")` exit 0. If absent: abort with
   "Gemini CLI not found — install per https://ai.google.dev/gemini-api/docs/cli".
3. Verify the `BeforeTool` / `AfterTool` hook surface is present in this
   Gemini release:
   - Read `~/.gemini/settings.json`. If absent, create with `{"hooks": {}}`.
   - If `hooks` block exists but is not an object: abort.
   - Cross-check Gemini CLI version supports BeforeTool/AfterTool naming
     (Gemini CLI ≥ v0.5 per docs as of 2026-05). On older versions, abort
     with upgrade instructions.
4. Detect context-mode-gemini availability:
   - Look for `mcpServers["context-mode"]` in `~/.gemini/settings.json`.
   - If absent: warn — contextMode coercion suggestions will have no
     recipient. Other thrift features still work (telemetry, summariser,
     cache, audit).
5. Detect Vertex tier:
   - Read `.thrift.json` if present and check `cache.vertex.tier`.
   - If config absent (will be seeded in Phase 1): defer tier check until
     Phase 4.
   - Optionally: `run_shell_command("gemini auth list")` to detect tier
     directly. v1 prefers explicit config — this auto-detect path is best-effort
     and may be unavailable in non-interactive contexts.
6. Detect existing hook entries in `~/.gemini/settings.json` under
   `hooks.BeforeTool` / `hooks.AfterTool` / `hooks.SessionStart`. Record
   counts for the append-only patcher in Phase 2.
7. If `.thrift.json` missing AND `--force` not passed: tell the user
   Phase 1 will seed it from defaults.
8. Push `{phase: 0, completedAt: "<iso>", contextModeAvailable: <bool>,
   existingHookCounts: {...}, vertexTier: "<paid|free|unknown>"}` to
   `.thrift-state.json`.

## Output to user

```
Thrift-gemini preflight OK.
  gemini CLI:        <version>
  context-mode:      <available|unavailable>
  existing hooks:    BeforeTool=<n> AfterTool=<n> SessionStart=<n>
  vertex tier:       <paid|free|unknown>
  config:            <found|will-seed>
```

## Notes vs CC

- Gemini's hook surface is **single JSON file** at `~/.gemini/settings.json`
  (user-scope), NOT per-project `.claude/settings.local.json`. Phase 2 must
  warn the user that hooks will affect all Gemini sessions, not just this
  project. A `.gemini/extensions/thrift/gemini-extension.json` per-project
  scoping path exists per Gemini docs but is not yet stable as of 2026-05.
- No `SessionEnd` event — Phase 5 audit is invoked on next SessionStart
  (reading the prior session's state) OR via manual `/thrift-gemini audit`.
