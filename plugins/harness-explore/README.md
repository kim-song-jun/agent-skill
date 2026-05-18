# harness-explore

Theme D — exploration-focused codebase mapping for Claude Code. Sits
alongside `harness-builder` (install-time scaffolding), `harness-thrift`
(cost-conscious long sessions), and `harness-floor` (cost-unrestricted
multi-agent pipelines).

`harness-explore` is the **front-loaded discovery** layer: before a
session can be cost-managed (thrift) or quality-managed (floor), the
model has to know the codebase. Theme D builds that knowledge once,
caches it for the rest of the session (and across sessions if HEAD
hasn't moved), and answers structural queries against the cache rather
than re-grepping.

## What it does

- **Builds a structured codebase map** via parallel subagent fan-out
  (one subagent per top-level directory). Goal: <2 min for repos up to
  ~100K lines.
- **Caches the map keyed by `git rev-parse HEAD`** at
  `.explore-cache/<sha>.json`. Invalidates automatically when HEAD
  changes.
- **Builds a dependency graph** (regex-based import/export scanner)
  for TypeScript, Python, Rust, and Go.
- **Answers structural queries** against the cache: `/explore where
  <symbol>` and `/explore deps <file>` — both are O(1) cache lookups
  after the initial scan.

## Install

Once registered in the marketplace:

```
/plugin install harness-explore@<marketplace>
```

Then in your project:

```
/explore                       # full scan: phases 0–4, cache-aware
/explore where createSession   # which files define/export this symbol
/explore deps src/auth/session.ts   # imports + reverse-imports
```

## Pipeline (skill `/explore`)

| Phase | File | Purpose | Skippable on cache hit? |
|-------|------|---------|---|
| 0 | `phases/0-preflight.md` | git check + size check + cache lookup | No |
| 1 | `phases/1-fanout.md` | parallel dispatch (one subagent per top-level dir) | Yes |
| 2 | `phases/2-aggregate.md` | merge per-dir results into master map | Yes |
| 3 | `phases/3-deps.md` | regex-based import/export graph for TS/Py/Rust/Go | Yes |
| 4 | `phases/4-render.md` | write `.explore-cache/<sha>.json` + `docs/explore/<sha>-map.md` | Always |

## Configuration

`.explore.json` at project root (optional; defaults apply if missing):

```json
{
  "concurrency": 8,
  "subagentOutputTokenBudget": 4000,
  "ignorePatterns": [".git", "node_modules", "dist", "build", ".next", "target", "__pycache__"],
  "languages": ["ts", "tsx", "py", "rs", "go"],
  "query": { "autoScan": false }
}
```

## Output artefacts

- `.explore-cache/<sha>.json` — machine-readable map (auto-gitignored).
- `docs/explore/<sha>-map.md` — human-readable map (committable).

## Status

v0.1 — Claude-Code-only. Per-platform ports
(`harness-explore-codex|copilot|gemini|cursor`) deferred per the design
spec until the core has been measured in real use.

## References

- `docs/superpowers/specs/2026-05-18-harness-explore-design.md` — full
  design spec; this implementation tracks it section-by-section.
- `plugins/harness-floor/skills/visual-qa/` — pipeline-style skill
  pattern this skill mirrors for its scan phases.
- `plugins/harness-floor/skills/agent-all/` — orchestrator pattern this
  skill mirrors for its query commands.
- `plugins/harness-thrift/` — theme structure (phases + lib + templates)
  + cache-store atomicity precedent.
