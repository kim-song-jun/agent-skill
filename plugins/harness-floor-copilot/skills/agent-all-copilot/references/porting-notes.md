# agent-all-copilot — porting notes

## Why Copilot's `task` tool fits better than Cursor's description routing

Copilot CLI v0.0.380+ ships a purpose-built `task` tool with:
- Explicit `task({prompt, context})` invocation API.
- Optional lifecycle hooks such as `subagentStop`, whose current payload
  includes `agentName`, `sessionId`, `transcriptPath`, and `stopReason`.

That maps cleanly onto the Claude Code orchestrator's per-task `Task` tool
dispatch for prompt-level fan-out. Unlike the earlier scaffold, this port
does not assume public `read_agent`, `list_agents`, or `store_memory` tools.
Durable state is file-backed.

## Live-CLI verification (2026-06-28 — Copilot CLI v1.0.63, #27 partially resolved)

Verified against the agentic GitHub Copilot CLI **v1.0.63** (installed locally via
`gh copilot`; binary at `~/.local/share/gh/copilot/copilot`) and the authoritative
[hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference).
The prior "#27 = CLI not installed / primitives are unverified guesses" status is
**stale**. Confirmed FACTS:

- **Hooks are real** and delivered via plugins / hook config files —
  `preToolUse`, `postToolUse`, `subagentStart`, `subagentStop`, `agentStop`, etc.
- **`subagentStop` payload** (camelCase) is `{ sessionId, timestamp, cwd,
  transcriptPath, agentName, agentDisplayName?, stopReason: "end_turn" }`, plus a
  VS Code snake_case form — exactly what `subagent-stop-dispatcher.mjs` already
  parses. ✅
- **Hook config schema** `{ version:1, hooks:{ "<event>": [{ type:"command",
  bash, powershell?, cwd?, env?, timeoutSec? }] } }` matches what `install-hooks`
  writes. ✅
- Real tool names for matching: `bash`/`powershell` (shell), `write`/`edit`/
  `create`/`view`/`glob`/`grep`, `task`, `ask_user`, `web_fetch`. `store_memory`
  is NOT a CLI tool — `memory-bridge.mjs` only calls it through an injected
  `toolCaller` (absent on Copilot) and otherwise persists file-backed, so this is
  a graceful optional path, not a dependency.

FIXED this slice:

- **Hook install location** — `install-hooks` wrote a single
  `~/.copilot/hooks.json`, but the CLI loads user hooks from the `~/.copilot/hooks/`
  **directory** (`*.json`). Now writes `~/.copilot/hooks/agent-skill.json`.
- **Real hard enforcement (NEW)** — `lib/hooks/git-safety.mjs` +
  `lib/hooks/pre-tool-use-policy.mjs` give Copilot a `preToolUse` hook that
  DENIES shared-worktree-dangerous git commands (`stash`, `checkout -b`/`switch`,
  `clean`, `reset --hard`, `add -A`, pathspec-less/`-a`/`--amend` commit,
  `push --force`) via `{permissionDecision:"deny"}`. `preToolUse` is fail-closed,
  so the handler fails OPEN (allow) on any internal error to avoid bricking the
  session. This upgrades Copilot from prompt-level guidance to the same hard
  git-safety the Claude/Codex `agent-policy-hook` enforces.

KNOWN CONSTRAINT (documented, not a bug):

- The built-in `general-purpose` agent does **not** emit `subagentStart`/
  `subagentStop`. To get the lifecycle dispatcher to fire, the `task` dispatch
  must target a CUSTOM agent (`--agent`). Prompt-level fan-out still works without
  it; only the hook-based awaiter depends on a custom agent.

LIVE-VERIFIED (2026-06-28, Copilot CLI v1.0.63 — closes the `#27` preToolUse gap):

- A real `gh copilot -p "...git stash..." --allow-all` run against a `~/.copilot/hooks/`
  install of this handler returned, from the live agent:
  `✗ Run git stash command (shell) → Denied by preToolUse hook: git stash (rule 6 — …)`.
  The hook loads, fires, and the deny is honored end-to-end. (Probe hook removed
  after verification; install it for real via `bin/install-hooks.mjs`.)
- The live probe also surfaced a bug that no spec read would have: Copilot v1.0.63
  delivers `toolArgs` as a **JSON-encoded string** (`'{"command":"git stash",…}'`),
  not a parsed object. `pre-tool-use-policy.mjs` now JSON-parses a string `toolArgs`
  before extracting `.command`. Without this it treated the JSON blob as the literal
  command and allowed everything — the first probe run let `git stash` through.

STILL `#27`-deferred (lower-value, not yet live-run):

- The `subagentStop` lifecycle dispatch on a real multi-task Copilot run (requires a
  custom `--agent`; the built-in `general-purpose` agent does not emit it). The
  payload parsing + install path are unit-tested; only the live multi-agent run is
  unverified.

## Effort estimate vs other ports

Spec estimate: **1 week** (same as Codex; less than Gemini's 1.5w).

| Sub-project | Estimate | Why |
|---|---|---|
| Cursor (3 days) | smallest | prompt template; no dispatch API to implement |
| Copilot (1 week) | medium | `task` tool maps cleanly; file state plus optional hooks |
| Codex (1 week) | medium | `agent` hook requires research spike but well-documented |
| Gemini (1.5 weeks) | largest | no native dispatch primitive; subprocess workaround |

Copilot port's 1-week estimate covers:
- 2 days: research `task` and hook schemas and write Copilot-flavored phase docs.
- 2 days: implement the awaiter (hook vs polling fallback).
- 1 day: cost-tracking integration via task output or estimates.
- 1 day: tests + manual checklist.
- 1 day: buffer.

This iteration ships the file-backed Copilot port contract with optional
hook lifecycle evidence. The hook dispatcher accepts both camelCase and
VS Code compatible `SubagentStop` payloads.

## Known unknowns

1. **Task result shape.** The hook gives lifecycle metadata, not the
   subagent's final answer. The coordinator must parse the `task` result or
   transcript evidence supplied by the host.

2. **`task` tool maxConcurrency.** Unclear whether Copilot caps concurrent
   `task` invocations server-side. If so, the `wave.maxParallel` config
   should clamp to that cap. Research spike needed.

3. **Transcript parsing.** `transcriptPath` is recorded for audit evidence,
   but output extraction must tolerate host-version differences.

4. **Cost-tracking field.** If the task result does not report usage, the
   coordinator best-effort estimates from transcript length.

## Differences from Claude Code orchestrator

| Aspect | Claude Code (`/agent-all`) | Copilot (`/agent-all` port) |
|---|---|---|
| Dispatch | `Task` tool (subagent-driven-development skill) | `task` tool directly |
| Awaiter | Skill awaits per-task | `task` result plus optional `subagentStop` lifecycle log |
| Plan persistence | File only | File only |
| Brainstorm | `superpowers:brainstorming` skill | Chat-driven structured Q&A |
| Plan writer | `superpowers:writing-plans` skill | Coordinator drafts inline |
| Cost cap | Token-counted in Claude infra | Reported usage if exposed; else best-effort |

## Future work

- Task-result parser hardening against new Copilot CLI response shapes.
- `task` tool concurrency probe in Phase 0 preflight.
- Per-platform agent file emission (Copilot doesn't use `.copilot/agents/`
  but does honor `.github/copilot-instructions.md` — consider seeding a
  pipeline-aware instructions section there).

## Smartness ports (G7) — live-CLI posture (#27)

The G7 slice ports three "smartness" capabilities to Copilot: adversarial
re-verification (`adversarialVerify`), pre-dispatch checkpoint flush
(`flushCheckpoint`), and resume checkpoint recall (`recallLatestCheckpoint`).

**What IS real behavior (module-level, fully tested):**
- `adversarialVerify` in `lib/verification-adapters/adversarial-verifier.mjs`
  is pure JS. The copilot-vendored copy is byte-identical to the CC source
  (proven by diff). Tests in `tests/lib/copilot/agent-all-adversarial.test.mjs`
  drive it with real pass/fail runners and a real child process — structural
  independence is verified at the function-signature level, not just prose.
- `flushCheckpoint` and `recallLatestCheckpoint` in `lib/memory-agent.mjs` are
  pure JS + fs I/O. Tests in `tests/lib/copilot/agent-all-checkpoint.test.mjs`
  drive a genuine mid-wave-death round-trip: flush inFlight:true, discard all
  in-memory state, reconstruct from disk via `recallLatestCheckpoint` using only
  the fixed `checkpoint/LATEST` pointer.

**What is spec-level / live-CLI-unverified (#27, decision 6, deferred to G12):**
- The live Copilot `task` dispatch of the adversarial verifier step (Phase 4
  Step 3-adversarial) — the `task` invocation itself is spec-level; the pure-JS
  module it calls is real.
- The live mid-wave-death + `--resume` re-entry path on a running Copilot CLI —
  the file I/O round-trip is real; the live CLI orchestrator executing the
  Phase-0 recall + Phase-3 re-entry is spec-level.

These two paths are explicitly NOT asserted by any test and are documented here
as #27-deferred. No green stub is used to claim they work. Per spec §5/§6 and
decision 6, presence/contract tests (port-ssot E5) assert the prose wiring;
real-behavior tests assert the module-level contracts.

## Wiki prose-only port (G10) — #27 posture

The G10 slice ports the `/wiki` knowledge-base surface to Copilot as a **prose-only** embed in the builder-owned host context file (`plugins/harness-builder-copilot/skills/copilot-init/templates/copilot-instructions.md.hbs`), which renders to `.github/copilot-instructions.md`.

**What this IS:**
- A `## Project Wiki (prose-only port)` section inlined into the Copilot host context file (always-read memory).
- Prose specs for the five command verbs (`write`, `update`, `compile`, `status`, `list`) + bare-query Phase A router, mapped onto the Copilot primitives `view`/`create`/`edit` already listed in Operating Principles.
- The page schema (frontmatter: `title`/`slug`/`grade`/`tags`/`updated`; fixed sections: BLUF, Details, Provenance, Contradictions, Related) inlined verbatim.
- A `### First thing to do each session` digest instruction (prompt-level policy, NOT an automatic hook).
- Karpathy LLM-Wiki (MIT) attribution.

**What this is NOT:**
- No runnable `/wiki` skill, no wiki lib, no SessionStart or PreToolUse hook on Copilot.
- The digest-as-instruction is prompt-level policy; it does not fire automatically.
- The live Copilot CLI execution of these prose steps is spec-level / live-CLI-unverified (#27, decision 6, same posture as G7).

**Cross-family note:** The host context file is owned by `harness-builder-copilot` (builder plugin), not `harness-floor-copilot`. There is no host-context file inside the floor plugin. The prose lands in the builder template; this porting-notes doc (floor-owned) carries the reference and honest-labeling.

**Tests:** `tests/lib/copilot/wiki-prose-surface.test.mjs` — doc-surface contract (presence/contract only, not behavior). Asserts the `## Project Wiki` heading, verb specs, schema keys, digest instruction, #27 token, and a negative guard ensuring no hook-fires claim is made in the prose.

**agent-all↔wiki auto-loop (v0.7.4) — NOT on this port.** The auto-loop (agent-all auto-reading `.wiki/` at Phase 1 and auto-writing it at Phase 2/5 via `wiki-log.mjs`) runs only on Claude Code + Codex (the runnable-wiki ports). Copilot ships no `wiki-log.mjs` and its agent-all phase docs carry no wiki step — honest prose-only, consistent with the #27 wiki labeling above.
