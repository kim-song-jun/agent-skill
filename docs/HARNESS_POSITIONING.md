> Korean: [HARNESS_POSITIONING.ko.md](HARNESS_POSITIONING.ko.md)

# Harness Positioning

This document explains where `agent-skill` fits among current coding-agent
harnesses and what it is useful for when you want to build a reusable, general
agent harness for many repositories.

External projects named here are independent projects. This comparison is
based on their public GitHub docs as checked on 2026-06-18:

- [Gajae-Code](https://github.com/Yeachan-Heo/gajae-code)
- [Oh My OpenAgent / OMO](https://github.com/code-yeongyu/oh-my-openagent)

## Short Version

`agent-skill` is a **project-local harness generator**. It does not try to be
one more standalone agent runtime. It installs the same operational workflow
into Claude Code, Codex CLI, Copilot CLI, Cursor, Gemini CLI, and VS Code
Copilot in the file layout each host expects.

Use it when you care about these properties:

- one canonical command surface: `/agent-init`, `/agent-all`, `/visual-qa`,
  `/thrift`, `/debug`
- project-local scaffold that can be audited, repaired, uninstalled, and
  reinstalled
- verification-first workflow: tests, visual QA, reviewers, policy hooks,
  doctor checks, release gates
- conservative host integration: no default global config mutation, snippets
  printed for manual merge where the host requires it
- the same harness method across teams that use different agent hosts

Use Gajae-Code or OMO when their host model is the thing you want: Gajae-Code
as an external focused runner with tmux/worktree evidence flows, or OMO as a
large OpenCode-centered agent OS with model routing, Team Mode, LSP/AST tools,
and embedded MCPs.

## Comparison Matrix

| Dimension | `agent-skill` | Gajae-Code | OMO / Oh My OpenAgent |
|---|---|---|---|
| Primary shape | Project-local scaffold and plugin set for multiple hosts | External coding-agent runner started beside an existing tool | OpenCode-centered agent OS, plus Codex Light edition |
| Public workflow | `/agent-init`, `/agent-all`, `/visual-qa`, `/thrift`, `/debug` | `deep-interview`, `ralplan`, `ultragoal`, optional `team` | `ultrawork` / `ulw`, Team Mode, Light Codex components |
| Portability goal | Same operating method across Claude, Codex, Copilot, Cursor, Gemini, VS Code Copilot | Runs beside other tools from a chosen repo/worktree | Full Ultimate edition for OpenCode; Light edition for Codex |
| Enforcement model | Host-adapted: hard hooks where available, prompt/sequential contracts where not | External runner and tmux/worktree boundaries | OpenCode hooks/tools/MCPs; Codex Light uses the Codex plugin surface |
| Verification posture | Release-audited docs, fresh fixtures, doctors, provenance, visual QA, policy gates | Evidence-oriented planning/execution surface | Doctor, model setup, rules injection, LSP/AST tooling, hash-anchored edits |
| Best fit | Teams standardizing a reusable harness across many repos and agent hosts | Users who want a focused external runner with a small workflow surface | Users who want a powerful OpenCode-first agent system with heavy orchestration |

## What Is Different About `agent-skill`

### 1. It treats the harness as an installable project contract

The main artifact is not a chat prompt. `/agent-init` writes durable files:
root guidance, agent/skill definitions, task ledgers, policy hooks, config, and
doctor-compatible scaffolds. That makes the harness inspectable by humans and
testable by release fixtures.

### 2. It normalizes commands across hosts

The source directories stay platform-specific internally, but users see the
same commands where the host supports them:

```text
/agent-init
/agent-all
/visual-qa
/thrift
/debug
```

The host adapter decides how to realize those commands. Claude can use native
slash-command and hook surfaces. Codex currently uses prompt-level or
sequential skill dispatch where its command surface does not expose the same
Task lifecycle. Copilot, Cursor, Gemini, and VS Code Copilot receive the
strongest scaffold their host can support.

### 3. It is built around verification, not only autonomy

Autonomy without proof creates rework. `agent-skill` therefore puts gates in
the normal path:

- `agent-all` plans, dispatches, reviews, and records state
- `visual-qa` screenshots pages, states, responsive breakpoints, and
  interactions
- verification adapters handle CLI, API, notebook, SQL, batch, and web UI
  evidence
- policy hooks block destructive commands and quality-debt shortcuts where the
  host supports hard hooks
- release scripts prove docs, installers, fresh fixtures, provenance, and
  vendored libraries before a release is tagged

### 4. It avoids hidden global mutation by default

For project bootstrap, generated files land in the target repository. When a
host needs user-level config, installers print snippets or require an explicit
approved update path. That makes the harness safer for shared machines,
parallel sessions, and teams with existing host configuration.

### 5. It is useful as a general harness blueprint

The repo is not only a plugin bundle. It shows a repeatable architecture for
building agent harnesses:

1. **Command contract:** define the small public workflow the user should
   remember.
2. **Project scaffold:** write durable repo-local files rather than relying on
   one-off prompts.
3. **Host adapters:** map the same method to each host's real primitives.
4. **Policy layer:** block destructive or low-quality shortcuts where hard
   hooks exist, and document softer surfaces honestly.
5. **Verification layer:** make tests, visual QA, and domain evidence first
   class.
6. **State layer:** store loop state, task identity, handoffs, cost telemetry,
   and run evidence under `.agent-skill/`.
7. **Release layer:** require docs contracts, fresh fixture installs, doctor
   checks, provenance manifests, and full tests before publishing.

That pattern is the transferable part. A team can keep the same architecture
even if it swaps one host runtime for another.

## When To Choose Each

Choose `agent-skill` when:

- your team uses more than one agent host
- you want one repo-local operating contract that survives plugin updates
- your work needs PR/review/test/visual-QA discipline more than raw agent
  throughput
- you need conservative install/uninstall and release evidence
- you want to build your own harness using a concrete, audited example

Choose Gajae-Code when:

- you want a focused external runner rather than host-specific plugin install
- tmux/worktree-backed execution and evidence are the center of the workflow
- you prefer a small public method surface over a broad plugin bundle

Choose OMO when:

- OpenCode is your main runtime
- you want aggressive multi-agent orchestration, model routing, Team Mode, LSP,
  AST search, and embedded MCP tooling in one opinionated system
- you want Codex Light components from the OMO/LazyCodex line rather than a
  project-local cross-host scaffold

## Honest Limits

`agent-skill` is strongest as a cross-host operational harness. It is not a
replacement for every runtime-specific innovation:

- it does not try to outdo OMO's OpenCode-native Team Mode or hash-anchored
  edit stack
- it does not try to replace Gajae-Code's external runner and tmux-centered
  workflow
- enforcement strength varies by host because not every host exposes the same
  hook or subagent lifecycle
- global marketplace install and project-local init are separate steps; users
  must understand that distinction

The design tradeoff is deliberate: keep the public workflow stable, keep
project files auditable, and adapt honestly to each host's real capabilities.
