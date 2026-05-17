# Visual QA — Manual E2E Checklist

Run before each `harness-floor` release. Requires:
- A small fixture web app (Next.js or static HTML) with at least 2 pages, a login form, and a button with visible hover/focus styles.
- Local dev server running (e.g. `npm run dev`).
- Playwright plugin enabled.

## Setup

```bash
mkdir /tmp/visual-qa-fixture && cd /tmp/visual-qa-fixture
git init
# (Place fixture app here.)
```

Drop this `.visual-qa.json`:

```json
{
  "baseUrl": "http://localhost:3000",
  "breakpoints": [
    { "name": "mobile", "width": 375, "height": 812 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "pages": [
    { "name": "home", "path": "/", "components": [
      { "name": "cta", "selector": "button.primary", "states": ["hover", "focus"] }
    ]}
  ]
}
```

## Checks

- [ ] `/visual-qa` with no `.visual-qa.json` aborts and suggests `/harness-init --visual-qa`.
- [ ] Stop the dev server, run `/visual-qa` — Phase 0 asks "continue anyway?" and abort on "n".
- [ ] First successful run produces `docs/visual-qa/YYYY-MM-DD-<hex>/` with: `report.md`, `report.json`, `home/mobile/_page.png`, `home/desktop/_page.png`, `home/*/cta__default.png`, `home/*/cta__hover.png`, `home/*/cta__focus.png`.
- [ ] Each `.png` has a sibling `.analysis.json` (parses) and `.analysis.md` (non-empty).
- [ ] `report.md` has Summary table, New Issues section.
- [ ] Hover screenshot visually differs from default screenshot.
- [ ] Re-run with no source change → "vs prior run: 0 new, 0 resolved" in console.
- [ ] Add a deliberately bad contrast button, re-run → at least 1 new issue.
- [ ] `--force` wipes and starts over.
- [ ] Ctrl-C during Phase 3, then `--resume` continues without re-capturing completed pages.
- [ ] `--budget=0.01` aborts in Phase 1 before any capture.
- [ ] Critical issue case: exit code 1. Incomplete page case: exit code 2. Clean case: exit code 0.
