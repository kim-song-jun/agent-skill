# agent-all ↔ wiki auto-loop — Implementation Plan (v0.7.4)

> Spec: `docs/superpowers/specs/2026-06-22-agent-all-wiki-loop-design.md`. Skeleton-first (lib layer → orchestration layer → port → release). Each task: implement → independent opus adversary → fix → pathspec commit. Default-on `wiki.auto`, `--no-wiki` opt-out, topic-merge, Phase 2+5, bidirectional read, cross-link, contradiction, compile gate. CC+Codex; prose ports get an honest note.

**Global constraints:** C1 no cross-skill import (vendor wiki-index.mjs into agent-all lib; wiki-log imports `./wiki-index.mjs` local; install-anchored per port). C2 non-fatal (wiki failure never fails the run). C3 honest prose-port labeling. C4 auto-create `.wiki/` on first write with a one-line notice. C5 adversarial verify + version-bump tax.

## W1 — Config foundation
- `lib/config-loader.mjs`: add `wiki: { auto: true }` to DEFAULTS; validate `wiki.auto` is boolean.
- `templates/agent-all.config.json.hbs`: add `"wiki": { "auto": true }`.
- Test: defaults `wiki.auto===true`; `.agent-all.json` `wiki.auto:false` overrides; non-boolean rejected.

## W2 — Keystone lib (`wiki-log.mjs`) + vendoring
- sync-lib: add agent-all/lib (CC) + agent-all-codex/lib as vendor targets for `wiki-index.mjs` (source = wiki skill copy). agent-all gets a LOCAL `wiki-index.mjs` copy → no cross-skill import.
- NEW `lib/wiki-log.mjs` (CC source, imports `./wiki-index.mjs`): `ensureWiki(dir)` (auto-create .wiki/+INDEX.md, returns {created}); `findOrCreatePage(dir, topic)` (routePhaseA → existing slug or new); `upsertPageSection(dir, slug, section, body)`; `linkTaskAndPr(dir, slug, {taskId, prUrl})`; `recordContradiction(dir, slug, {prior, now})`; re-export `compileSelfAudit`. All non-throwing (return {ok,...}).
- sync-lib: add `wiki-log.mjs` source → agent-all-codex vendor; totalChecked + curated-count bump.
- Tests (real behavior, tmp dirs): ensureWiki creates + is idempotent + notice-once; findOrCreatePage topic-merge (routePhaseA hit → existing, miss → new); recordContradiction appends both, never overwrites; linkTaskAndPr injects; compile re-export gates diff=0; every fn non-throwing on bad input.

## W3 — CC phase-doc wiring + contract
- `phases/0-preflight.md`: parse `--no-wiki` → `config.wiki.auto=false`; surface resolved value.
- `phases/1-intent.md`: gated Wiki-recall step (routePhaseA(intent) → read matched page → inject BLUF/decisions into planning).
- `phases/2-plan.md`: gated Wiki plan-capture (ensureWiki+notice → findOrCreatePage → write Details=plan/decisions grade C → linkTask).
- `phases/5-pr.md`: gated Wiki-outcome (upsert outcome+file-map+verdict, grade C→B, linkPr, recordContradiction on conflict) + compile gate (non-fatal warn on drift).
- `SKILL.md`: document auto-wiki + `--no-wiki`.
- Test: phase-doc contract — phases 1/2/5 contain the gated wiki step + gate on `wiki.auto`; compile gate wired; install-anchored import string (port-ssot INSTALL_ANCHOR_SCAN entry).

## W4 — Codex port
- Mirror W3 phase-doc steps into agent-all-codex/phases (install-anchored `./.codex/skills/agent-all/lib/...`).
- Vendor wiki-index.mjs + wiki-log.mjs into agent-all-codex/lib (sync-lib); config + template + SKILL.
- Test: codex phase-doc contract + install-anchor scan + sync-lib --check green.

## W5 — Prose ports (honest note)
- Copilot/Gemini/Cursor agent-all phase docs: one honest line — auto-wiki is CC/Codex-only (no runnable wiki lib). Test asserts the note + asserts NO runnable wiki-log import on those ports.

## W6 — Adversarial whole-feature verify + release v0.7.4
- Workflow: default-on actually dispatches the steps? no-`.wiki/` run = clean no-op + notice? contradiction fires on conflict? install-anchored on Codex? compile gate non-fatal?
- Version bump 0.7.3→0.7.4 (26 manifests + README/ko badge+version + CHANGELOG/ko + manual generator + version tests + doc-contract). Full suite green. Commit pathspec + push + tag v0.7.4 + rc. Reinstall 3 CLIs + content-verify.

## Ledger
- [ ] W1 config  - [ ] W2 wiki-log  - [ ] W3 CC phases  - [ ] W4 Codex  - [ ] W5 prose  - [ ] W6 release
