# Visual-QA: Before/after pairs + element-scope + multi-tier matching

**Date:** 2026-05-22
**Status:** Design (pending plan)
**Target release:** `harness-floor` v0.4.0

## 1. Summary

Three additive capabilities for `visual-qa`:

1. **Before/after image pairs in the report.** Each tracked element gets a paired view — `before` (initial state) ↔ `after` (post-action), plus `baseline` ↔ `current` when a prior accepted run exists. Pairs are surfaced both in `report.md` (2-column markdown table) and in a new self-contained `report.html` with a lightbox viewer.

2. **Element-scope configuration.** A new `comprehensive.targets` block in `.visual-qa.json` lets the user specify exact selectors to include / exclude and which action(s) to run per selector. Existing auto-discovery still runs as the discovery fallback, but the user can now constrain (or augment) it precisely.

3. **Multi-tier element identity.** Replaces the current `selector + DOM-path-hash` matching (fragile under refactors) with a 3-tier fallback chain — explicit `data-vqa-id` → semantic fingerprint → path hash. Per-element `matchConfidence` is surfaced in the report so drift is visible.

## 2. Background

Current `visual-qa` (v0.3.x):
- `declared` and `comprehensive` modes.
- `comprehensive` crawls from `baseUrl`, DOM-walks each page for interactive elements, shallow-clicks each non-input.
- Diff vs prior run via `lib/diff-runs.mjs`; verdict via `lib/verdict.mjs`.
- Report at `docs/visual-qa/<slug>/report.md`. JSON sidecar at `report.json`.

Gaps this design closes:
- Captures *are* taken before/after shallow-click but **report doesn't show them paired** — only the issue text.
- Scope is page-level only — no way to say "only track this button and that form field."
- Element identity uses path hash → re-parenting or reordering breaks baseline matching silently.

## 3. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Pair definition | Action-step (before/after click) **and** Baseline diff (current ↔ prior accepted) | Both surface different problem classes |
| Scope mechanism | `comprehensive.targets` block (selector include/exclude + per-selector actions) | Layered with existing auto-discovery; no separate file |
| Report format | Markdown table **and** self-contained `report.html` with lightbox | md for diff-friendly review, html for visual scrubbing |
| Element identity | 3-tier fallback: `data-vqa-id` → semantic fingerprint → path hash | Rewards instrumentation, robust to common refactors, no breaking change for paths |

## 4. Configuration schema

`.visual-qa.json` gains three new keys (all additive, default-on for new behavior, default values match current behavior where applicable):

```jsonc
{
  "mode": "comprehensive",
  "comprehensive": {
    "scope": { /* existing */ },

    "targets": {
      "includeSelectors": ["button", "[role=button]", "a", "[data-vqa]", "[data-testid]"],
      "excludeSelectors": [".analytics", ".cookie-banner", "[data-vqa-skip]"],
      "actionsPerElement": {
        "button":         ["click"],
        "[role=button]":  ["click"],
        "a":              ["click"],
        "input[type=text], input[type=email], textarea": ["fill:vqa-sample", "blur"],
        "input[type=checkbox]": ["click"],
        "select":         ["select:1"],
        "[role=tab]":     ["click"],
        "default":        ["click"]
      }
    },

    "pairs": {
      "captureBeforeAfter": true,
      "diffBaseline": true
    },

    "matching": {
      "tiers": ["explicit", "semantic", "path"],
      "semanticFields": ["role", "accessibleName", "nearestHeading", "textSnippet"]
    }
  },

  "report": {
    "html": true,
    "mdSideBySide": true
  }
}
```

**Constraints:**
- `actionsPerElement` keys are CSS selectors; first matching key wins (`default` runs last).
- Action strings: `click`, `fill:<value>`, `blur`, `select:<index|value>`, `hover`. v1 supports single action per match. Multi-step scenarios are out-of-scope (future `scenarios` field).
- `matching.tiers` is an ordered list; runtime tries each tier in order and stops at first match.
- All keys backward-compatible: missing `targets` → current auto-discovery behavior; missing `pairs` → defaults to `captureBeforeAfter: true, diffBaseline: true`; missing `report` → both `html` + `mdSideBySide` enabled.

## 5. Capture flow

`phases/3-capture.md` updated. For each discovered/declared element:

```
1. computeElementId(element):
   - tier 1: el.getAttribute('data-vqa-id') → return { id, confidence: 'explicit' }
   - tier 2: { role, accessibleName, nearestHeading, textSnippet:60 } → sha1 → return { id, confidence: 'semantic' }
   - tier 3: selector + DOM-path hash → return { id, confidence: 'path' }
2. screenshot → save as captures/<page>/<elementId>/before.png
3. dispatch action per actionsPerElement match
4. wait for network/animation idle (existing utility)
5. screenshot → save as captures/<page>/<elementId>/after.png
6. if baseline.run exists AND baseline.captures[elementId]:
   - copy or symlink baseline's after.png → captures/<page>/<elementId>/baseline.png
   - mark capture.hasBaseline = true
7. state.captures[elementId] = {
     elementId, pageSlug, selector, action,
     confidence: 'explicit' | 'semantic' | 'path',
     hasBaseline,
     screenshots: { before, after, baseline? },
   }
```

**Filter precedence (before tier-1 ID computation):**
1. If `targets.excludeSelectors` matches → skip.
2. If `targets.includeSelectors` is non-empty AND no entry matches → skip.
3. Otherwise → proceed.

This means auto-discovery still finds elements, but user can carve out (`exclude`) or restrict (`include`).

## 6. Report changes

`phases/4-aggregate.md` extended. New `lib/report-html.mjs` produces a self-contained HTML report alongside `report.md`.

### 6.1 `report.md` (2-column pair table)

Per element, under the verdict bullet:

```markdown
### Profile menu trigger — `[data-vqa-id="profile-menu-toggle"]`

- Verdict: 🟢 pass
- Confidence: `explicit` (data-vqa-id matched)
- Action: `click`

| Before / Baseline | After / Current |
|---|---|
| ![before](./captures/dashboard/profile-menu-toggle/before.png) | ![after](./captures/dashboard/profile-menu-toggle/after.png) |
| ![baseline](./captures/dashboard/profile-menu-toggle/baseline.png) | ![current](./captures/dashboard/profile-menu-toggle/after.png) |
```

When no baseline exists, the second row is omitted.

### 6.2 `report.html` (lightbox viewer)

Self-contained — single HTML file with inline CSS + minimal JS, no external assets. Features:

- Vertical scrolling list of cards (one per element)
- Each card shows: header (selector + verdict + confidence badge), 2-column thumbnails (before / after), small "view baseline diff" toggle if applicable
- Click a thumbnail → fullscreen lightbox modal
  - Left/right arrows toggle between `before` / `after` / `baseline` / `current`
  - `B` key shows baseline overlay (50% opacity over current) for visual diff
  - Escape closes
- Footer: meta info (slug, generated-at, total elements, pass/fail count)

Color tokens (CSS variables) map to verdict — green pass / yellow warn / red fail / gray new.

## 7. File layout

```
docs/visual-qa/<slug>/
├── report.md
├── report.html              NEW — self-contained viewer
├── report.json
└── captures/
    └── <page-slug>/
        └── <element-id>/
            ├── before.png
            ├── after.png
            └── baseline.png   (symlink to ../../../<prev-accepted-slug>/captures/.../after.png; falls back to copy on systems without symlink support)
```

`<element-id>` for filesystem safety: hex digest of the matched tier identifier, with the tier prefix (`x:`, `s:`, `p:`) so the storage location reveals the match confidence at a glance.

## 8. Multi-tier matching details

`lib/element-identity.mjs` (new):

```javascript
export function computeElementIdentity(handle /* Playwright ElementHandle */, opts) {
  // Tier 1
  const explicit = handle.getAttribute("data-vqa-id");
  if (explicit) return { id: `x:${sha1(explicit)}`, confidence: "explicit", source: explicit };

  // Tier 2
  const role = handle.getAttribute("role") || implicitRole(handle.tagName);
  const accName = computeAccessibleName(handle);   // existing Playwright accessibility tree
  const heading = nearestHeading(handle);          // walks DOM up, finds nearest h1-h6 text
  const text = (handle.textContent() || "").trim().slice(0, 60);
  const semantic = JSON.stringify({ role, accName, heading, text });
  if (role && (accName || text)) {
    return { id: `s:${sha1(semantic)}`, confidence: "semantic", source: { role, accName, heading, text } };
  }

  // Tier 3
  const path = domPath(handle); // existing
  const selector = handle.uniqueSelector?.() || handle.toString();
  return { id: `p:${sha1(`${selector}|${path}`)}`, confidence: "path", source: { selector, path } };
}
```

**Baseline matching at `diff-runs.mjs`:**
1. For each current capture: look up `baseline.captures[elementId]` by exact ID.
2. If no match, AND current confidence is `path`: also try semantic-fingerprint lookup against baseline (degraded match), and emit warning in report: "matched via semantic fingerprint despite path-tier identity — instrument with `data-vqa-id` for stability."
3. If still no match: emit `new` verdict for current, `removed` for baseline-only.

## 9. Backward compatibility

- All keys default to current behavior where applicable. Existing `.visual-qa.json` runs unchanged.
- Existing `comprehensive` runs gain `before.png` files (storage ~2x). Disable with `pairs.captureBeforeAfter: false`.
- `report.html` is additive — opt out with `report.html: false`.
- Tier-3 path-hash matching preserved as fallback, so existing baselines still resolve.

## 10. Testing

- `tests/visual-qa/element-identity.test.mjs` — golden cases for each tier
- `tests/visual-qa/targets-filter.test.mjs` — include/exclude precedence
- `tests/visual-qa/report-html.test.mjs` — snapshot tests for HTML output structure
- `tests/visual-qa/pairs-flow.test.mjs` — integration: capture → state shape → report rendering
- Regression: existing `tests/visual-qa/**/*` must stay green (target 1292 → ~1310+ after additions)

## 11. Per-platform port

Schema-only change. `lib/config-loader.mjs` already syncs to per-platform vendored copies via `scripts/sync-lib.mjs`. The new `targets`/`pairs`/`report`/`matching` keys flow automatically.

`report-html.mjs` + `element-identity.mjs` are pure-Node libs; they don't need per-platform port-specific behavior.

## 12. Known limitations

1. **Semantic fingerprint collisions.** Two buttons both labeled "Save" with the same nearest heading will hash to the same identity. Mitigation: `data-vqa-id` for elements where this matters; report warns when confidence is `semantic` to nudge instrumentation.

2. **Action vocabulary is small.** `click / fill / blur / select / hover` only in v1. Multi-step scenarios (login flow, wizard) need a future `scenarios` field — out of scope here.

3. **`report.html` requires modern browser.** Fullscreen API needs Safari ≥ 16 / Chrome ≥ 71. Falls back to non-modal full-page view on unsupported browsers.

4. **Storage growth.** ~2× current — before + after per element. `comprehensive.cache.gitDiffScope` still skips unchanged pages, so the multiplier applies only to actively-tested pages.

5. **Baseline diff via symlink.** On Windows / non-symlink filesystems, the impl copies the file (≈ same storage cost again per kept baseline). Documented; users on Windows-heavy teams may prefer `pairs.diffBaseline: false`.

6. **Tier-2 fingerprint can degrade across i18n changes.** A button whose label flips from "Save" → "저장" looks like a new element. Workaround: `data-vqa-id` (i18n-immune).

## 13. README / USAGE / CHANGELOG updates

- `README.md`: `/visual-qa` section gains a "Pair view" callout and an example screenshot of `report.html`.
- `README.md`'s "Known limitations" section: add the 6 items from §12.
- `docs/USAGE.md`: new subsection "Element-scope and instrumentation" — when to add `data-vqa-id`, common `actionsPerElement` recipes.
- `CHANGELOG.md`: v0.4.0 entry covering the three feature blocks.
- `README.ko.md`, `USAGE.ko.md`, `CHANGELOG.ko.md`: mirrors of the above.

## 14. Out of scope (v1)

- `scenarios` multi-step (login flow, etc.)
- Playwright trace.zip per capture (deferred for storage reasons)
- Record-and-replay UI
- AI-driven baseline rematch (when tier-3 falls back, asking LLM "is this the same element?")
- Cross-browser matrix beyond breakpoints (Safari/Firefox/Edge captures)
