# agent-all-codex — porting notes

## The `agent` hook research spike (incomplete)

The decomposition spec (`docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md`)
identifies Codex's `agent` hook type as the path for parallel wave
dispatch. As of this scaffold iteration, the hook's exact schema is not
yet verified against a live Codex CLI build. Open questions:

1. **Hook registration syntax.** Is `[[hooks.agent]]` correct or does
   Codex want `[hooks] agent = [...]` (matching the existing
   `PreToolUse`/`SessionStart` shape)? The template
   (`templates/codex-hooks-snippet.toml.hbs`) assumes the former.

2. **Dispatch command.** The phase docs assume an external
   `codex-agent-dispatch` binary (or shell wrapper) that the hook calls
   when triggered. Whether Codex ships this or expects the user to
   provide it is undetermined.

3. **Awaiter semantics.** The port uses `codex agent wait --task-prefix`
   as the blocking call. Codex may instead expose this via the `tools.list`
   RPC as a `subagentWait` tool — research needed.

4. **Cost reporting.** Codex's per-agent cost may or may not surface in
   the wait response. The phase docs assume `{costUSD}` per agent;
   fallback is best-effort estimation from token counts.

Until these are confirmed, the port ships with a **sequential fallback**
(`--dispatch=sequential` or auto-detected at preflight when the hook is
missing). Sequential mode invokes `.codex/skills/<role>/SKILL.md` one
task at a time — ~3-5x slower than parallel but guaranteed to work on
any Codex CLI version.

## Effort estimate vs other ports

Spec estimate: **1 week** (same as Copilot).

| Sub-project | Estimate | Why |
|---|---|---|
| Cursor (3 days) | smallest | prompt template; no dispatch API |
| Copilot (1 week) | medium | `task` tool maps cleanly; `store_memory` for state |
| **Codex (1 week)** | medium | `agent` hook + sequential fallback both need impl |
| Gemini (1.5 weeks) | largest | no native dispatch primitive |

Codex port's 1-week estimate covers:
- 2 days: `agent` hook research spike against a live CLI build.
- 2 days: implement both dispatch paths (`agent-hook`, `sequential`).
- 1 day: cost-tracking + per-wave aggregator.
- 1 day: tests + manual checklist.
- 1 day: buffer.

This iteration ships **scaffold-only** — phases, templates, hook snippet,
porting notes. Hook research and implementation are deferred.

## Differences from Claude Code orchestrator

| Aspect | Claude Code (`/agent-all`) | Codex (`agent-all-codex`) |
|---|---|---|
| Dispatch | `Task` tool (subagent-driven-development) | `agent` hook OR sequential `.codex/skills/<role>/SKILL.md` |
| Awaiter | Skill awaits per-task | `codex agent wait --task-prefix` (assumed) |
| State persistence | `.agent-all-state.json` + `apply_patch` | Same — Codex has no `store_memory` equivalent |
| Brainstorm | `superpowers:brainstorming` | `ask_user`-driven structured Q&A |
| Plan writer | `superpowers:writing-plans` | Coordinator drafts inline |
| Cost cap | Token-counted | `codex agent wait` response (if exposed) |

## Why both dispatch strategies?

Per the spec, Codex's `agent` hook is "well-documented" but not yet
hands-on-validated in this repo. Shipping with a sequential fallback
guarantees the skill works on any Codex install today — users on older
CLI versions or without the hook registered still get a working pipeline,
just slower. As soon as the hook is validated, the auto-detect at
preflight upgrades them transparently.

## Future work

- Live CLI research spike for `agent` hook schema → update templates
  and remove `--dispatch=sequential` warning.
- `bin/init.mjs` to install the hook snippet into `~/.codex/config.toml`
  with merge semantics (don't clobber existing hooks).
- Cost-tracking integration once the wait-response schema is confirmed.
- `dispatch=hybrid` strategy: try agent-hook per-task, fall back to
  sequential on individual failures rather than per-wave.
