---
name: agent-handoff
description: Generate task handoff and new-session prompt files for an in-progress /agent-all task, with resume metadata, safe git-state collection, dry-run and strict modes.
---

# /agent-handoff

Creates a durable session handoff for an existing task doc. The command reads a
`.agent-skill/tasks/<display-id>-<slug>.md` task, safe git state, and
`.agent-all-state.json` when present, then writes:

- `.agent-skill/handoff/<display-id>-<slug>.handoff.md`
- `.agent-skill/handoff/<display-id>-<slug>.session.md`

Legacy `docs/tasks/<NN>-<slug>.md` task docs are accepted as input during
migration; new output still defaults to `.agent-skill/handoff/`.
New task docs carry `id: AS-TASK-*`, `display_id: T-YYYYMMDD-NNN`,
`github_issue`, and `artifact_root` frontmatter; handoff metadata preserves
those ids for `/agent-all --resume`.

Both files include a human-readable summary and machine-readable metadata in an
HTML comment. The handoff schema is `agent-skill/handoff@1`; the session prompt
schema is `agent-skill/session-prompt@1`. The session prompt is designed to be
the first message in a new agent session.

## Usage

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --dry-run
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --strict
```

From a shell-capable surface, the bundled helper is:

```
node plugins/harness-floor/skills/agent-handoff/bin/agent-handoff.mjs .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --strict
```

## Flags

- `--dry-run` — print the rendered handoff/session content without writing files.
- `--strict` — fail when required task-ledger sections are missing. This checks
  structure only; unfinished checkboxes are allowed because handoff is for
  in-progress work.
- `--yes` — non-interactive mode. Auto-selects the recommended next action and
  appends both the legacy `.agent-skill/runs/handoff-audit.jsonl` and the
  shared `.agent-skill/runs/handoff/interactions.jsonl`.

## Pipeline

| Phase | File | Purpose |
|---|---|---|
| 0 | `phases/0-preflight.md` | validate task path, flags, and write targets |
| 1 | `phases/1-collect.md` | parse task doc and collect safe git state |
| 2 | `phases/2-render.md` | render handoff/session prompt with metadata |
| 3 | `phases/3-verify.md` | verify files, resume compatibility, and audit log |

## Rules

1. Only run safe read-only git commands: `git status --short`,
   `git branch --show-current`, and `git log --oneline -n 10`.
2. Never run destructive commands during handoff collection. Commands such as
   `git reset`, `reseed`, `--apply`, and `docker volume rm` must be marked
   `User approval required / 사용자 승인 필요` in the session prompt.
3. Prefer `/agent-all <task> --resume` as the recommended next action.
4. In non-TTY mode, normalize the next-action prompt as
   `agent-interaction/v1` with kind `resume`, auto-select the recommended
   low-risk action, and log the reason to both
   `.agent-skill/runs/handoff-audit.jsonl` and
   `.agent-skill/runs/handoff/interactions.jsonl`.
5. Preserve unrelated worktree changes. `/agent-handoff` may run on a dirty
   tree because its job is to capture state before a session change.

## Lib modules

- `../agent-all/lib/task-doc-extractor.mjs` — task title, sections, progress,
  checklist, blocker, and verification extraction.
- `../agent-all/lib/git-state-reader.mjs` — safe read-only git state reader.
- `../agent-all/lib/handoff-writer.mjs` — concise handoff renderer, including recent data artifact and validation evidence when available.
- `../agent-all/lib/session-prompt-writer.mjs` — new-session prompt renderer.
- `../agent-all/lib/resume-artifacts.mjs` — `.agent-skill/handoff/`
  handoff/session discovery with legacy sibling fallback used by
  `/agent-all --resume`.
- `../agent-all/lib/interactions/*.mjs` — shared interaction schema,
  non-TTY resolver, and JSONL interaction audit used by `/agent-all --resume`.
- `lib/agent-handoff-runner.mjs` — file orchestration helper.

## When Done

Print the generated handoff path, session path, audit path, and any captured
data evidence summary when one was written. Tell the user to resume with
`/agent-all <task> --resume` or start a new session using the generated
`.session.md` prompt.
