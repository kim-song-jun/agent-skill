---
name: harness-view
description: Use when you want a human-readable HTML view of the harness's own artifacts — the live /agent-all run state, the task ledger, and design specs — compiled into one self-contained file and opened in the browser. Triggers: "show the run", "view tasks as html", "open the dashboard", "스펙 html로 보여줘", "task 사람이 읽게".
---

# /harness-view

Compiles the harness's markdown/JSON artifacts into ONE self-contained HTML dashboard at
`.agent-skill/html/index.html` and opens it. Dependency-free, no network — the file opens anywhere.

## What it shows

- **Run** — the live `.agent-all-state.json`: the phase 0–6 timeline (done / current), status badge,
  task, decisions, cost.
- **Tasks** — the `.agent-skill/tasks/` ledger (`index.md`) plus each task doc, expandable.
- **Specs** — the `docs/superpowers/specs/` design docs, rendered.

## Steps

1. **Regenerate** the dashboard (prints the output path):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/harness-view/bin/render.mjs"
   ```
   During a `/agent-all` run it is already current — the pipeline best-effort regenerates it at every
   phase checkpoint — so this step just refreshes it on demand.

2. **Open** it for the user:
   - macOS: `open .agent-skill/html/index.html`
   - Linux: `xdg-open .agent-skill/html/index.html`
   - Otherwise: report the path so the user can open it.

3. Tell the user the path and what changed since they last looked, if relevant.

## Notes

- Output lives under `.agent-skill/html/` (gitignored) — it is a derived view, never a source of record.
- The renderer is `lib/harness-html.mjs`; it is also imported by `/agent-all` for the live auto-refresh.
- Markdown rendering is a safe subset (headings, lists, GFM tables, fenced code, bold/italic, inline
  code, links); all content is HTML-escaped, so artifacts never inject markup into the view.
