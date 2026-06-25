---
name: harness
description: Use when you are not sure which harness skill to run — describe your intent in plain language and /harness routes you to the right one (/agent-init, /agent-all, /debug, /explore, /thrift, /wiki, /visual-qa, /data-runner, /agent-handoff) or the built-in Workflow tool, via a confirm-first AskUserQuestion. Optional front door; direct skill invocation still works.
---

# /harness

The optional front door. You describe what you want in plain language; `/harness`
recommends the right skill and routes you there after you confirm. It never runs
work itself and never auto-routes silently.

## Usage

```
/harness "auth login is failing intermittently"
/harness "set up the harness on this repo"
/harness "ship the new export button as a PR"
```

## How it routes

1. Read the free-form intent (the argument).
2. Seed candidates with `rankRoutes(intent)` from `lib/routing-map.mjs`, then refine
   with judgment against the routing table in `references/routing-map.md`.
3. Present an **AskUserQuestion** decision: the recommended target first, plus 2-3
   alternatives, each labeled with its one-line "when". This is the repo's
   Decision-Surfacing Protocol — the user always confirms.
4. On the user's choice:
   - **kind "skill"** (e.g. `/agent-all`): invoke that Skill, passing the original intent.
   - **kind "tool"** (`Workflow`): it is the built-in Workflow tool, not a skill — do not
     invoke it as a skill; explain it is the right orchestrator for breadth-first
     evidence and how to run it (see agent-all `references/orchestrator-routing.md`).
   - **top score 0 or genuinely ambiguous**: ask ONE clarifying question first, then re-rank.
5. Never auto-run a high-risk target (a `/agent-all` PR run) without an explicit confirm.

## Non-goals

- Not a replacement for direct skill invocation — `/agent-all` etc. stay first-class.
- Not an executor — it routes and hands off.
- Claude-first; other-runtime ports are a follow-up.
