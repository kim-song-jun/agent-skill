# agent-all ↔ wiki auto-loop ("all-in-one knowledge base") — Design Spec

> Status: DRAFT for user review (2026-06-22). Approved design decisions captured from the AskUserQuestion gate; architecture + file-level surface below. No implementation until this spec is approved.

**Goal:** Make `/agent-all` automatically *consult and grow* a project knowledge base in `.wiki/` as it works — reading relevant prior knowledge before planning, and recording each feature's plan + outcome after shipping — so the wiki becomes a self-maintaining, all-in-one memory of the project without the user ever manually invoking `/wiki`.

**Architecture:** A read→plan→build→record→audit loop woven into the existing agent-all phases, **default-on** with a `--no-wiki` opt-out. All page authoring stays LLM-orchestrated (consistent with the rest of agent-all); only the mechanical index/audit operations use code, and they are **install-safe** (no cross-skill imports — see Constraint C1).

**Tech stack:** existing agent-all phase docs + `lib/config-loader.mjs`; the wiki skill's `wiki-index.mjs` parse/route/append/compile logic (reused via a vendored helper, not cross-imported); `templates/page.md.tpl`.

---

## Approved decisions (AskUserQuestion, 2026-06-22)

| # | Decision | Choice |
|---|---|---|
| D1 | When / what | **Phase 2 (plan capture) + Phase 5 (outcome update)** |
| D2 | Toggle | **Default-on + `--no-wiki` opt-out** (config `wiki.auto`, default `true`) |
| D3 | Anti-bloat | **Topic-merge** — `routePhaseA(intent)` finds a related page → update it; else create |
| D4 | Improvements | **All four:** ① bidirectional loop (Phase 1 read) ② task-ID/PR cross-link ③ contradiction detection ④ compile gate on completion |
| D5 | Port scope | **CC + Codex first** (the only runnable-wiki ports); Copilot/Gemini/Cursor get an honest prose note, no auto-wiki |

## Global Constraints

- **C1 — No cross-skill / cross-install imports.** agent-all must NOT `import` the wiki skill's lib directly: on Codex, `agent-all-codex` (`.codex/skills/agent-all`) and `wiki-codex` (`.codex/skills/wiki`) install to different dirs, so a relative import resolves wrong (the exact ERR_MODULE_NOT_FOUND class fixed in v0.7.2). The mechanical wiki ops agent-all needs are provided by a small **`wiki-log.mjs` helper vendored into each port's own agent-all lib** via `scripts/sync-lib.mjs` (reusing `wiki-index.mjs`'s parse/append/compile logic), invoked install-anchored per port (`./lib/...` on CC; `./.codex/skills/agent-all/lib/...` on Codex) — the gate-check pattern.
- **C2 — Non-fatal.** A wiki step failing (no `.wiki/`, write error, compile drift) must NEVER fail the agent-all run. It logs a warning and continues. The wiki is an augmentation, not a gate on shipping code.
- **C3 — Honest port labeling.** Copilot/Gemini/Cursor agent-all phase docs state plainly that auto-wiki is unavailable on those ports (no runnable wiki lib), consistent with the v0.7.3 prose-only labeling.
- **C4 — Default-on but unobtrusive.** With no `.wiki/` present, Phase 1 read is a no-op; Phase 2 creates `.wiki/` + INDEX.md on first write (or skips if the project clearly has no wiki intent — see Open Q1).
- **C5 — Adversarial verification + version-bump tax** apply (this is a shared-release-train change): every implementation slice gets an independent opus adversary; touching synced libs requires `node scripts/sync-lib.mjs` + curated-count bump; 26-manifest + README/CHANGELOG version bump on release.

## The loop, phase by phase (CC flagship)

1. **Phase 1 — intent (READ, new gated step):** if `wiki.auto` and `.wiki/` exists, run `routePhaseA(intent)` + read the matched page(s); inject their BLUF + Decisions + Contradictions into the planning context so the plan builds on accumulated knowledge. No match → no-op.
2. **Phase 2 — plan (WRITE plan-capture, new gated step):** after the plan is formed, find-or-create the topic page (topic-merge via `routePhaseA`); write/update its **Details** (the plan + design decisions) at grade C (inferred/synthesised) and link the task ID. This is the "what we intend to build" record.
3. **Phase 5 — pr (WRITE outcome-update + cross-link + contradiction, new gated step):** after the PR/`--no-pr` completion, update the same page: outcome (what shipped), changed-file map, verification verdict, PR URL + task ID. Promote grade C→B (now backed by shipped code). **Contradiction detection:** if the shipped outcome diverges from a previously-recorded decision on that page, append both to the **Contradictions** section (never silently overwrite).
4. **Completion — COMPILE GATE (new gated step):** run `compileSelfAudit` (diff=0). On drift, emit a non-fatal warning naming the orphaned/missing pages (C2).

## File-level surface (CC; Codex mirrors via vendoring)

- `lib/config-loader.mjs` — add `wiki: { auto: true }` to `DEFAULTS` (:3/:19) + a boolean validate clause (:111).
- `templates/agent-all.config.json.hbs` — add the `wiki` block (default `auto: true`).
- `phases/0-preflight.md` — parse `--no-wiki` → `config.wiki.auto = false`; surface the resolved value.
- `phases/1-intent.md` — add the gated **Wiki recall** step.
- `phases/2-plan.md` — add the gated **Wiki plan-capture** step (find-or-create + write Details + task-ID link).
- `phases/5-pr.md` — add the gated **Wiki outcome** step (update + cross-link + contradiction) and the **compile gate**.
- `lib/wiki-log.mjs` (NEW, vendored) — install-safe helpers: `findOrCreatePage(wikiDir, topic)`, `linkTaskAndPr(page, taskId, prUrl)`, `recordContradiction(page, prior, now)`, and a re-export of `compileSelfAudit`. Reuses `wiki-index.mjs` logic; zero cross-skill import.
- `SKILL.md` — document auto-wiki + `--no-wiki`.
- `scripts/sync-lib.mjs` — vendor `wiki-log.mjs` to `agent-all-codex` (and the source-of-truth wiring); curated-count + totalChecked bump.
- **Codex port:** mirror the four phase-doc steps into `agent-all-codex/phases/*` (install-anchored paths), vendor `wiki-log.mjs`, config.
- **Copilot/Gemini/Cursor:** one honest prose line in their agent-all phase docs that auto-wiki is CC/Codex-only (C3).

## Test / verification plan (real behavior, no pass-only)

- config: `wiki.auto` defaults to `true`; `--no-wiki` and `.agent-all.json` override to `false`; validate rejects non-boolean.
- `wiki-log.mjs`: `findOrCreatePage` creates on no-match and returns the existing page on a routePhaseA hit (topic-merge); `recordContradiction` appends both sides, never overwrites; `linkTaskAndPr` injects the task-ID + PR link; compile re-export gates diff=0 (reuses the existing vacuous-pass guards).
- phase-doc contract: phases 1/2/5 each contain the gated wiki step (and gate it on `wiki.auto`); the compile gate is wired; the step is honestly absent/prose-noted on prose ports.
- install-anchor: a port-ssot scan asserts the `wiki-log.mjs` import string is install-anchored per port (no bare `./lib` from the wrong cwd).
- adversarial round: independent opus verifier per slice + a whole-feature review (does default-on actually dispatch the steps? does a no-`.wiki/` run stay a clean no-op? does contradiction actually fire on a conflicting outcome?).

## Resolved (AskUserQuestion, 2026-06-22)

- **Q1 — first-write trigger → AUTO-CREATE.** On a project with no `.wiki/`, Phase 2 auto-creates `.wiki/` + `INDEX.md` on the first agent-all run, and the very first creation prints a one-line notice: `started a project wiki at .wiki/ — disable with --no-wiki`. (Matches the default-on, true all-in-one intent.)
- **Q2 — release vehicle → v0.7.4** on the shared train (CC+Codex runnable; Copilot/Gemini/Cursor prose-note only).

## Non-goals (v1)

- No auto-wiki on Copilot/Gemini/Cursor (prose ports — honest note only).
- No automatic grade-A promotion (stays C→B; A is reserved for human-cited primary sources).
- No background/hook-driven indexing outside the agent-all flow (the SessionStart status digest already exists and is unchanged).
