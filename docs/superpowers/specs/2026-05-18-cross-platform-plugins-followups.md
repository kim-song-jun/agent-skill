# Cross-platform plugins — follow-ups

What each platform plugin still needs after the 2026-05-18 MVP.

## All platforms

- Brainstorm/clarification flow inside the host platform (currently each plugin
  asks via plain prompts; should integrate with the platform's native ask-user
  affordance: Codex `ask_user`-equivalent, Gemini `ask_user`, Copilot interactive,
  Cursor `Ask questions`).
- Hook + MCP config emission. Each plugin emits a stub today; the full config
  wiring (PreToolUse / BeforeTool / etc.) is deferred to per-platform follow-ups.

## Codex CLI

- ✅ DONE (2026-05-18 follow-up iteration) — `.codex/config.toml` snippet emission for hooks + MCP servers
- Codex slash-command registration if Codex exposes a `commands` field (verify)
- Subagent dispatch via Codex's `agent` hook type (research the exact contract)

## GitHub Copilot CLI

- ✅ DONE (2026-05-18 follow-up iteration) — `~/.copilot/mcp-config.json` emission
- ✅ DONE (2026-05-18 follow-up iteration) — `.github/hooks/` complete hook stubs (PreToolUse / PostToolUse / AgentStop)
- Validate the dedup behavior between `copilot-instructions.md` and `AGENTS.md` in real CLI

## Gemini CLI

- ✅ DONE (2026-05-18 follow-up iteration) — `.gemini/settings.json` emission with `mcpServers` + `hooks`
- Verify `gemini-extension.json` install path and behavior with `gemini extensions install`

## Cursor

- ✅ DONE (2026-05-18 follow-up iteration) — Replace `bin/install.sh` with a Node-based renderer that takes a JSON ctx and writes rendered files
- Investigate Cursor's `/commands` wizard format if it becomes public

## visual-qa and agent-all on each platform

- ✅ DONE (2026-05-18 scaffold iteration) — visual-qa MVP scaffold for Codex/Copilot/Gemini (config emit + MCP snippet). Cursor remains docs-only as designed.
- Pending — full 6-phase visual-qa orchestrator port per platform (separate spec per platform).
- Pending — agent-all port per platform. See `docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md` for per-platform decomposition.

## Antigravity

`Antigravity` is not currently a public product. If Google ships a distinct
"Antigravity" tool (separate from Gemini CLI), revisit the `harness-builder-gemini`
plugin to either fork or relabel.
