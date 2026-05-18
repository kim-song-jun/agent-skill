# harness-explore — implementation notes

Companion to the design spec at
`docs/superpowers/specs/2026-05-18-harness-explore-design.md`. This
file captures DECISIONS made during the v0.1 implementation that go
beyond the spec — what tradeoffs were taken, what was deferred, where
the seams are.

Read the spec first; this doc only documents deltas.

## 1. Regex-based dependency extractor

The spec called for regex scanners as the v1 implementation and an
AST upgrade as a v2 follow-up. Implementation matches that decision.
Per-language accuracy tradeoffs:

| Language | Captured | Missed | False positives |
|---|---|---|---|
| TypeScript / JS | `import X from "spec"`, `import { A } from "spec"`, `import * as ns from "spec"`, side-effect `import "spec"`, `require("spec")`, `export ... from "spec"`, `export const/let/var/function/class/interface/type/enum`, `export { A, B as C }`, `export default function/class NAME` | Dynamic `import()` calls, `export * from "spec"` re-exported names (the FROM is captured; the names are not), conditional imports inside functions | Import-like strings inside template literals or multi-line strings (line/block comments are stripped) |
| Python | `import a`, `import a.b as c`, `from .rel import x`, `from pkg.sub import name`, top-level `def`, `class`, ALL_CAPS module constants, `__all__` list | `__import__()`, `importlib.import_module()`, conditional imports (regex doesn't care about scope — these are CAPTURED, but their resolution is wrong if conditional on platform) | Same as TS — import-like strings in docstrings (line `#` comments are stripped) |
| Rust | `use crate::...`, `use super::...`, `use self::...`, `use ext::mod::Item`, `use a::b::{c, d}` (path captured verbatim, brace contents not split), `pub fn/struct/enum/mod/trait/const/static/type` | Macro-generated `use` (e.g., from `use_macros!`), `extern crate` (deprecated form), conditional `#[cfg]` `use` | None significant — `use` statements are line-anchored |
| Go | `import "spec"`, `import alias "spec"`, `import (...)` blocks, top-level capitalised `func`, `type`, `const`, `var` | Build-tag-gated imports (file IS scanned regardless of `//go:build`), `cgo` imports embedded in C-style comments | None significant |

**When this hurts:** large TS codebases that lean on `export * from`
barrel files (the dep graph will UNDERCOUNT imports). Workaround: the
human-readable map still lists those barrels as entry points; the
`/explore where` query has a ripgrep fallback for symbols the cache
doesn't know about.

**v2 plan:** swap to a tree-sitter-based scanner per language. Defer
until v0.1 has been measured in real use (per spec §11).

## 2. Tree walker — gitignore subset

`loadGitignore()` reads `.gitignore` + `.explore-ignore` but only
honours a subset of gitignore semantics in v1:

- **Honoured:** basename match, `*` and `?` globs, trailing `/` for
  dir-only, leading `!` for negation (first-match-wins, no
  re-include).
- **Reduced:** anchored patterns (`/foo/bar`) collapse to basename
  match. So `/build` and `build/` and `build` all match any directory
  named `build` anywhere in the tree.
- **Not honoured:** `**`, `[abc]` character classes.

**When this hurts:** repos that want to ignore `dist/` at root but
keep a nested `node_modules/scoped/dist/`. v1 will ignore both.
Workaround: list specific paths in `.explore-ignore` if needed;
v2 will adopt full gitignore semantics (probably via the `ignore`
package, currently dependency-free is preferred).

## 3. Cache atomicity

`cache-store.save()` writes `<sha>.json.tmp` then `renameSync()` —
this is atomic on POSIX (and on NTFS with the same volume), which
covers the supported platforms. We do NOT use `fsync` before rename;
a power loss between write and rename leaves a `.tmp` file that's
ignored by `list()`. If a future GC needs to clean stale `.tmp`
files, add it to a separate `gc()` function rather than load.

The cache `schemaVersion` is consulted on load. A mismatch returns
`{ok: false, reason: "schema-mismatch"}` and the caller treats it
as a miss. This means schema bumps force a clean re-scan; the old
cache file is left on disk until `--force` or the next manual
cleanup. (No automatic eviction in v1 — see spec §15.)

## 4. Query engine — pass ordering

Why the 4-pass order (exports → symbols → fuzzy → ripgrep)?

1. **Exports first** — the cleanest signal: the symbol is explicitly
   exposed from a module.
2. **Symbols second** — the symbol is defined but maybe not exported
   (private helper, local function); useful for "I know it exists,
   show me where" queries.
3. **Fuzzy third** — handles typos and slight name drift
   (`createSeasion` → `createSession`).
4. **Ripgrep last** — handles cache staleness (symbol added after the
   last scan) and best-effort substring search. The query engine
   doesn't shell out itself — callers inject the ripgrep fn — so
   tests stay hermetic.

The first non-empty pass wins. If pass 1 returns hits, passes 2–4 are
not consulted (mirrors the spec's "pass 1 → pass 2 → ..." language).

## 5. Subagent dispatch — contract, not call

`dir-subagent-prompt.mjs#render()` returns a STRING. It does NOT
dispatch any subagent. Dispatch is the orchestrator's job (the
`/explore` skill walks the dir list and uses the platform `Task`
tool or the `superpowers:dispatching-parallel-agents` primitive).

Why this split?
- Keeps the lib pure (testable without spawning agents).
- Cross-platform ports (codex, copilot, gemini, cursor) will reuse
  the prompt rendering verbatim but supply their own dispatch
  primitive.
- The aggregation contract (JSON shape, validation rules) lives in
  the prompt template + Phase 1's orchestrator docs; both sides
  reference the same schema.

The orchestrator does NOT trust the subagent's self-reported
`incomplete: true` — it sets that flag itself based on JSON parse +
required-field validation. This protects against rogue subagent
replies.

## 6. State file vs cache file

| File | Purpose | Gitignored? |
|---|---|---|
| `.explore-state.json` | Per-run scratchpad — phase ledger, per-dir replies before aggregation, dep errors, etc. Overwritten on each `/explore` invocation. | Yes |
| `.explore-cache/<sha>.json` | The canonical map. Atomic-written; consulted by query commands. One file per SHA. | Yes (dir-level) |
| `docs/explore/<sha>-map.md` | Human-readable map. Committable. | No |

The state file is intentionally short-lived; the cache file is
intentionally durable. Splitting them keeps the "is this scan
finished?" question decoupled from "do we have a usable map?".

## 7. Render shim

`skills/explore/lib/_render-shim.mjs` re-exports from
`bin/lib/render.mjs` (the same vendored copy used by `install.mjs`).
This avoids cross-plugin imports while keeping a single source of
truth for the template renderer per plugin.

The shim is intentionally a one-liner — it exists ONLY to keep the
import graph clean. If `_render-shim.mjs` ever grows logic, it should
move into a proper lib module.

## 8. Performance budgets

| Phase | Budget | What happens if blown |
|---|---|---|
| 0 — Preflight | < 2s | Likely git problem; abort with helpful message |
| 1 — Fan-out | ~30–90s (medium repo) | No hard cap; subagents are token-bounded individually |
| 2 — Aggregate | < 1s | Pure JS merge; should never blow |
| 3 — Dep graph | < 30s for 50K files | Single-process Node; bounded worker pool size = `min(cpus, 8)` |
| 4 — Render | < 2s | Template render + 2 file writes |

If Phase 3 starts to blow on large monorepos: add a streaming
implementation behind a `--stream-deps` flag (v2 follow-up).

## 9. What's intentionally NOT implemented in v0.1

- `/explore gc` cache-eviction command (spec §15).
- Cross-package monorepo stitching (spec §13 Q4).
- AST-based extraction (spec §15).
- Symbol extraction for Rust + Go (imports-only — spec §7 note).
- Real-time map updates on file save (spec §15).
- Per-platform ports (`harness-explore-codex|copilot|gemini|cursor`)
  (spec §11, §12 — deferred until v0.1 measured in real use).

## 10. Test strategy

Tests live in `tests/lib/explore-*.test.mjs`:

- `tree-walker` — top-level enumeration, ignore patterns, depth caps,
  symlink handling, empty dirs, gitignore loading.
- `dependency-extractor` — one suite per language; each covers a
  basic import, an export, and a malformed-source graceful pass.
- `cache-store` — round-trip, schema-mismatch invalidation, atomic
  write (tmp file cleanup), invalidate, list.
- `query-engine` — `where` exact / symbol / fuzzy / ripgrep-fallback;
  `deps` ok / not-in-map / no-dep-graph; `summarize` token-bounded.
- `render` — `map.md.hbs` + `query-prompt.md.hbs` smoke-render with
  minimal fixtures.

Scenario integration tests (per spec §10.3) are deferred to a
follow-up; v0.1 ships the unit suite only.
