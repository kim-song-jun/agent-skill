# Design — dirty-tree agent-all + decoupled robust wiki + /wiki init

- Date: 2026-06-23
- Status: DRAFT (brainstorming complete, pending user review → writing-plans)
- Origin: posco-mds live finding — `/agent-all` never ran on a real (dirty) tree, so the wiki never accumulated; the v0.7.6 "deterministic preflight ensureWiki" fix was itself unreachable because the clean-tree gate aborts *before* it.

## Problem

1. **agent-all requires a clean tree.** `phases/0-preflight.md` Step 2 aborts when `git status --porcelain` is non-empty. Real projects (posco-mds: 13 uncommitted changes) are almost always dirty → agent-all effectively can't run during active development.
2. **The wiki is welded to agent-all.** The "gets smarter" engine (wiki accumulation in Phase 1/2/5) only runs inside agent-all, which can't run on a dirty tree → the wiki stays empty → no accumulation → no retrieval next time.
3. **Workflow is the escape hatch but loses everything.** Users fall back to `Workflow` (no clean-tree gate), but it has no wiki / memory / verification gate / PR pipeline.

## User-gated decisions (all via AskUserQuestion, 2026-06-23)

- **① agent-all dirty-tree support = PROTECT mode.** On a dirty tree, snapshot the pre-existing uncommitted files, treat them as **read-only**, and commit **only the files agent-all itself changed** (pathspec). This is global git-safety rule 9 applied to agent-all.
- **② Auto-wiki = ROBUST redefinition (not forced Stop-hook).** Investigation showed forced Stop-hook auto-capture is feasible but fragile (no guarantee the LLM records, slows every turn, non-official pattern, unverified). Instead: agent-all work accumulates via ① (robust); work *outside* agent-all (workflow / plain chat) uses a Stop-hook **reminder** (not a forced block) plus a lightweight `/wiki-log` command.
- **③ `/wiki init`** — a sub-command on the existing `/wiki` skill (no new plugin) that configures *when* and *what* the wiki auto-captures.
- **Sequence: ① first, then ②③.** ① alone restores robust wiki accumulation for agent-all work as a side effect; ②③ extend coverage to non-agent-all work.
- **SCOPE NARROWED (2026-06-23, post-investigation) — ① ONLY.** Investigation confirmed ②③ are already covered by shipped assets: **adversarial-verifier** (Phase 4 default-on, opus, self-report-blind), **memory-agent** (`.agent-skill/memory/` checkpoint + scratchpad), and the **llm-wiki auto-loop** (Phase 1 read / 2·5 write). The root cause of "wiki never accumulated" was NOT a missing feature — it was agent-all not running on a dirty tree. **① alone re-activates all three in real (dirty) work.** ②③ are DROPPED (YAGNI / the project's #1 waste trap: "ALREADY SHIPS — do NOT rebuild"). The only residual gap — auto-capture for *pure* non-agent-all work (plain chat / raw workflow) — is low-value and already served by manual `/wiki`.

## ① agent-all dirty-tree support (PROTECT mode)

### Flow
- **Phase 0 Step 2** changes from `abort-if-dirty` to:
  - clean → `state.dirtySnapshot = []` (unchanged path).
  - dirty → enter PROTECT mode: capture the uncommitted file list into `state.dirtySnapshot`, **show it to the user + warn that these files may influence the break-condition test result (decision B below), and get confirmation** (AskUserQuestion; no silent auto-proceed — global rule 14). Persist `dirtySnapshot` into the checkpoint so `--resume` restores it.
- **Phase 3 (dispatch)**: inject `dirtySnapshot` into the dispatch prompt's existing **"Forbidden files"** field (instruction layer).
- **Phase 3c (commit)**: before staging, intersect the changed files with `dirtySnapshot`; stage/commit **only the complement** via explicit pathspec. A protected file showing up in the diff → warn (it means a subagent edited a protected file despite the guard).
- **Phase 6 (loop / break-condition)**: cannot fully isolate dirty files from the test (git stash is forbidden — rule 6). Mitigation = the Phase-0 up-front warning + reporting `dirtySnapshot` non-empty in the `AfterBreakCondition` policy event.

### Reuse (from Explore audit)
- `lib/git-state-reader.mjs` `readGitState().statusLines` → derive `dirtySnapshot`. Add `export function parseDirtyPaths(statusLines)` (handles `XY path` and rename `->` rows) so Phase 0/3/5 share one parser.
- `lib/pathspec-policy.mjs` `analyzeShellCommand()` already blocks `git add -A`, bare `git commit`, `git commit -a`. Add an `options.protectedPaths` check so `git add <protected>` / `git checkout <protected>` are blocked too.

### The real implementation weight — Edit/Write guard (architecture gap)
The current `agent-policy-hook.mjs` only guards **Bash** (`git add`/`commit`). It does **not** guard subagent `Edit`/`Write`. The dispatch "Forbidden files" field is an *instruction*, not *enforcement*. To make PROTECT real, add a **PreToolUse Edit|Write hook guard** that blocks writes to any path in `dirtySnapshot`. Without this, protection is advisory only.

### Persistence
Add `dirtySnapshot` as a first-class field in the checkpoint schema (`lib/memory-agent.mjs` flush/recall) so a mid-run death + `--resume` does not lose the protected set.

## ② Robust auto-wiki (decoupled)

- **agent-all work** → already accumulates via ① (Phase 2 plan grade C, Phase 5 outcome grade B). ① makes this run on dirty trees, so this is the robust 90%.
- **Outside agent-all (workflow / plain chat)**:
  - **`/wiki-log [<topic>]`** — lightweight command: ensure `.wiki/`, topic-merge route, write a short page from the current work. Works regardless of git state. (Reuses `wiki-log.mjs` mechanics: `ensureWiki` / `findOrCreatePage` / `writePage`.)
  - **Stop-hook REMINDER (not a forced block)** — on session end, if `git diff` shows meaningful change and no wiki entry was made this session, surface a reminder to run `/wiki-log` (and/or set a "pending" flag that the next SessionStart digest mentions). It MUST NOT force an extra LLM turn via `decision:block` (the fragile path we rejected) and MUST honor `stop_hook_active` to avoid loops.
- Explicitly **out of scope (YAGNI)**: forced `decision:block`+`continue` Stop-hook auto-capture.

## ③ `/wiki init`

- New sub-command on the existing `/wiki` skill (lands in harness-floor wiki skill; no 20th plugin — checksum/badge guards).
- Writes/updates the `wiki` block of `.agent-all.json` (single config SSOT):
  - `wiki.capture.when`: `"agent-all"` (default — only via the pipeline) | `"session-end"` (Stop-hook reminder on) | `"manual"` (only `/wiki-log`).
  - `wiki.capture.what`: which of {work summary, key decisions, file map}.
  - `wiki.model`: reuse existing (default `haiku`).
- Interactive wizard; non-TTY/`--yes` → defaults.

## Cross-cutting: Definition of Done (the adversarial-verification lesson)

Unit-test-green is NOT done (this session's repeated trap, memory lines 100/120/141). DoD for each slice includes a **live probe on a real dirty tree (posco-mds)**:
- ①: on posco-mds (dirty), `/agent-all "<small task>"` enters PROTECT mode, the 13 pre-existing changes are untouched (a Write to one is blocked), the commit/PR contains only agent-all's files, and `.wiki/` accumulates a page.
- ②: a `/wiki-log` call outside agent-all writes a topic-merged page; the Stop-hook reminder fires on a meaningful session and stays silent on a no-op one.
- ③: `/wiki init` produces the expected `.agent-all.json` wiki block and the chosen `when` mode actually governs ②.

## Out of scope / YAGNI
- Forced Stop-hook LLM-turn auto-capture (②, rejected as fragile).
- Full test isolation of dirty files (impossible without forbidden git stash).
- Codex/Copilot/Cursor/Gemini ports of ①②③ — CC first; port only after CC is live-verified.

## Build order (SCOPE NARROWED 2026-06-23 → ① only)
1. **① dirty-tree PROTECT** — the only slice. Plan: `docs/superpowers/plans/2026-06-23-dirty-tree-protect-mode.md`. Preflight snapshot + confirm/warn, parseDirtyPaths, Edit/Write guard hook, Phase 3c pathspec filter, pathspec-policy protectedPaths, checkpoint field. Live-verify on posco-mds.
2. ~~②③ decoupled wiki~~ — **DROPPED.** Covered by existing assets (adversarial-verifier, memory-agent, llm-wiki auto-loop); ① re-activates them on dirty trees. The residual auto-capture gap for pure non-agent-all work is low-value and served by manual `/wiki`.
