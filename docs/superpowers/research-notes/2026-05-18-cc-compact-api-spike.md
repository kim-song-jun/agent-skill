# Spike: Claude Code compact API surface (for harness-thrift summariser)

**Date:** 2026-05-18
**Sandbox limitation:** Cannot run a live CC session to interactively
probe `/compact`'s plugin-facing API. Findings below are derived from
the visible CC behavior in this conversation + repo evidence + general
plugin API patterns.

## Question

Does Claude Code expose a programmatic way for a plugin to trigger
context compaction mid-session, so the harness-thrift summariser can
fire automatically when thresholds are hit?

## Evidence collected

1. **CC has a user-facing `/compact` slash command.** Confirmed: the
   system reminder text states "After /clear or /compact: knowledge base
   preserved." Users can invoke it interactively.
2. **CC has a user-facing `/clear` slash command** that wipes context.
3. **Hooks system exists** (`~/.claude/settings.json`,
   `.claude/settings.json`) supporting `PreToolUse`, `PostToolUse`,
   `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`,
   `Notification`, `SubagentStop`. Visible in repo via
   `plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs`
   and similar Copilot/Gemini hook templates.
4. **No documented plugin API for invoking `/compact`** in any CC docs
   visible in the repo. The `Skill` and `Task` tools manage subagent
   dispatch but do not document a "compact this session" call.
5. **Notification hook** exists and can emit messages to the user. This
   is the closest surface to "suggest the user run /compact".
6. **Stop hook** fires after each assistant turn and can block stopping
   — visible in this session's goal hook implementation. Could be
   used to insert a "summariser fired; run /compact to free context"
   message.

## Decision: advisory v1, programmatic v2 (if API ships)

**v1 (this iteration):**
- harness-thrift summariser is **advisory only**. When the
  `posttool-summariser-trigger` hook fires (token threshold hit), it:
  1. Calls a fast model (claude-haiku-4-5) via the Anthropic API
     directly (NOT via CC's chat) to compress the last N turns into a
     summary.
  2. Writes the summary to `.thrift/summaries/<date>-<turn-N>.md`.
  3. Emits a Notification (via the Notification hook surface) telling
     the user: "Summariser fired — N turns compressed to <path>. Run
     /compact then drop the file path into chat to restore context."
- The user manually runs `/compact` and pastes the summary path. The
  summariser provides the content; the user provides the compaction.

**Pro of v1:**
- Works today on any CC version that has hooks + Notification.
- No dependency on undocumented API surface.
- User retains control (compact is destructive — user-initiated is safer).

**Con of v1:**
- User in the loop every threshold fire — friction for long autonomous
  sessions.
- If user ignores the notification, threshold accumulates and v1 fires
  again but takes no action.

**v2 (future, if CC ships programmatic compact):**
- Replace the Notification step with a direct programmatic compact call.
- Same summariser content; same hook trigger.
- Automatic, no user intervention.

## Implementation notes for thrift-summariser

Given v1:

1. The summariser **does not** need Claude Code's compact API.
2. It **does** need Anthropic API access to call haiku for the summary
   itself. Options:
   - **Option A: shell out to a CLI** that wraps the Anthropic SDK
     (`anthropic-cli` or similar). Brittle; CLI may not exist.
   - **Option B: spawn a child process running `node -e` with the
     Anthropic SDK inline.** Requires `@anthropic-ai/sdk` available at
     runtime in the project's node_modules. Could be a peerDep of
     harness-thrift.
   - **Option C: emit a deferred summarisation request** that the user
     (or another Claude Code turn) executes via the model directly,
     bypassing the SDK. This is the most platform-portable.
   - **Recommendation: Option C v1, Option B v2.** Option C means the
     summariser doesn't call the model directly — it writes a "summarise
     turns X-Y" prompt to a known file, the Notification hook surfaces
     it, the user types `/summarise` or pastes the prompt. Crude but
     dependency-free.

3. **Token counting** for threshold evaluation comes from estimating
   output bytes per turn. `posttool-summariser-trigger` hook reads CC's
   tool output stream length (the hook fires post-tool, so it has
   access via env vars in the hook payload). Use rough heuristic:
   `tokens ≈ bytes / 4` for English text, `bytes / 2` for source code,
   `bytes / 3` mixed (default).

4. **Spec-path preservation**: when summarising, the summariser scans
   the dropped turns for `docs/superpowers/specs/*` paths and includes
   them verbatim at the top of the summary. So spec references survive
   compaction.

## Decision: summariser ships in v1 advisory mode

The harness-thrift Phase 3 documentation will:
- Describe summary generation via Option C (deferred prompt emission).
- Describe Notification-based user nudge.
- Document Option B as a future upgrade.
- Programmatic compact treated as v2 work, gated on CC API discovery.

## Time spent

Spike was supposed to take 1 day. Sandbox-bound version takes ~2 hours
(this doc + decision). Live spike with running CC + experimentation
would still need to happen in a future session to:
- Confirm Notification hook payload shape supports the message we want.
- Confirm Stop hook can write to chat without re-firing.
- Test the Option C deferred-prompt UX with real users.

Until that happens, the v1 implementation makes documented assumptions.
