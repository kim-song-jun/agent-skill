> 🇰🇷 한국어: [CHANGELOG.ko.md](CHANGELOG.ko.md)

# Changelog

All notable changes to this project. Date-stamped tags exist for each release candidate.

## Unreleased

## Agent-skill v0.7.2 — 2026-06-22

### Adversarial-verification remediation (three verify→fix→re-verify rounds)

A multi-round adversarial review (independent opus verifiers running the *literal* operator commands, not paraphrases) found that v0.7.1 was unit-test-green but carried real per-port runtime defects. Every fix below was confirmed by re-executing the exact command/input an operator emits.

- **Install-anchored phase-doc imports (ERR_MODULE_NOT_FOUND fix, repo-wide):** Phase-doc lib imports used a bare `./lib/...` which, from the mandated repo-root cwd, resolved to `<repo-root>/lib/...` and crashed on real installs. Anchored every import to its install location across all install-to-subdir skills — `agent-all-{codex,copilot,cursor}`, `visual-qa-codex`, and `debug-codex` (e.g. `./.codex/skills/agent-all/lib/...`). A new `INSTALL_ANCHOR_SCAN` guard asserts the literal phase-doc import string per (port, skill), closing the class repo-wide. (In-place Claude ports legitimately keep `./lib/`; Gemini ships no project lib and is documented as reference-logic.)
- **Adversarial gate is a deterministic, exit-coded decision (C2/C4 honesty):** `adversarialAuditBlocks()` had no runtime caller — blocking was prose. Added `lib/policy/gate-check.mjs` (calls `adversarialAuditBlocks`, **exits 2 on `VERIFICATION_AUDIT: failed`**, 0 otherwise), vendored to codex/copilot/cursor, and wired into all four ports' Phase-4 gate as `printf '%s' "$ADV_AUDIT_TEXT" | node <path>/gate-check.mjs`. The block *decision* is now code (exit-coded); SKILL.md states honestly that the *invocation* is still orchestrator-issued. A doc-contract test runs the literal per-port command (install-simulated) and asserts exit 2.
- **`quality-debt-reviewer` gates the wave on every port:** Cursor and Codex dispatched it but omitted its verdict from the Phase-4 pass conditions (advisory-only). Added the binding clause so quality debt blocks on all ports.
- **Gemini honest downgrade:** Gemini advertised `adversarialVerify` (never dispatched) and `/agent-handoff` + `--resume` it cannot run. Set `adversarialVerify:false` in the Gemini config template (the default gate plan no longer emits the adversarial dispatch), reconciled the phase docs to treat lib snippets as reference logic (gemini-init copies no project lib), and disclosed in SKILL.md that `/agent-handoff` is not bundled on this port.
- **Wiki compile gate no longer vacuously passes:** `compile` reported `ok ... diff=0` for a nonexistent dir, missing/`INDEX.md`-as-directory, malformed-grade rows, unparseable-link rows, `<3`-column page rows, and pages declared in a non-first column. The parser now records every page-declaring-but-malformed row (scanning all cells) and `compileSelfAudit` fails (`ok:false`) on a missing/non-regular `INDEX.md` (via `statSync().isFile()`) — a genuinely-empty-but-valid wiki still passes.
- **Atomic checkpoint write + crash recovery:** `memory-bridge` `write()` now writes a temp file and `renameSync`s it (atomic on POSIX) so a crash never leaves a truncated `checkpoint/LATEST`; `recallLatestCheckpoint` falls back to the newest per-wave history checkpoint when `LATEST` is missing or corrupt.

Suite: 2246/2246 passing.

## Agent-skill v0.7.1 — 2026-06-22

### Made v0.7.0 actually work (functional fixes)

A hard functional adversarial review found v0.7.0 was unit-test-green but effectively inert in real installs. Fixed across all ports (Claude Code, Codex, Copilot, Cursor, Gemini):

- **Adversarial verifier DEFAULT-ON:** `adversarialVerify` was `false` by default and undiscoverable — real agents never invoked it. Default flipped to `true`, surfaced in the config template, config-loader, and SKILL entrypoint so every agent-all run triggers it out of the box.
- **Real block enforcement (Phase-4 4b machine gate):** The wave-block was unenforced prose. `adversarialAuditBlocks()` is now a real executable function wired as a mandatory machine gate in Phase-4 step 4b — blocks cannot be silently bypassed.
- **Runnable memory snippets:** `storeRepoMemory` / `recallRepoMemory` crashed on real runs due to a missing `join` import from `node:path` and a stale cross-plugin bridge import. Both imports corrected; memory flush/recall now runs end-to-end.
- **Installer lib copying (ERR_MODULE_NOT_FOUND fix):** Codex, Copilot, and Cursor installers did not recursively copy the `lib/` tree that phase docs import at runtime. All three installers now copy the full lib subtree, resolving `ERR_MODULE_NOT_FOUND` on real installs.
- **Real /wiki CLI entrypoint:** `/wiki` had no executable CLI entry. A real entrypoint is now wired.
- **Functional test coverage:** install-coverage, default-adversarial, and block-enforcement functional tests added. Independently re-verified by real install-and-run probes per port.

### Cursor support (G13)

- **Cursor port of smartness:** Ported the adversarial verifier (DEFAULT-ON), memory/checkpoint integration, and the prose wiki to the Cursor agent-all port. Cursor now has full parity with the Claude Code, Codex, Copilot, and Gemini ports for these features.

Suite: 2205/2205 passing.

## Agent-skill v0.7.0 — 2026-06-21

### Smarter agent-all

- **Independent adversarial verifier (G1):** `adversarialVerify({diff, acceptanceCriteria, breakCondition, cwd})` re-derives the verdict solely by running `breakCondition` via `runVerificationAdapterSpec` — no implementer self-report in the signature. Emits `verification-evidence/v1` with the literal `VERIFICATION_AUDIT: passed/failed` audit string. A `toString()` structural-signature guard ensures structural independence cannot be silently removed by a single edit. Real `defaultCommandRunner` integration test included.
- **Phase-4 gate wiring fix (G2 + final-review):** Wired Phase-4 adversarial step to invoke the canonical `adversarialVerify()` wrapper (not the low-level `runVerificationAdapterSpec()` directly), so the structural-independence guard has a real production caller. A new `phase-gate-contract` test pins this wiring. `adversarialVerify:false` default keeps existing callers green; gate-plan tests +3 (curated smoke 498→501).
- **No-git file+JSONL memory agent (G3):** Layer 1 reuses Copilot `makeFileMirror`/`storeRepoMemory`/`recallRepoMemory` at `.agent-skill/memory/` with a free-form scratchpad field. Layer 2 appends `.agent-skill/runs/<runId>/memory-log.jsonl` under `memory-log/v1`. Zero git ops. Exports `sanitizeRunId` + `memoryLogPath` for G4 reuse. Context-reset test nulls the adapter so recall provably reads from disk.
- **Auto-flush checkpoint with mid-3a context survival (G4):** Capture moved to `3a.0` (pre-dispatch), covering deaths during scoping. `flushCheckpoint` writes a fixed-key `checkpoint/LATEST` pointer plus a history key so a post-death session recovers with no lost wave/iter coordinate via `recallLatestCheckpoint`. Phase-0 step 5b reconstructs `state.resumeCheckpoint` from disk; Phase 3 re-enters the dead wave at `3a` from `miniPlans`. Genuine end-to-end round-trip test + no-op flush teeth check.
- **Composition proof + live-run runbook (G5):** `adversarial-verifier-isolation.test.mjs` proves G1 (block/pass with exact audit literals) and G4 (mid-3a checkpoint round-trips from disk; no-fileMirror → `ok:false`) compose end-to-end with no deleted-fixture dependency. `g5-live-proof-checklist.md` is the operator runbook for the user-driven live `/agent-all` proof. Memory-agent context-reset test strengthened with fresh-mirror + rm-mirror disk-recall proof.
- **Codex port (G6):** Vendors `adversarial-verifier.mjs`, `memory-bridge.mjs`, and `memory-agent.mjs` (with Codex-local import rewrite) into `harness-floor-codex` via `sync-lib`. Codex `4-gate.md` Step 3-adversarial invokes the `adversarialVerify` wrapper (Codex sequential idiom; raw `runVerificationAdapterSpec` bypass forbidden). `3a.0` checkpoint + Phase-0 resume wired to the Codex-local memory agent. `port-ssot E5` un-skipped for Codex. Real child-process adversarial + checkpoint tests.
- **Copilot port (G7):** Mirrors the proven G6 port using the Copilot task primitive (not Codex shell idiom). Copilot `4-gate.md` Step 3-adversarial invokes the `adversarialVerify` wrapper (opus tier). `memory-agent.mjs` vendored via shared local import-rewrite transform (no duplicate function). `3a.0` checkpoint + Phase-0 resume wired. `port-ssot E5` un-skipped for Copilot (last deferred skip). Smartness now on CC + Codex + Copilot.
- **CC plugin made self-contained (final-review fix):** The flagship Claude Code plugin's memory-bridge import was rewritten to be self-contained (no cross-plugin import). `g5-live-proof-checklist.md` Evidence 4 updated to point at the CC-local memory-bridge.

### llm-wiki skill

- **CC-native llm-wiki skill (G8):** Full Karpathy-pattern wiki implemented as a Claude Code skill (`harness-floor` / `wiki`). `routePhaseA` branches cover exact-slug, title-substring, disambiguation, tag-only, and no-match cases — all test-covered. `SessionStart` hook emits a daily status digest. `compile` command runs a self-audit gate to catch stale or missing pages. `formatIndexRow` de-exported (no consumer). Curated smoke 501→523.
- **Codex near-native llm-wiki skill (G9):** Mirrors the CC wiki as a real Codex skill (`harness-floor-codex` / `wiki-codex` → `.codex/skills/wiki`). `wiki-index.mjs` vendored; routes, page schema, and on-disk fixture tests match CC. `PreToolUse` first-call digest (no `SessionStart` hook available). MIT attribution preserved. Curated smoke 523→532.
- **Copilot + Gemini prose-only ports (G10/G11):** Inlined wiki prose into `copilot-instructions.md.hbs` and `GEMINI.md.hbs` host context templates. Adds command verb specs (write/update/compile/status/list + bare-query Phase A router), page schema (BLUF/Details/Provenance/Contradictions/Related; frontmatter title/slug/grade/tags/updated), `SessionStart` status-digest instruction, Karpathy LLM-Wiki (MIT) attribution, and honest prose-only / #27 labeling. No runnable surface, no hook, no new plugin. Doc-surface contract tests: `tests/lib/copilot/wiki-prose-surface.test.mjs` (19 tests) and `tests/lib/gemini/wiki-prose-surface.test.mjs` (20 tests). Curated smoke 532→571.
- **Cursor excluded** — no wiki port; Cursor MDC surface does not support the required tool dispatch pattern.

Suite: 2205/2205 passing; focused release smoke 571/571 passing.

## Agent-skill v0.6.17 — 2026-06-20

- Corrected the Copilot port to use the documented hook contract:
  versioned `{version: 1, hooks: {...}}` JSON, command entries, real Copilot
  tool matchers (`bash`/`powershell`, `view`, `create`/`edit`), and current
  `subagentStop` identity fields (`agentName`, `sessionId`, `transcriptPath`,
  `stopReason`).
- Removed active Copilot floor instructions that depended on undocumented
  public `read_agent` / `list_agents` / memory primitives. `/agent-all`,
  `/visual-qa`, and `/thrift` now document file-backed state, prompt-level task
  results, and optional lifecycle hooks honestly.
- Corrected Gemini floor subprocess orchestration for Gemini CLI 0.47:
  wrappers invoke `gemini -p ... --output-format json --skip-trust`, capture
  stdout into per-task result files, and normalize Gemini auth/error JSON
  envelopes as failed task results.
- Made `harness-thrift-copilot` file-backed by default, with any memory mirror
  treated as an explicit private host adapter rather than a public Copilot CLI
  primitive.
- Added regression coverage for Copilot hook schemas, Copilot lifecycle
  payload normalization, Gemini subprocess flags/output capture, Gemini error
  envelopes, and cross-platform visual-qa dispatch docs.
- Suite: 2037/2037 passing; fast release smoke 498/498 passing.

## Agent-skill v0.6.16 — 2026-06-20

- Hardened `scripts/install-all.sh` so local Claude plugin-manager installs
  refresh the `agent-skill` marketplace and run `claude plugin update` after
  install, ensuring already-installed plugins move to the latest active version.
- Added a regression test for the install/update call sequence discovered while
  verifying local Claude/Codex/Copilot installs.
- Suite: 2026/2026 passing; fast release smoke 498/498 passing.

## Agent-skill v0.6.15 — 2026-06-20

- Corrected hidden Codex native `.codex-plugin` manifests so Codex CLI native
  installs report the current release version instead of stale `0.6.13`.
- Added a cross-platform manifest contract that keeps Codex native manifest
  versions aligned with the Claude marketplace manifests.
- Supersedes `v0.6.14` for Codex native installs; the `v0.6.14` tag remains the
  advisory diagnostics release.
- Suite: 2025/2025 passing; fast release smoke 497/497 passing.

## Agent-skill v0.6.14 — 2026-06-20

- Added fail-open diagnostics for shipped Claude advisory hooks so malformed
  hook JSON and unexpected cache/summary filesystem errors emit bounded
  `stderr` warnings instead of disappearing behind silent `catch {}` blocks.
- Added release-smoke coverage for the advisory hook diagnostics guard.
- Suite: 2021/2021 passing; fast release smoke 493/493 passing.

## Agent-skill v0.6.13 — 2026-06-18

- Hardened generated Claude/Codex policy hooks so malformed hook JSON payloads
  fail closed instead of silently allowing the event, and added a release-gated
  no-silent-catch contract for those policy hook templates.
- Suite: 2011/2011 passing; fast release smoke 483/483 passing.

## Agent-skill v0.6.12 — 2026-06-18

- Removed unresolved TODO debt from the shipped Copilot floor agent-all runtime
  adapters and added a release-gated contract that keeps those runtime files
  on stable documented host-adapter shapes.
- Suite: 2007/2007 passing; fast release smoke 479/479 passing.

## Agent-skill v0.6.11 — 2026-06-18

- Added `scripts/update-codex-plugins.sh` for Codex CLI's native plugin
  manager, including marketplace registration fallback, forced plugin refresh,
  and `codex plugin list` verification.
- Suite: 2006/2006 passing; fast release smoke 478/478 passing.

## Agent-skill v0.6.10 — 2026-06-18

- Corrected the Codex Quickstart and README platform guidance for Codex CLI
  0.140.0's native `codex plugin marketplace` / `codex plugin add` surface.
- Suite: 2003/2003 passing; fast release smoke 475/475 passing.

## Agent-skill v0.6.9 — 2026-06-18

- Added harness positioning documentation comparing `agent-skill` with
  Gajae-Code and OMO, and documenting the reusable general harness blueprint.
- Added platform Quickstart docs for Claude, Codex, Copilot, Cursor, Gemini,
  and VS Code Copilot with install and verification paths in English and Korean.
- Suite: 2003/2003 passing; fast release smoke 475/475 passing.

## Agent-skill v0.6.8 — 2026-06-18

- Canonicalized the public command surface across platform ports: Codex,
  Copilot, Cursor, and Gemini now expose `/agent-init`, `/agent-all`,
  `/visual-qa`, `/thrift`, and `/debug` where applicable, while keeping
  platform-specific plugin/source directory names internal.
- Updated Codex install renderers, doctors, cleanup logic, docs, templates, and
  release guards so installed skills land under canonical paths such as
  `.codex/skills/agent-all`, `.codex/skills/visual-qa`, `.codex/skills/thrift`,
  and `.codex/skills/debug`.
- Added command-surface regression coverage to prevent platform-suffixed public
  slash commands from leaking back into active docs, templates, and skill
  metadata.
- Suite: 2001/2001 passing; fast release smoke 473/473 passing.

## Agent-skill v0.6.7 — 2026-06-16

- Test-integrity sweep across all 176 test files: strengthened 50 weak test
  cases that would have passed while the real contract was broken — replaced
  non-discriminating substring assertions with full success patterns, upgraded
  existence-only checks to parse/byte/behaviour assertions, and made
  regex/SUT-behaviour assertions real (positive + negative). Genuinely
  fabricated Copilot/Gemini CLI-surface assertions were left flagged for the
  blocked #27/#28 live-CLI spike rather than re-guessed.
- Finished the #34 residuals: `.agents/plugins/marketplace.json` is now
  checksum-guarded by release-provenance + release-audit; README documents the
  honest platform-degradation boundaries (/explore Claude-only, /debug
  Claude+Codex, no programmatic background-subagent await on Cursor/Gemini);
  the decision-surfacing design record and data-runner SKILL were corrected to
  match reality; and the dead `redactJsonArtifact` export was removed (zero
  callers) from the security lib + all vendored copies.
- Suite: 1999/1999 passing; fast release smoke 471/471 passing.

## Agent-skill v0.6.6 — 2026-06-16

- visual-qa ports: vendored the `element-identity.mjs` and `targets-filter.mjs`
  leaf libs into all four ports. Each port's `shallow-clicker.mjs` imports them
  but they were never vendored — a dangling import (ERR_MODULE_NOT_FOUND) in
  every visual-qa port. Added them as sync-lib targets + a drift-guard test that
  imports each port's shallow-clicker.
- Hardened the `vendor-sync` test to assert the explicit "OK — N vendored files
  match source" contract (with N > 0 and no drift) instead of a bare "OK"
  substring that also appears in drift-guidance output.
- Suite: 1999/1999 passing; fast release smoke 471/471 passing.

## Agent-skill v0.6.5 — 2026-06-15

- thrift hooks: applied the Node 18/20-safe `fileURLToPath(import.meta.url)`
  dirname pattern to the remaining four hook templates (only the audit hook had
  it), and added a spawn test asserting every installed hook resolves its
  `./lib/` imports.
- Codex port cleanup: removed the four dead `codex agent dispatch`/`wait`
  wrappers (Codex 0.139.0 has no `agent` subcommand; the live path is sequential
  `codex exec`) along with their tests and the doc-contract entries.
- thrift-codex Phase-0 hook gate: rewritten around verified Codex 0.139.0
  behaviour — it now probes actual `[hooks]` support (version + the
  `--dangerously-bypass-hook-trust` capability), hard-aborts when unsupported
  (the append-only patcher cannot fail later), adds a hook-TRUST advisory
  (untrusted hooks are silently inert; the tool never auto-passes the bypass
  flag), and drops the false "Phase 2 will reject" claim.
- thrift coercion telemetry: added a PostToolUse `coercion-outcome` correlation
  hook so `coercionAcceptRate` reflects real acceptance (was structurally pinned
  at 0%) — the read-coerce suggestion now carries a target and a later
  `ctx_execute`/`ctx_execute_file` on that target marks it accepted.
- Suite: 1991/1991 passing; fast release smoke 471/471 passing.

## Agent-skill v0.6.4 — 2026-06-15

- Restored the agent-all SSOT pipeline contract to all four ports
  (codex/copilot/cursor/gemini), which had silently dropped mandatory points:
  the orchestrator-routing seam (evidence-producing work routes to the
  platform's fan-out, not the code-shipping pipeline), the audit-token gate
  (a wave passes only if every reviewer/coordinator/qa dispatch emitted its
  `*_AUDIT` token), orchestrator-owned commits (subagents may not self-commit),
  and the Phase-5 `validateTaskLedger` acceptance gate — each adapted to the
  platform's dispatch idiom.
- Vendored the contract libs via sync-lib so the gates actually run:
  `task-ledger.mjs` into all four ports; `gate-plan.mjs` +
  `changed-file-classifier.mjs` into copilot/gemini (cursor unions inline).
- Added `tests/lib/port-ssot-contract.test.mjs` (16 tests) that fails CI if any
  port drops a contract point again — the contract is now mechanically enforced
  rather than relying on manual port fidelity.
- Suite: 2017/2017 passing; fast release smoke 505/505 passing.

## Agent-skill v0.6.3 — 2026-06-15

- thrift hook robustness: the cost-estimator now falls back to a default rate
  and surfaces a `warnings` array on an unknown model instead of throwing (the
  throw silently killed the end-of-session audit); the SessionEnd audit hook
  logs a diagnostic instead of swallowing every error and resolves its dir via
  `fileURLToPath(import.meta.url)` so sibling-lib imports work on Node 18/20 LTS.
- `/agent-all` Phase 0 now verifies the governance hook **file** exists and is
  executable (not just the settings entry); `agent-init`'s self-update command
  honors `$AGENT_SKILL_REPO` so a fork/transfer no longer 404s; `agent-all-codex`
  points its roster-missing recovery at the real `/codex-init` (no `--theme`
  flag). Closes the agent-init papercut issue (#33).
- Added a real-install integration test that scaffolds from a cache-style
  plugin layout (not the source checkout) and exercises the install-aware floor
  template resolution + fail-loud guard; added `harness-core/lib/security` as a
  sync-lib drift target (the one runtime consumer that was unguarded).
- Empirically confirmed (local codex 0.139.0) that Codex supports a hook-trust
  model and has no `agent` subcommand; recorded on #31.
  Suite: 2001/2001 passing; fast release smoke 505/505 passing.

## Agent-skill v0.6.2 — 2026-06-15

- Fixed five audited install-path / safety defects so the documented skill
  paths work on a real (non-source-checkout) install: `/agent-init` now
  resolves harness-floor config templates against the installed plugin path
  (`plugin-scan` `installPaths` + `resolvePluginRoot`) and fails loudly instead
  of writing an empty `.visual-qa.json` / `.agent-all.json`; `/thrift` Phase 2
  delegates to the bundled installer and copies the hook libs (no more silent
  `ERR_MODULE_NOT_FOUND`); `/debug` and `debug-codex` git-bisect materialise
  their run script on disk; and `agent-all-cursor` aborts on a dirty tree
  instead of `git stash`. Added a render+spawn regression guard for the thrift
  hooks and install-path tests for `plugin-scan`.
- Added image-backed user manuals at `docs/USER_MANUAL.md` and
  `docs/USER_MANUAL.ko.md`, promoted the release manual cards/pages into
  `docs/assets/user-manual/`, and linked the beginner path from README and
  usage docs.
- Filed the remaining cross-platform audit findings as tracked issues
  (#27–#35, label `audit/v0.6.1`). Suite: 1998/1998 passing; fast release
  smoke 505/505 passing.

## Agent-skill v0.6.1 patch release — 2026-06-12

- Added an automatic `/thrift` recommendation from the Claude context-mode
  router after repeated large-output commands when `.thrift.json` is not
  present; the hook remains advisory-only and writes a durable recommendation
  note under `.agent-skill/recommendations/`.
- Fixed `/agent-all` large/medium wave defaults so generic `dev` tasks are not
  silently dropped, and added async loop-runner support via
  `evaluateLoopAsync`.
- Tightened Codex sequential dispatch prompts with task document references and
  updated current Codex loop docs to avoid unsupported legacy agent-hook
  instructions.
- Made Cursor/Copilot/Gemini visual QA comprehensive mode gate both `critical`
  and `major` regressions through `verdict.json`.
- Replaced private/local project examples with a generic Enterprise Django/Vue
  fixture and regenerated the Korean user manual without local paths or client
  names.

## Agent-skill v0.6.0 release train — 2026-06-12

- Added top-level planning docs: `PROJECT_PLAN.md`, `ROADMAP.md`, generated
  `SUPPORT_MATRIX.md`, and `docs/architecture/README.md` now map vision,
  workstreams, milestones, platform support, and active issue taxonomy.
- Added `harness-data` with `/data-runner` guidance for notebook execution,
  SQL validation, artifact diffs, and data handoff evidence.
- Extended `verify:notebook-data` and `verify:sql-db` with notebook cell-error
  inspection, SQL row/schema/null/duplicate/outlier assertions, artifact diff
  metadata, environment/reproducibility evidence, destructive SQL policy
  blocking, and `/agent-handoff` data evidence summaries.
- Added `/agent-all` verification adapters for non-web loop completion:
  `verify:web-ui` wraps existing visual-qa, while `verify:cli`,
  `verify:api-contract`, `verify:notebook-data`, `verify:sql-db`, and
  `verify:batch-job` share a `verification-evidence/v1` result model and
  append `.agent-skill/runs/<run-id>/verification-evidence.jsonl`.
- Added `/agent-handoff`, with task-doc extraction, safe git-state collection,
  sibling `.handoff.md` and `.session.md` generation, machine-readable resume
  metadata, non-TTY recommended-action audit logging, and `/agent-all --resume`
  artifact discovery.
- Added common `agent-interaction/v1` UX plumbing for `/agent-all` decisions
  and `/agent-handoff` resume prompts: Claude native `AskUserQuestion`, Codex
  prompt rendering, Copilot/Cursor/Gemini markdown renderers, non-TTY
  recommended-option resolution, high-risk auto-approval blocking, markdown
  decision review logs, and `.agent-skill/runs/<run-id>/interactions.jsonl`.
- Added non-installable `harness-core` capability metadata with
  `AgentCapability` schema validation, Claude/Codex platform adapter renderers,
  generated `SUPPORT_MATRIX.md`, and drift tests for the shared capability
  catalog.
- Added the shared Node policy hook engine (`agent-policy-event/v1` →
  `agent-policy-result/v1`) with JSONL audit logs, loop policy checks,
  verification/reviewer audit enforcement, dynamic agent spawn validation,
  verification adapter lifecycle events, non-TTY decision logging, and
  Claude/Codex hook adapters.
- Added `/agent-all` cost telemetry (`agent-cost-telemetry/v1`): reported
  platform costs or best-effort token/char estimates now append
  `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror
  `state.costTelemetry.summary`, feed 80% budget warnings and 100% budget
  stops through the shared policy engine, and surface cost summaries in task
  ledger and handoff artifacts.
- Added `scripts/skill-eval.mjs` (`agent-skill-eval-report/v1`) for issue #22:
  three deterministic benchmark fixtures compare baseline vs `agent-all` smoke
  runs, full mode expands to visual QA, quality gate, dynamic orchestration, and
  verification-adapter modes, and reports write to `.agent-skill/evals/<date>/`
  with pass rate, iterations, intervention counts, reviewer/quality debt
  signals, rollback count, token estimates, and cost overhead from shared cost
  telemetry.
- Added public GitHub governance for issue #23: PR smoke/docs/templates
  workflows, issue templates, PR template, `.github/labels.yml`, governance
  docs, `scripts/github-governance-check.mjs`, and
  `scripts/docs-structure-check.mjs`. Public CI now covers fast smoke,
  manifest/marketplace consistency, docs structure, template drift, vendored-lib
  sync, and support matrix drift while the local release gate remains
  authoritative.
- Added supply-chain provenance for issue #24: `scripts/release-provenance.mjs`
  generates `release-manifest.json` plus `release-manifest.sha256` with
  checkout commit, marketplace checksum, per-plugin directory checksums,
  vendored-lib/template aggregate checksums, and signed-tag status. Release
  audit, release candidate evidence, and release smoke now cover the manifest;
  `install-all.sh`, `install-platform.sh`, and `update.sh` can verify it with
  `--verify-checksums` / `--verify-provenance --manifest=<path>`.
- Added secret/privacy redaction gates for issue #25: shared redaction rules
  and scanners cover handoff/session prompts, visual/debug reports,
  verification evidence, policy/interaction/spawn logs, and PR bodies.
  High-severity findings block by default, medium findings are masked, and
  `.agent-skill/runs/<run-id>/redaction-audit.jsonl` records only
  rule/count/severity/action metadata with path/rule allowlists.
- Added the Quality Debt Policy gate for `/agent-init` and `/agent-all`:
  generated root guidance now includes `Quality Debt Policy`, the
  `quality-debt-reviewer` role audits unrequested fallback, TODO/debt markers,
  suppressions, skipped or meaningless tests, and production test/debug paths,
  and the shared policy engine can block or require task-doc `Quality Debt
  Exceptions` with issue links and expiry dates.
- Added state-based dynamic `/agent-all` orchestration: changed-file/failure
  classification now computes `requiredAgents`, escalates repeated failure
  signatures to planner/user decision instead of more implementers, evaluates
  dynamic spawns through the shared policy engine, and writes
  `.agent-skill/runs/<run-id>/spawn-log.jsonl`.
- Added unlimited `/agent-all --loop` mode via `--max-iter=0` or
  `loop.maxIter: null`, plus repeated failure-signature escalation and loop
  state handoff fields for long-running resume.
- Evolved the deploy branch from local-only release evidence to public PR smoke CI plus an authoritative local release gate; release-audit now verifies the public PR CI/local release contract in `tests/manual-checklist.md`.
- Added `scripts/release-publish-preflight.mjs`, a no-push branch publishing preflight that still detects `.github/workflows/*.yml` changes and fails early when GitHub CLI auth lacks `workflow` scope.
- Added `scripts/target-project-smoke.mjs`, a no-write rollout rehearsal for real target projects that combines Claude/Codex `install-platform.sh --dry-run` with operational doctor evidence and recommended refresh commands for stale scaffolds.
- Added a release-audited User Objective Release Matrix mapping the Claude/Codex harness requirements to authoritative gates: heavy default + lite opt-out, approved foundation auto-update, superpowers/context-mode activation, persona segmentation, orchestration gates, Enterprise Django/Vue routing, Codex current-CLI parity, doctor/cleanup, HOME config safety, and the deployable release gate.
- Added a release-audited Release Candidate Lifecycle covering clean-SHA evidence, version/changelog alignment, live CLI probe capture, date-stamped release-candidate tagging, rollout/update paths, and rollback to a previous verified tag/SHA.
- Added `scripts/release-candidate.mjs`, a release-candidate evidence generator that verifies clean-SHA readiness, marketplace/manifest alignment, README/README.ko Versioning agreement, changelog readiness, stale release wording, recommended date-stamped RC tag names, and required Claude/Codex gate commands before a tag claim.
- Added `harness-debug-codex`, a Codex CLI port of `/debug` with the `debug-codex` skill contract, `run /debug` public entrypoint, structured error parsing, hypothesis state persistence, and superpowers fallback.
- Added deterministic Phase 4 gate planning for Claude/Codex `/agent-all`: `buildGatePlan`, coordinator-first `orchestrator` dispatch, `ORCHESTRATION_AUDIT`, and release-audited Codex mirror parity.
- Embedded the role gate matrix directly in Claude and Codex orchestrator personas so dispatch planning and final handoff both select the required reviewer gates before relying on root memory alone.
- Threaded classifier gate reasons and per-dispatch pass criteria into Claude/Codex Phase 4 docs and Codex sequential review prompts, including explicit `ORCHESTRATION_AUDIT` output contracts for coordinator gates.
- Added release-fixture coverage for the terminal Claude project bootstrap path, proving `install-platform.sh --platform=claude` produces both operational and `--lite` scaffolds, runs the post-install doctor, and leaves HOME unpatched.
- Hardened Codex release fixtures so operational/default-heavy and `--lite` installs must prove post-install doctor execution and success, with release-audit coverage for the smoke contract.
- Added release-fixture coverage for Codex `install-platform.sh --theme=builder|floor|thrift`, proving each single-theme install writes only its expected project-local artifacts, keeps global Codex config untouched, and preserves floor sequential helper/runtime and thrift no-instrument evidence.
- Added Claude/Codex install→uninstall release fixtures, proving `install-platform.sh --uninstall` dry-runs without mutation and then removes generated project-local agents/skills/hooks/configs while preserving root guidance, Codex debug evidence, and global config.
- Promoted stack-specific implementer personas to the heavy Claude/Codex operational scaffold: `frontend-dev` and `backend-dev` now ship in default project installs, Codex sequential dispatch can target their `.codex/skills/<role>/SKILL.md` files, and root/orchestrator guidance includes an implementation routing matrix with release-audited doctor and fixture coverage.
- Hardened release fixtures to prove fresh Claude/Codex installs render the implementation routing matrix into root/orchestrator guidance and ship usable `frontend-dev`/`backend-dev` persona bodies, with release-audit coverage for the fixture contract.
- Extended the Codex operational release fixture so sequential `agent-all-codex` dispatch must load and inline installed `frontend-dev`/`backend-dev` role skills, while the Claude terminal installer fixture now checks orchestrator and stack-specific persona bodies as well as root guidance.
- Added `scripts/release-smoke.sh` itself to the Claude/Codex release readiness audit, so the final gate contract now proves live CLI probes, fresh fixtures, marketplace dry-runs, focused release contracts, vendored-lib sync, and full-suite mode are still wired before a release claim.
- Added release-audit packaging coverage for public CLI script shebangs and executable bits, including direct release gate scripts.
- Generated Claude/Codex hook and task-ledger checker scripts are now written with executable bits when present, and release fixtures prove their shebang/mode packaging in fresh installs.
- Codex base and specialized reviewer personas now carry explicit Phase 4 `VERIFICATION_AUDIT` output contracts, and release fixtures/audits prove fresh operational and builder installs preserve those token surfaces.
- Claude QA, base, and specialized reviewer personas now have the same Phase 4 machine-token output contract coverage in release fixtures and release audit as Codex.
- Claude terminal `install-platform.sh --theme=builder` now installs a true builder-only heavy scaffold, skips floor configs, runs the builder-profile doctor, and is covered by release fixtures.
- Codex builder/lite root `AGENTS.md` now uses floor-conditional `.agent-all.json` language guidance so builder-only installs no longer imply a missing floor config exists; release fixtures and release audit pin the contract.
- Registered the Codex debug port in the marketplace, Codex plugin install group, `install-platform.sh --platform=codex --theme=all|debug`, post-install doctor, release fixture smoke, release audit, release smoke, and public verification docs. Current suite: 1991/1991 passing; fast release smoke: 504/504 passing.
- Made Claude/Codex terminal operational bootstrap auto-refresh only approved foundations (`superpowers`, `context-mode`) when `claude` is available, with `--update-foundations` strict mode and `--no-update-foundations` opt-out.
- Hardened foundation auto-refresh so default Claude/Codex bootstrap continues in degraded foundation mode if the approved update fails; strict failure remains opt-in through `--update-foundations`.
- Changed `/agent-init` default to operational/heavy scaffold with `/agent-init --lite` as the minimal path.
- Added task ledger scaffolding, sentinel merge policy, Claude hard policy artifacts, Codex command-policy artifacts, Gemini soft rules, and changed-file reviewer classifier.
- Added foundation detection/update guidance for superpowers and context-mode.
- Updated release docs to reflect current Codex command-hook schema and prompt-level/sequential Codex floor workflows.

## QA team vs Verification team — 2026-05-22  (`harness-floor` v0.5.0)

Formal split of the two review concerns the harness used to conflate as "reviewer".

### Added

- **QA team persona (`qa.md`)** is now explicitly the **user-side** auditor. Treats `{{persona}}` as the user; outputs acceptance scenarios + defect reports. Audit token: `QA_AUDIT: passed | failed | skipped`.
- **Verification team** (`tester.md` + `reviewer.md`) is now explicitly the **tech-stack / spec-compliance** auditor. Audit token: `VERIFICATION_AUDIT` (existing).
- **`floor-policy` hook handles QA dispatches.** Description prefix `QA Review Task <N>: <title>` routes to the user-side directive (en/ko both shipped) + `QA_AUDIT` token validation at PostToolUse. Existing `Review Task` prefix still routes to the Verification directive — backward compatible.
- **`.agent-all.json` `policy.qaAudit`** flag (default `true`) — opt-out for projects without a user persona (libs, CLIs without UI). Phase 4 Gate skips QA dispatch when `false`.
- **Phase 4 two-team gate.** Wave passes iff `VERIFICATION_AUDIT ∈ {passed, skipped}` AND `QA_AUDIT ∈ {passed, skipped}`. Tech success ≠ user-flow success: a passing technical audit alongside a failing QA audit fails the wave; the QA defect report becomes input to the next iteration's plan.

### Libs (new)

- `lib/policy/qa-audit-validator.mjs` — parallel to `reviewer-audit-validator`. Same `{ ok, reason }` shape.

### Persona templates updated

- `agents/qa.md.hbs` — header rewritten to "QA team (user-side)" + audit-token section.
- `agents/tester.md.hbs` — header rewritten to "Verification team (tech-stack side)" + audit-token section.
- `agents/reviewer.md.hbs` — header rewritten to "Verification team (spec / quality side)" + audit-token section.

### Tests

Suite **1322 → 1334 passing** (+12 new: 6 QA validator, 6 hook QA path). Render-snapshot fixtures for the 3 updated persona templates × 7 stack profiles regenerated (21 snapshots).

### Spec

`docs/superpowers/specs/2026-05-22-qa-vs-verification-personas-design.md`

### Limitations

- `qa.md` is per-persona — projects without a persona declared in `/agent-init` get `{{persona}}` unresolved; QA dispatch falls back to "generic end-user perspective" prose.
- Tokens stay English. Korean directive variant just instructs the agent to emit the English token literally.
- No mid-wave abort on QA-only failure — Phase 4 still completes both reviewers before deciding. Acceptable: the existing 3-retry budget covers correction loops.
- Conflict resolution is binary. No severity-weighted blending; QA failure fails the wave outright. Future work could add `qaAuditSeverity: warn | fail` to downgrade.

## Visual-QA pairs + element-scope + multi-tier matching — 2026-05-22  (`harness-floor` v0.4.0)

Three additive capabilities for `visual-qa`. All keys are backward-compatible; existing `.visual-qa.json` files continue to work unchanged.

### Added

- **Before/after image pairs.** Each tracked element gets `before.png` (pre-action) + `after.png` (post-action) screenshots, plus `baseline.png` (symlink to the prior accepted run's `after.png`) when a baseline exists. New file layout: `docs/visual-qa/<slug>/captures/<page>/<elementId>/{before,after,baseline}.png`.
- **`comprehensive.targets` block** — `includeSelectors`, `excludeSelectors`, and `actionsPerElement` (per-selector action map) let you constrain or augment auto-discovery at element granularity. Action strings: `click`, `fill:<value>`, `blur`, `select:<index|value>`, `hover`. First-matching-key precedence; `default` is the catch-all.
- **Multi-tier element identity.** Replaces fragile `selector + DOM-path` matching with a 3-tier fallback chain:
  1. `data-vqa-id="..."` explicit attribute (rock-solid, instrumented)
  2. Semantic fingerprint — `{role, accessibleName, nearestHeading, textSnippet[:60]}` (survives wrapper/reorder refactors)
  3. Path hash (legacy fallback, preserves existing baselines)

  Each capture's `confidence` is surfaced in `report.md` and `report.html` so drift toward tier-3 is visible.
- **`report.html` self-contained viewer.** Inline CSS + JS, no external assets. Per-element cards with before/after thumbnails, click-to-fullscreen lightbox, arrow-key navigation between `before` / `after` / `baseline`. Configurable via `report.html` (default `true`).
- **`report.md` 2-column pair table.** Each verdict now gets a `Before / After` table inline, plus a second `Baseline / Current` row when a baseline exists. Configurable via `report.mdSideBySide` (default `true`).

### Libs (new)

- `lib/element-identity.mjs` — `computeElementIdentity(descriptor)`, `matchBaseline()`, `implicitRole()`. Pure Node.
- `lib/targets-filter.mjs` — `resolveTarget(elementCheck, targets)`, `parseAction(str)`. Pure Node.
- `lib/report-html.mjs` — `renderHtml(reportData)`. Self-contained HTML; entity-encodes user fields against XSS.

### Phase docs

- `phases/3-capture.md` gains a "Element identity + capture pairs" addendum describing the 7-step per-element flow (filter → identity → before → action → after → baseline → state-write).
- `phases/4-aggregate.md` step 11 documents the new `report.html` generation alongside `report.md`'s pair-table addition.

### Tests

Suite **1292 → 1322 passing** (+30 new):
- 10 in `element-identity.test.mjs` — tier precedence, fallback, implicit roles, baseline matching with degraded flag.
- 10 in `targets-filter.test.mjs` — exclude/include precedence, action lookup, parseAction's colon variants.
- 10 in `report-html.test.mjs` — doctype, per-card structure, verdict counts, confidence badges, XSS escaping, empty state.

### Known limitations (also in README "Known limitations")

- Semantic fingerprint can collide on duplicate labels ("Save" buttons under the same heading) — add `data-vqa-id` for high-value elements.
- Action vocabulary is single-step in v1. Multi-step scenarios deferred to a future `scenarios` field.
- `report.html` fullscreen API needs Safari ≥ 16 / Chrome ≥ 71 — falls back to non-modal full-page on older browsers.
- Storage growth ~2× per captured page (before + after). `comprehensive.cache.gitDiffScope` still skips unchanged pages, limiting the multiplier's reach.
- Baseline symlink falls back to copy on Windows / non-symlink filesystems.

### Out of scope (future work)

- `scenarios` multi-step DSL (login flows, wizard steps)
- Playwright `trace.zip` per capture (deferred for storage reasons)
- Record-and-replay UI
- LLM-assisted baseline rematch when tier-3 falls back

## `update.sh` refreshes marketplace cache — 2026-05-22  (`harness-floor` v0.3.3)

### Fixed

- **`update.sh` now calls `claude plugin marketplace update agent-skill` before reinstalling.** Without this, `uninstall + install` still hits the stale marketplace cache and re-installs the same commit. Symptom: `gitCommitSha` not advancing across releases despite "successfully installed" output. Verified: after this fix, all 5 essentials converge to HEAD's merge commit in one `update.sh` run.

## `scripts/update.sh` fix — 2026-05-22  (`harness-floor` v0.3.2)

### Fixed

- **`scripts/update.sh` now actually picks up new commits.** Previously, the script delegated to `install-all.sh` → `claude plugin install`, but `claude plugin install` is idempotent — it skips when a plugin is already at any version. So users running `update.sh` after a release saw "Installed: 5" but no actual update.
- Fix: `update.sh` now uninstalls then re-installs each agent-skill plugin that was already present. Pristine installs still flow through `install-all.sh` for the remainder.

### Verified

- After this fix, running `bash scripts/update.sh` against a clone on `main` moves `installed_plugins.json` `gitCommitSha` to the latest commit. Confirmed locally — `harness-floor` SHA went `2a27d75` (v0.3.0 merge) → `050100f` (v0.3.1 merge).

## Decision-surfacing i18n (en / ko) — 2026-05-22  (`harness-floor` v0.3.1)

### Added

- **`.agent-all.json` `language` field** — `"auto"` (default), `"en"`, or `"ko"`. `auto` reads `$LANG` / `$LC_ALL` / `$LC_MESSAGES` and resolves to `ko` for Korean locales, else `en`. Exported as `resolveLanguage(value)` from `config-loader.mjs`.
- **Localized renderer** — `renderToAskUserQuestion(decision, { taskTitle, language })` swaps prefixes (`Context:` / `Reasoning for recommendation:` / `(Recommended)`) per language. `en` and `ko` ship in v0.3.1; unknown languages fall back to `en`.
- **Korean scoping-pass addendum** — `lib/decisions/addendum.ko.md` ships alongside the English one. `floor-policy-hook.mjs` selects per project's `.agent-all.json` `language` (or `AGENT_ALL_LANGUAGE` env override for tests).
- **Localized verification + reviewer-audit directives** — same dual-version pattern; machine-parsed tokens (`STATUS: DONE`, `verification_passed`, `VERIFICATION_AUDIT: passed|failed|skipped`) stay English-only by design.

### Tests

Suite **1280 → 1292 passing** (+12 new tests for i18n: renderer prefix table, language config validation, `resolveLanguage` auto-detection, hook addendum selection per language).

### Notes

- The `language: "auto"` default does the right thing on most Korean dev environments without configuration. Set to `"en"` explicitly if you want English regardless of locale.
- Machine-parsed tokens remain English-only — `VERIFICATION_AUDIT:` etc. are stable contracts; the Korean directive text just asks the subagent to emit those exact English tokens.

## Decision-surfacing + policy-hook enforcement — 2026-05-21

### Added

- **Decision-surfacing protocol.** `/agent-all` Phase 3 splits into **3a scoping → 3b ask → 3c implement**. Implementer subagents do a read-only scoping pass, return architectural / spec-ambiguity decisions as a JSON payload `{options[2-4], recommended_index, reasoning}`, main asks user via `AskUserQuestion` (1/2/3 panel with recommendation flagged), then re-dispatches with answers baked in. Non-TTY mode auto-picks recommended low/medium-risk choices and logs to `.agent-all-state.json`, `docs/agent-all/iter-<N>/decisions.md`, and `.agent-skill/runs/<run-id>/interactions.jsonl`; high-risk choices block.
- **Single `floor-policy` hook** (PreToolUse + PostToolUse on `Task`) auto-injects the scoping addendum + verification directive on dispatch and validates `verification_passed` / `VERIFICATION_AUDIT: passed|failed|skipped` tokens on return. Single file with internal router — overhead negligible when not a Task call.
- **`.agent-all.json` `policy` opt-out** — flags `decisionSurfacing`, `verification`, `reviewerAudit`, all defaulting `true`. Added to `DEFAULTS` so the existing deep-merge handles overrides naturally.
- **Per-platform parity** — Cursor (`.cursor/rules/decision-protocol.mdc`, soft), Copilot CLI (`.github/agent-all/decision-protocol.md`, hard via `.github/hooks/`), Codex (`[[hooks.agent]]` snippet to stdout for manual merge, hard), Gemini (`.gemini/agent-all-decision-protocol.md`, soft), VS Code Copilot (reads `.github/copilot-instructions.md`, soft).
- **Spec + plan:** `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`, `docs/superpowers/plans/2026-05-21-decision-surfacing-and-policy-hooks.md`.

### Changed

- Phase 3 dispatch documentation restructured into 3a/3b/3c sub-phases (`plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`).
- README "Main-thread isolation" table reflects new phase-3 token shape (3a/3c subagents + 3b sequential ask).
- `.agent-all-state.json` initial shape gains `decisions: {}` key (populated by Phase 3b).
- Added "Known limitations" section to README (English + Korean) covering soft enforcement on Cursor/Gemini/VS Code, non-TTY auto-pick caveat, `description`-based routing, and per-task scoping cost (~+15-20%).

### Fixed

- AskUserQuestion `header` 12-char limit: `lib/decisions/renderer.mjs` now truncates via `slice(0, 12)`. Plan-side bug surfaced by implementer subagent in Task 2.

### Tests

Suite **1246 → 1279 passing** (+33 new tests across `decisions/`, `policy/`, scenarios, config-loader policy, plus regression coverage).

### Plan deviations

- Task 11 reused existing `loadConfig(path)` API instead of introducing `loadAgentAllConfig(dir)`. Same effect, no API duplication.
- Task 13 (`sync-lib.mjs` vendoring of `decisions/` + `policy/` libs) deferred. Soft prompt-only ports don't require vendored runtime libs; hard-enforce ports reference the canonical hook script directly. Future work if cross-platform runtime parity becomes required.

## README overall improvement — 2026-05-19

Coordinated polish pass making the `--qa` story the README's headline
instead of a bolted-on section.

- **Opening tagline + command list** now lead with
  `/agent-all "..." --loop --qa` as the canonical featured command,
  and the one-line summaries promise "tests AND UI both pass" rather
  than just tests. `/visual-qa` description gains a sentence on
  `declared` vs `comprehensive` modes (was missing in the command
  reference).
- **Pillar #3 rewritten** from "three pieces compose" (generic) to
  "one-flag end-to-end verification" (concrete) — the actual selling
  point of the recent work.
- **New "Common workflows" headline**: "Ship a UI feature end-to-end
  (the killer flow)" — `npm run dev` + `--loop --qa` two-liner.
- **Self-sustaining workflows section consolidated** (lines 250-393
  → 264-372). Merged "Recipe" subsection into "The composable trio"
  (was duplicating the same /thrift + /goal + /agent-all snippet),
  tightened "How this differs from Ralph Loop" by 60% without losing
  the substance, removed the duplicate "step-by-step" prose (the
  `--qa` walkthrough already covers it).
- **Stale numbers** swept: 1019 → 1246 in 6 places (badge, status
  table, going-deeper, contributing checklist, README.ko.md).
- **Math error fixed**: "below 4" → "below 5" in the
  installed-plugins check (the recommended set is 5: builder + floor
  + thrift + explore + debug).
- README.ko.md fully synced.

Net result: 712 → 690 lines despite adding the --qa story; no fewer
sections, just less overlap. Tests still 1246/1246.

## Loop / visual-qa hardening + README clarity pass — 2026-05-19

Closing real gaps uncovered while documenting the comprehensive-mode
rollout. Each is a thing that would have made `/agent-all --loop --qa`
silently misbehave on a fresh project.

### Fixed — Phase 6 visual-qa invocation was hand-waved

Phase 6 docs referenced a `dispatchVisualQASubagent()` placeholder
that didn't exist. Replaced with a concrete `Task`-tool invocation
pattern on all 5 platforms (Claude Code native + cursor / copilot /
codex / gemini), each spelled out in the platform's native dispatch
primitive (`Task` / cursor background agent / `task` tool /
`agent` hook / `gemini chat` subprocess). Each iteration now uses
a fresh `--slug=loop-iter-<N> --force` combo so iters don't clobber
each other's slug dirs while Phase 2's `priorRunPath` discovery
still finds the previous iter as the baseline.

### Fixed — `--qa` autoscaffold writes config without checking dev server

Most common "it didn't work" failure mode: user runs `--loop --qa`,
visual-qa Phase 0 health-checks `baseUrl`, fails with no obvious
explanation. Now Phase 0 of `/agent-all` probes the autoscaffold's
`baseUrl` with `curl --max-time 3` *before* writing the config or
proceeding, and prompts the user to confirm if unreachable
(`--yes` mode aborts with a clear "dev server unreachable" message).

### Changed — `--qa` autoscaffold first-run policy: `auto-pass` → `report`

Subtle hazard: `auto-pass` means iter 1 always writes whatever it
captured as the new baseline. If iter 1 has broken UI, that broken
UI becomes the reference — iter 2 wouldn't catch the issues because
they match the baseline. New default `report` still passes the loop
on iter 1 (so users can start from zero) but enumerates every issue
in the report so the next iter has the context to fix them.

### Added — README troubleshooting + step-by-step `--qa` walkthrough

Five common failure modes (dev server down, missing Playwright MCP,
infinite loop on flaky tests, cost runaway on iter 2, baseline
lock-in, autoscaffold vs existing config) now have a "what / why /
fix" table. The loop+qa section was restructured into:
prerequisites → step-by-step → flag reference → troubleshooting.
Korean README synced. Tests badge updated 1019 → 1246.

## Comprehensive visual-qa + `/agent-all --qa` E2E gate — 2026-05-19

### Added — `/agent-all "..." --loop --qa` one-flag E2E verification

`--qa` is a new shortcut that wires loop completion to a real
end-to-end check, not just "did the tests pass". It expands to:

```
--break-condition='{"type":"composite","steps":[
  {"type":"test-auto"},
  {"type":"visual-qa","mode":"comprehensive"}
]}'
```

Tests run first as a cheap gate; visual-qa (comprehensive mode) runs
as the final E2E. Loop only breaks when both pass. `.visual-qa.json`
is auto-scaffolded with sane defaults if missing, so a fresh project
can run `/agent-all "build X" --loop --qa` with zero pre-setup.

Five-platform parity: Claude Code native + cursor / copilot / codex /
gemini all support `--qa`. Phase 0 of agent-all wires the shortcut at
highest priority — above CLI override, above interactive prompt, above
saved config.

### Added — visual-qa comprehensive mode

`.visual-qa.json` grows a `mode` field (default `declared`, back-compat).
When set to `comprehensive`, visual-qa stops requiring a hand-written
selector list and instead discovers everything automatically:

- **Crawl** from `baseUrl` with BFS, scope.include / scope.exclude
  globs, depth cap, maxPages cap. Same-origin only. (`lib/crawler.mjs`)
- **DOM walk** each crawled page for interactive elements — button,
  link, input, select, textarea, [role=tab|menuitem|switch|checkbox],
  [data-testid], [data-qa-id]. Stable selector preference:
  data-testid > data-qa-id > id > stable CSS path. Never class-based
  (Tailwind / CSS-in-JS unstable). (`lib/dom-walker.mjs`)
- **Shallow click** each non-input element. Captures the 1-step result
  state then reverts via re-navigation. Dialog-triggering clicks are
  caught; revert failures escalate to blocker severity.
  (`lib/shallow-clicker.mjs`)
- **DOM-hash cache** stores SHA-256 of the normalised DOM serialisation
  plus relevant computed styles, keyed against the prior LLM verdict.
  Components whose hash hasn't changed skip the LLM call entirely.
  30-day TTL eviction. (`lib/dom-hash.mjs`)
- **Git-diff scoping** — framework auto-detect (Next App Router /
  Pages / Remix) maps changed files to affected routes; falls back to
  "rebuild everything" for shared-component changes and "skip
  everything" for docs/tests-only diffs. (`lib/git-diff-scoper.mjs`)
- **Verdict** — issue set keyed by (page, component, category,
  message-hash) diffed against the baseline (prior accepted run). New
  critical/major (configurable) or any severity-bump regression fails
  the loop; severity drops count as fixes. First run with no baseline
  defaults to auto-pass + write baseline. (`lib/verdict.mjs`)

### Added — Phase doc updates

- Phase 1 (`config-mode`) branches on mode. Comprehensive runs crawler
  → DOM walker → git-diff filter → matrix.
- Phase 2 (`discover`) loads + evicts the DOM-hash cache in
  comprehensive mode.
- Phase 3 (`capture`) checks the DOM-hash cache before every LLM call;
  invokes shallow-click expander when `interactions.click` is true.
- Phase 4 (`aggregate`) computes the verdict, writes `verdict.json`,
  persists the DOM-hash cache.
- Phase 5 (`summary`) exit code is `verdict.pass ? 0 : 1` in
  comprehensive mode; declared-mode exit semantics unchanged.

### Added — 6 new libs, vendored byte-for-byte across 4 sibling plugins

Source-of-truth at `plugins/harness-floor/skills/visual-qa/lib/`;
copies in cursor/copilot/codex/gemini visual-qa-* skills. Sync test
catches drift.

### Tests

- 38 unit (crawler scope/depth/dedup/globs/errors, DOM walker
  classification + selector preference, config mode branch + autoscaffold)
- 9 unit (shallow-clicker normal path, skip-by-kind, dialog catch,
  throw containment, revert escalation)
- 28 unit (DOM-hash stability + I/O + TTL, git-diff framework
  auto-detect + route mapping)
- 12 unit (verdict diff algorithm + first-run policies)
- 27 doc-level (--qa flag contract across 5 platforms)
- 13 doc-level (visual-qa comprehensive mode mention across 5 platforms)
- 24 cross-platform sync (6 libs × 4 sibling platforms byte-identical)
- 4 integration (crawler → walker → clicker → cache → verdict pipeline
  composes coherently)

Total: **+155 tests, suite 1091 → 1246 passing.**

### Spec

`docs/superpowers/specs/2026-05-19-visual-qa-comprehensive-design.md`
records the brainstormed design decisions (discovery strategy,
interaction depth, cost strategy, verdict semantics, staging plan).

## Interactive break-condition resolution for `/agent-all --loop` — 2026-05-19

### Added — Phase 0 interactive prompt + four break-condition preset types

Previously `breakCondition` was a static shell string in `.agent-all.json`,
forcing users to hand-craft it before running `/agent-all --loop`. That
made the most useful "what does done look like" decision a config-file
chore, with no in-the-flow choice between test commands, visual QA, or a
composite gate.

New behavior, all five platforms (Claude Code native + cursor / copilot /
codex / gemini):

- **Phase 0 break-condition resolution.** When `--loop` is set, the
  coordinator prompts the user to pick one of four presets:
  - `test-auto` — auto-detect the stack (npm / pytest / cargo / go / …)
    and use its standard test command.
  - `visual-qa` — dispatch the `visual-qa` skill as a subagent each
    iteration. Optional `spec` path supported.
  - `custom shell` — free-form one-liner (the original behavior).
  - `composite` — sequential AND of the above. Short-circuits on first
    failure so a cheap lint/type check can gate a slow visual-qa.
  After picking, the user is asked whether to save the choice to
  `.agent-all.json`.
- **`--break-condition=<spec>` CLI flag.** Non-interactive override.
  Accepts a JSON object (e.g. `'{"type":"visual-qa"}'`) or a plain shell
  string (treated as `{"type":"shell","cmd":<string>}`).
- **`--reconfigure` CLI flag.** Force the interactive prompt even when
  `.agent-all.json` already has a non-default value.
- **Non-interactive fallback.** `--yes`, non-TTY invocations, or an
  already-customised `.agent-all.json` silently reuse the existing
  config — no surprise prompt in CI.

### Added — `lib/break-resolver.mjs` (source-of-truth)

New shared lib in `plugins/harness-floor/skills/agent-all/lib/`, vendored
byte-identical to each of the four platform siblings:

- `normalizeBreakCondition(input)` — accepts a string or `{type, ...}`
  object; returns a canonical normalised spec or `null` for invalid.
- `detectStackTestCommand(cwd)` — file-based stack sniffing
  (package.json → npm test, pyproject.toml → pytest, Cargo.toml → cargo
  test, go.mod → go test, plus Gemfile / composer.json / pom.xml /
  build.gradle).
- `buildShellCommand(spec, {cwd})` — resolves to a single runnable shell
  line for shell / test-auto / pure composite specs; returns `null`
  whenever a visual-qa step is involved (those need a non-shell runner).
- `needsVisualQARunner(spec)` — true when the spec or any nested step is
  `visual-qa`.
- `isDefaultOrMissing(spec)` — used by Phase 0 to decide whether to
  prompt.
- `PRESET_CATALOGUE` — four entries (`test-auto`, `visual-qa`, `custom`,
  `composite`) with `key`, `label`, `description`, and `build(opts)` for
  the prompt UI.

### Added — Phase 6 spec routing

`phases/6-loop.md` no longer assumes `breakCondition` is a shell string.
At iteration start it normalises the spec and routes per `spec.type`:

- `shell` / `test-auto` / pure `composite` → built into a single shell
  line, run via the platform's shell primitive (`spawnSync sh -c` /
  `read_bash` / `shell_command` / `run_shell_command`).
- `visual-qa` → dispatch the `visual-qa-<platform>` skill as a subagent;
  never run via shell. Treat thrown errors as exit 1 — visual-qa must
  explicitly report success.
- `composite` containing visual-qa → run each step in order, short-circuit
  on first non-zero exit.

`config-loader.mjs` validation extended to accept either form; vendored
copies in cursor + copilot synced to match.

### Added — 27 + 45 tests

- `tests/lib/break-resolver.test.mjs` (27 tests) — covers normalisation,
  stack detection, shell-command build, composite short-circuit
  reasoning, and the preset catalogue contract.
- `tests/lib/agent-all-loop-interactive.test.mjs` (45 tests) — doc-level
  contracts across all five platforms: Phase 0 documents the four
  presets + non-interactive fallback + save-confirmation + break-resolver
  lib reference; Phase 6 routes on `spec.type`, dispatches a subagent
  for visual-qa (never `sh -c`), and short-circuits composites; SKILL.md
  documents `--break-condition` + `--reconfigure`.

Total suite: **1019 → 1091 passing**.

## Verification safety net + release-grade README polish — 2026-05-19

### Added — two-layer verification safety net for `/agent-all --loop`

The previous loop semantics relied on `breakCondition` + `--max-iter` +
`--max-cost`. Broken code could still pass through if an implementer
subagent claimed STATUS: completed without actually verifying. Closed
this gap with mandatory directives in Phase 3 + Phase 4 docs:

**Phase 3 (Dispatch) — implementer directive (5 platforms):**

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion`
> to run the project's test command. Do not mark a task complete if
> verification fails — report `STATUS: blocked, REASON: verification failed`
> instead.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke
> `superpowers:test-driven-development` to write tests before
> implementation. Recommended, not strictly enforced.

**Phase 4 (Gate) — reviewer directive (5 platforms):**

> When evaluating the wave's diff, explicitly verify that each implementer
> ran `superpowers:verification-before-completion` and the verification
> passed. If skipped OR failed, escalate as a `critical` issue regardless
> of code quality verdict — this blocks the wave at Phase 4.

Two-layer net: implementers verify; reviewers audit that verification
actually happened. Combined with hard caps and breakCondition, broken
code can't sneak into a PR even on long unattended `--loop` runs.

Updated phase docs in all 5 platforms:
- `plugins/harness-floor/skills/agent-all/phases/{3-dispatch,4-gate}.md`
- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/phases/{3-dispatch,4-gate}.md`

20 new tests (`tests/lib/agent-all-verification-directive.test.mjs`)
checking all 10 files mention the directive + flag TDD as recommendation
not enforcement + name the two-layer safety net.

### Changed — README release polish

- **Status badges** added to README header (tests/plugins/themes/license)
- **NEW "Prerequisites" section** — Node ≥ 20, git, gh, marketplace
  support, target CLI installed for per-platform install. Also names
  `superpowers` + `context-mode` as strongly recommended peer plugins.
- **Pillar #2** expanded to mention the two-layer verification safety
  net (broken code can't sneak into a PR).
- **FAQ "Is /agent-all --loop safe?"** rewritten to spell out all four
  layers (hard caps, breakCondition, implementer verification, reviewer
  audit).
- **NEW "Status" table** at bottom — honest matrix of what's verified
  (tests, install renderers, marketplace, Claude Code skills) vs what
  needs live CLI verification vs what's deferred (v2 thrift, SDK
  hookups).
- **NEW "Roadmap" section** — live runtime verification, v2 thrift,
  SDK hookups, explore/debug ports, transcript-listener bridge,
  telemetry opt-in.
- **NEW "License & Contributing" footer** — MIT, PR conventions,
  pre-submit checks (node --test, sync-lib --check), repo conventions
  (no cross-plugin imports, sentinel-based hook protocol).
- Test count updated 981 → 1019 throughout.

### Result

**1019/1019 tests pass** (+20 verification-directive tests).

Both English + Korean READMEs synced. Both CHANGELOGs synced.

## Cross-platform install — fill missing builder renderers + orchestrator — 2026-05-18

### Added

Closes the cross-platform install gap. Before today, `harness-builder-codex`,
`harness-builder-copilot`, and `harness-builder-gemini` had templates +
SKILL.md but no shell-callable installer — users on those CLIs couldn't
bootstrap a project without Claude Code mediating. README had been
documenting fake commands like `gh copilot plugins install ...` that
don't exist.

**New install renderers** (3 files):
- `plugins/harness-builder-codex/bin/init.mjs` — writes `AGENTS.md` +
  `.codex/skills/{planner,dev,reviewer}/SKILL.md`; emits `config.toml`
  snippet to stdout for `~/.codex/config.toml` merge.
- `plugins/harness-builder-copilot/bin/init.mjs` — writes `AGENTS.md` +
  `.github/copilot-instructions.md` + `.github/instructions/<role>.instructions.md`
  + `.github/hooks/*.json` (3 files); emits `mcp-config.json` to stdout.
- `plugins/harness-builder-gemini/bin/init.mjs` — writes `GEMINI.md` +
  `.gemini/skills/{planner,dev,reviewer}/SKILL.md`; emits `settings.json`
  snippet to stdout.

All three follow the `harness-builder-cursor/bin/init.mjs` pattern:
`--ctx <path>`, `--force`, env-var fallbacks (`PURPOSE`/`SIZE`/etc),
`detectProject()` for stack auto-detection, refuse-without-force
protection.

**New orchestrator script** (`scripts/install-platform.sh`):

```bash
./scripts/install-platform.sh --platform=cursor --target=...        # all 3 themes
./scripts/install-platform.sh --platform=codex --target=. --theme=floor
./scripts/install-platform.sh --platform=vscode-copilot --target=.  # aliases to copilot
```

Supported platforms: `cursor`, `copilot`, `vscode-copilot`, `codex`,
`gemini`. Supported themes: `all` (default), `builder`, `floor`, `thrift`.
Iterates the right `bin/init.mjs` + `bin/install.mjs` renderers and
prints platform-specific "what was written" summary at the end.

### Tests

- `tests/lib/harness-builder-cli-init.test.mjs` — 18 tests (6 per
  plugin × 3 plugins): usage error, non-existent target, full install +
  config snippet stdout, `--ctx` override, `--force` overwrite, env-var
  flow.
- Full suite: **999/999 tests pass** (was 981, +18).

### README updates

- "Use it on other AI tools" section rewritten with accurate one-line
  install per platform (`./scripts/install-platform.sh --platform=...`).
- Removed the fake commands (`gh copilot plugins install`,
  `codex plugins install`, `gemini extensions install`) and explicitly
  flagged them as "don't run these — they don't exist".
- New "Once installed, how do you actually use it?" table covering the
  entry point per platform (Claude Code slash command, Cursor chat
  invocation, Copilot CLI `gh copilot suggest`, VS Code Copilot Chat,
  Codex CLI, Gemini CLI).
- "What each platform receives" table showing the exact files written
  per platform — no more guessing.

## README — main-thread isolation as the real value prop — 2026-05-18

### Changed

The previous version described `/agent-all` as "runs as one pipeline"
without explaining the actual mechanism that makes long-running loops
possible. Updated both READMEs to surface the real story:

**Top-of-README pillar #2 rewritten** from "Agent-first execution" to
**"Agent-first execution that preserves your main thread"** — explicit
about WHY this scales:
- Phase 3 (Dispatch) and Phase 4 (Gate) run in **isolated subagents**
  via `superpowers:subagent-driven-development`
- Subagents' turn-by-turn output (code reads, patch attempts, failed
  test runs) never enters main conversation
- Main session sees only verdicts (`{status, commits, costUSD}`)
- That's why the same Claude Code session can keep going for hours

**Pillar #3 reframed** from "Self-sustaining loops" to **"Composable
for unattended runs"** — names the three pieces and their division of
labor (loop drives work, thrift compresses what does accumulate, goal
keeps session alive).

**"Self-sustaining workflows" section restructured**:
- New "Why this works — main-thread isolation" subsection up front,
  with a per-phase table showing exactly what enters main context vs
  what stays in isolated subagents
- New "Three pieces and how they divide the work" table making the
  loop/thrift/goal collaboration explicit ("agent-all isolates per-
  iteration; thrift compresses across iterations; goal keeps session
  alive")
- Recipe walkthrough now names which phases run where ("brainstorm
  with you in main → plan in main → dispatch implementer subagents
  in isolation")

This addresses the feedback that the prior writeup left users to
infer "why does this scale" — now it's a numbered explanation up top
with a per-phase mechanism table later.

Both English + Korean updated.

## README — sharpen `/goal` + Ralph Loop differentiation — 2026-05-18

### Changed

The previous "Loop semantics — harness vs Ralph Loop" subsection
implied harness was Ralph-with-features. Replaced with "How this is
different from `/goal` and Ralph Loop" — frames the harness as a
**different category** (orchestrator that loops, not a loop with
orchestration), with explicit:

- **Comparison table** showing what each tool actually *solves* +
  what it *knows about*:
  - `/goal` solves "don't stop until X"; knows nothing about work
  - Ralph Loop solves "re-run on interval"; stateless
  - `/agent-all --loop` solves "drive a complete dev workflow to
    verified end state within cost bounds"; knows phases, plan,
    agents, what was tried, cost, where it failed
- **Explicit framing**: harness pulls the "good idea" from each
  (keep-alive from `/goal`, auto-retry from Ralph) and adds structural
  pieces neither has — multi-phase awareness, stateful retries (next
  iteration sees previous failure), wave-granularity cost cap,
  resume-from-failure, phase-aware break-condition
- **`/goal` and Ralph reframed as complements, not alternatives** —
  `/goal` keeps the session alive so `--loop` can run for hours;
  Ralph wrapping a one-shot only makes sense for wall-clock periodicity

This addresses the feedback that the prior writeup made harness look
like "another option in the same category" when it's actually a
different category that absorbs the best parts of both.

## README — agent-first value prop + self-sustaining workflows — 2026-05-18

### Added & Changed

- **Top-of-README value prop rewritten** to lead with the actual
  strengths: "Agent-first workflows that run themselves."
  Three numbered pillars now explicit:
  1. **Project-first scaffolding** — `/agent-init` works on any git
     repo, detects stack, picks the right test command.
  2. **Agent-first execution** — `/agent-all` runs brainstorm → plan
     → implement → review → PR as ONE pipeline (you approve the plan;
     it drives itself).
  3. **Self-sustaining loops** — `--loop` + `--max-iter` + `--max-cost`
     + `breakCondition` + Claude Code's `/goal` enable unattended
     overnight runs.

- **New "Self-sustaining workflows" section** (placed after "Pick a
  theme", before "Stack examples"). Documents:
  - Components table: `--loop`, `--max-iter`, `--max-cost`,
    `breakCondition`, `/goal`, `/thrift`
  - Concrete "unattended overnight feature ship" recipe combining
    `/thrift` + `/goal` + `/agent-all --loop`
  - Step-by-step explanation of what happens under the hood
  - Harness `--loop` vs Ralph Loop comparison with criteria for when
    to use which

- **"Adjacent tools" subsection trimmed** to a cross-ref pointing back
  to "Self-sustaining workflows" (eliminates duplication).

This addresses three feedback points: (1) the value prop wasn't selling
what makes this different, (2) `/goal` and Ralph Loop integration
wasn't visible, (3) "auto-bootstrap per project" strength wasn't called
out as a numbered pillar.

## README — ecosystem context section — 2026-05-18

### Added

New section in both READMEs: **"How this fits with the rest of the
Claude ecosystem"**. Explains the layering between agent-skill (this
repo), `superpowers`, and `context-mode`:

- ASCII diagram showing agent-skill composes ON TOP of superpowers
  (wraps its skills) and context-mode (uses its tools).
- Table of every `superpowers:*` skill the harness invokes + which
  command uses it (brainstorming, writing-plans, dispatching-parallel-
  agents, subagent-driven-development, systematic-debugging, TDD,
  verification-before-completion, requesting-code-review).
- Table of every `context-mode` tool (`ctx_execute`,
  `ctx_execute_file`, `ctx_batch_execute`, `ctx_search`,
  `ctx_fetch_and_index`, `ctx_stats`) with use cases.
- Step-by-step walkthrough of `/agent-all "Add OAuth"` showing exactly
  which superpowers skill and which context-mode tool fires at each phase.
- Graceful-degradation note: harness commands work without either
  plugin installed (skip phases or no-op hooks); both are recommended.
- Install commands for both: `superpowers@claude-plugins-official` and
  `context-mode@context-mode`.

This addresses a gap users hit when they install agent-skill but don't
know what `superpowers:brainstorming` means or why the harness keeps
referring to it.

## README — user-friendly rewrite — 2026-05-18

### Changed

Both READMEs rewritten with a friendlier voice:
- **Above-the-fold value prop** in plain language: "One marketplace,
  five slash commands, every AI coding tool." No jargon.
- **60-second install** + single-command update path up top.
- **Per-command sections** (`/agent-init` / `/agent-all` / `/visual-qa`
  / `/thrift` / `/explore` / `/debug`) each show what the command does
  in 2-3 sentences plus the most useful flags. No phase tables, no
  internal lib references in the user-facing path.
- **Common workflows** section with concrete copy-paste recipes
  (new project, onboarding, flaky test, pre-launch, long debugging).
- **"Going deeper"** section at the bottom links to architecture /
  specs / changelog for users who want the technical details — kept
  out of the way for the 90% who don't.

Cut from the user-facing path (still in docs/ for those who need it):
- Phase-by-phase walkthroughs of every command
- Architecture trees + per-plugin layout
- Composition patterns / Codex rescue / cross-platform deep dive

Length: README.md ~290 lines (was ~530), README.ko.md mirrors.

## README + plugin-update documentation — 2026-05-18

### Updated

- `README.md` and `README.ko.md` fully rewritten to reflect the current
  17-plugin / 5-theme state (was stuck at the 2-plugin / 3-theme version
  with thrift listed as "RESERVED").
- Added a dedicated **"Updating plugins"** section covering all hosts:
  - Claude Code: `/plugin update <name>@agent-skill`,
    `/plugin update --marketplace agent-skill`, `/plugin update --all`,
    `/plugin marketplace update agent-skill`
  - Codex CLI: `codex plugins update [<name>]`
  - GitHub Copilot CLI: `gh copilot plugins update [<name>]`
  - Gemini CLI: `gemini extensions update [<name>]`
  - Cursor: re-run `bin/install.mjs --force` (renderer-style; idempotent
    via `thrift-` / `floor-` sentinel)
  - Clean-install path: uninstall + remove marketplace + re-add
  - Per-plugin uninstall: `node plugins/<p>/bin/install.mjs --uninstall`
- Added a dedicated **"Cross-platform support"** matrix showing which
  themes ship on which hosts at what fidelity (✅ / scaffold / port deferred).
- Added a dedicated **"The 5 themes"** section with the A/B/C/D/E
  positioning table.
- Updated command reference to include `/thrift`, `/explore`, `/debug`.
- Added onboarding + flaky-test debugging examples.
- Updated "Versioning" section to reflect the iteration timeline
  (41 → 7 → 5 → 4 → 1 → 2 commits across five sub-iterations).

## 6 new plugins + per-platform implementations — 2026-05-18 (commit 0aa3cea)

10 parallel agents shipped 6 new marketplace plugins + filled in the
agent-all + visual-qa implementations across all 4 existing platform
plugins. Marketplace now lists 17 plugins (was 11).

### New plugins (6)

- `harness-thrift-cursor` (v0.1.0) — Theme B port for Cursor. Single
  `.cursor/rules/thrift.mdc` rule + advisory-only audit; no programmatic
  hooks. 5 phases (no Phase 4 cache prime). 24 tests.
- `harness-thrift-copilot` (v0.1.0) — Theme B port for Copilot CLI.
  `.github/hooks/*.json` patcher, `store_memory` bridge with file
  fallback, OpenAI rate table. 6 phases. 32 tests.
- `harness-thrift-codex` (v0.1.0) — Theme B port for Codex CLI.
  TOML-aware `~/.codex/config.toml` patcher with sentinel comment
  bracketing, OpenAI rate table with 0.5× cache multiplier. 6 phases.
  24 tests.
- `harness-thrift-gemini` (v0.1.0) — Theme B port for Gemini CLI
  (heaviest port). `~/.gemini/settings.json` user-scope patcher, Vertex
  AI rate table with separate cacheRead/cacheWrite/storage-hour terms,
  min-token gate, free-tier short-circuit ROI evaluator. 5 phases.
  30 tests.
- `harness-explore` (v0.1.0) — Theme D (new). Codebase exploration
  with 5-phase pipeline: preflight → fan-out → aggregate → deps →
  render. Parallel-dispatch tree walker, dependency graph extraction
  (TS/Python/Rust/Go regex), cache keyed by `git rev-parse HEAD`,
  `/explore where` + `/explore deps` queries. 46 tests.
- `harness-debug` (v0.1.0) — Theme E (new). 6-phase debugging workflow:
  preflight → reproduce → isolate → hypothesize → verify → summarise.
  WRAPS `superpowers:systematic-debugging`. 10-format error parser,
  ddmin + git-bisect lib, hypothesis tracker, repro suggester. 66 tests.

### Per-platform implementations (existing 4 plugins extended)

- agent-all-cursor + visual-qa-cursor (55 new tests) — vendored lib +
  plan-parser, state-rw, page-result-collector, report-renderer.
- agent-all-copilot + visual-qa-copilot (126 new tests) — dispatch-task,
  await-wave, memory-bridge, cost-tracker + visual-qa siblings.
  bin/install-hooks.mjs registers subagentStop.
- agent-all-codex + visual-qa-codex (99 new tests) — dispatch-strategy,
  codex-agent-dispatch/wait, sequential-dispatch.
  bin/install-hook.mjs merges TOML into ~/.codex/config.toml.
- agent-all-gemini + visual-qa-gemini (39 new tests) — subprocess-fleet,
  result-collector, tmp-gc, cost-accumulator (3-path).

### Infrastructure

- `marketplace.json`: 17 plugins (added 6).
- `tests/lib/cross-platform-{manifest,isolation}.test.mjs`: extended.
- `scripts/sync-lib.mjs`: `VENDORED_RENDER_ONLY` now covers 11 plugin
  `bin/lib/` dirs (19 vendored `render.mjs` files tracked).

### Result

981/981 tests pass (was 427, +554). Working tree clean.

### Still deferred

- Live CC + per-platform CLI verification (sandbox unavailable).
- Anthropic/OpenAI/Vertex SDK actual API hookups.
- Token counting accuracy improvements where CLIs don't expose tokens.

## sub-project specs + host invokers + thrift installer — 2026-05-18

### Specs (12 new — all design-only)

- `2026-05-18-agent-all-{codex,copilot,cursor,gemini}-impl-spec.md` (4 files)
  — per-platform implementation plans for the agent-all-scaffold ports.
  Each enumerates the lib modules + hook scripts + tests to write,
  effort breakdown summing to the per-platform estimate (Cursor 3d,
  Copilot 1w, Codex 1w, Gemini 1.5w), open questions, acceptance criteria.
- `2026-05-18-visual-qa-{codex,copilot,cursor,gemini}-impl-spec.md` (4 files)
  — same shape for the visual-qa 6-phase orchestrator ports.
- `2026-05-18-harness-thrift-per-platform-decomposition.md` — 4-port
  decomposition for Theme B (Cursor ~5d, Copilot ~1.5w, Codex ~1.5w,
  Gemini ~2w). Key decisions: independent rate-table copies (not
  inheritance), Cursor port collapses to a single `.mdc` rule, ordering
  Cursor → Copilot → Codex → Gemini.
- `2026-05-18-harness-explore-design.md` — new plugin design.
  Codebase-mapping skill, 5 phases, parallel-dispatch reader pattern,
  cached map keyed by `git rev-parse HEAD`, `/explore where` + `/explore deps`
  slash commands. ~3 weeks total.
- `2026-05-18-harness-debug-design.md` — new plugin design.
  Reproduce → isolate → hypothesize → verify workflow with `.debug-state.json`
  checkpointing, structured error parsing (10 formats), bisection lib,
  WRAPS `superpowers:systematic-debugging` rather than replacing.
  ~3 weeks total.
- `2026-05-18-hook-precedence-integration.md` — protocol spec for
  harness-floor + harness-thrift + context-mode hook coexistence.
  Event-by-event firing order matrix, sentinel-based registration
  contract, settings-precedence policy, migration plan for existing
  hook-registering plugins.

### Implementations

- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/lib/host-invoker.mjs`
  — 4 production host invoker wrappers for the ask-user-adapter contract.
  Cursor: chat I/O (stdout + readline) wrapper.
  Copilot/Codex: `ask_user`-tool wrapper; Codex also stubs the
  `exec_command`/FZF TTY path.
  Gemini: free-text `ask_user` wrapper with response-shape normalization.
- `plugins/harness-thrift/bin/install.mjs` — automated install renderer
  for the /thrift skill. Walks template hooks, copies lib into
  `<target>/.claude/hooks/lib/`, rewrites import paths post-render,
  applies `patchSettings`. Flags: `--ctx`, `--force`, `--dry-run`,
  `--no-instrument`. Bundles `bin/lib/render.mjs` vendored from
  harness-builder via `scripts/sync-lib.mjs`.
- `plugins/harness-thrift/skills/thrift/lib/anthropic-summariser.mjs`
  — `anthropicSummariseFn({apiKey, model, sdkPath, sdkLoader})` factory
  for the `--use-haiku` summariser path. Dynamic SDK import with clean
  "Install @anthropic-ai/sdk" error; `sdkLoader` injection makes it
  testable without the actual SDK.

### Tests

- `tests/lib/ask-user-host-invoker.test.mjs` — 20 tests across 4
  platforms.
- `tests/lib/thrift-install.test.mjs` — 8 tests.
- `tests/lib/thrift-anthropic-summariser.test.mjs` — 9 tests.
- `scripts/sync-lib.mjs` extended: `plugins/harness-thrift/bin/lib`
  added to VENDORED_RENDER_ONLY (13 vendored files total).

### Result

427/427 tests pass (was 390, +37). Working tree clean. 12 new specs +
6 new implementation files + tests.

### Still deferred

- Implementation of the 9 per-platform impl specs.
- Implementation of `harness-explore` (~3w) and `harness-debug` (~3w).
- Live CC verification per hook precedence integration spec.
- v2 thrift summariser using programmatic compact API.

## harness-thrift v0.1 — 2026-05-18

Theme B implementation landed. New plugin `harness-thrift` (11th in
marketplace) ships cost-conscious long-session optimisation per the
design spec.

### Added — research-notes (sandbox-bound spikes)

- `docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`
  — decision: v1 ships advisory summariser (file + Notification);
  programmatic compact deferred to v2 pending CC plugin API.
- `docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md`
  — decision: thrift PreToolUse(Bash) is telemetry-only (context-mode-
  router stays authoritative); `.claude/settings.local.json` patched
  append-only with `thrift-` sentinel for safe revert.

### Added — plugin

- `plugins/harness-thrift/` (v0.1.0). Skill `/thrift` with 6 phases:
  - Phase 0 — preflight (context-mode detect, existing hooks scan)
  - Phase 1 — config (seed/load `.thrift.json`)
  - Phase 2 — instrument (append-only `.claude/settings.local.json` patch)
  - Phase 3 — summariser (v1 advisory: file + Notification nudge)
  - Phase 4 — cache-prime (disabled by default; ROI gate)
  - Phase 5 — audit (end-of-session report)

### Added — lib modules

- `lib/config-loader.mjs` — schema-validated `.thrift.json` parser with
  field-level error reporting; built-in DEFAULTS fallback.
- `lib/threshold-evaluator.mjs` — `shouldFireSummariser({turns, tokens})`;
  `estimateTokensFromBytes()` heuristic (3 bytes/token mixed default).
- `lib/cost-estimator.mjs` — rate table for opus-4.7/sonnet-4.6/haiku-4.5;
  `estimate()` + `estimateSession()` with per-model breakdown +
  baseline-vs-actual savings ratio.
- `lib/metrics-collector.mjs` — `.thrift-state.json` reader/writer with
  atomic rename; `recordTurn/Summariser/Coercion/CachePrime/Phase`.
  Corrupt state file → fresh + `.bak.<ts>` backup.
- `lib/audit-renderer.mjs` — builds context for the report template;
  cache hit rate, savings %, per-model breakdown.
- `lib/settings-patcher.mjs` — append-only `.claude/settings.local.json`
  patcher with `thrift-` sentinel revert; refuses to touch unparseable
  files; idempotent (skips already-registered).
- `lib/summariser.mjs` — v1 advisory summariser; preserves last N turns
  verbatim + extracts `docs/superpowers/specs|plans|research-notes/*`
  paths as pinned refs. `heuristicSummariseFn()` fallback for
  dependency-free operation.
- `lib/cache-prime.mjs` — `computeCohortKey()` (session / branch /
  combined); `schedulePrime()` interval scheduler with error-resilience
  + cancellation; `evaluateCachePrimeROI()` gate (skip when session <15
  min or no expected pauses).

### Added — templates

- `templates/thrift.config.json.hbs` — `.thrift.json` seed
- `templates/audit-report.md.hbs` — Markdown audit report
- `templates/hooks/thrift-pretool-bash-telemetry.mjs.hbs`
- `templates/hooks/thrift-pretool-read-coerce.mjs.hbs`
- `templates/hooks/thrift-posttool-summariser-trigger.mjs.hbs`
- `templates/hooks/thrift-sessionstart-cache-prime.mjs.hbs`
- `templates/hooks/thrift-sessionend-audit.mjs.hbs`

### Tests

- `tests/lib/thrift-core.test.mjs` (17 tests) — config-loader,
  threshold-evaluator, cost-estimator
- `tests/lib/thrift-audit.test.mjs` (12 tests) — metrics-collector +
  audit-renderer + end-to-end report render
- `tests/lib/thrift-instrument.test.mjs` (8 tests) — settings-patcher
  append-only / unpatch sentinel / dry-run / unparseable refuse
- `tests/lib/thrift-summariser.test.mjs` (8 tests) — summarise contract,
  spec-path preservation, heuristicSummariseFn first-sentence extraction
- `tests/lib/thrift-cache.test.mjs` (13 tests) — cohort key, ROI gate,
  schedulePrime timing + cancellation + error resilience

### Marketplace

11th plugin registered. cross-platform-{manifest,isolation} tests
expanded; "marketplace.json lists all eleven plugins" assertion.

### Result

390/390 tests pass (was 330, +60). Working tree clean. All 7 sub-tasks
from the design spec complete (within sandbox limits).

### Still deferred

- Live CC verification of hook firing order + Notification payload.
- v2 programmatic compact (replace advisory v1) once CC API surfaces.
- Anthropic SDK integration for `--use-haiku` summariser path (currently
  heuristic fallback).
- Per-platform Theme B ports (Codex/Copilot/Gemini/Cursor) —
  decomposition spec deferred.

## cross-platform install + dispatch + adapter implementation — 2026-05-18

### Added

- `plugins/harness-floor-{cursor,copilot,codex,gemini}/bin/init.mjs`
  — install renderers for each platform. Walks plugin's installable
  templates, writes them to a target project with overwrite protection,
  prints platform-specific config snippets (Cursor: `.cursor/mcp.json`,
  Copilot: `~/.copilot/mcp-config.json`, Codex: `~/.codex/config.toml`
  with `[[hooks.agent]]` matchers, Gemini: `~/.gemini/settings.json`
  mcpServers).
  Flags: `--ctx`, `--force`, `--only=visual-qa|agent-all`.
- `plugins/harness-floor-gemini/bin/spawn-wave.mjs` — Phase 3 wave
  dispatcher for `/agent-all-gemini`. Spawns N parallel `gemini chat`
  subprocesses per wave; awaits via tmp-file polling; aggregates.
- `plugins/harness-floor-gemini/bin/spawn-page-subagent.mjs` — Phase 3
  page dispatcher for `/visual-qa-gemini`. Same pattern; honors
  `--max-parallel` for chunked dispatch.
  Both spawn libs support `--dry-run` and `--gemini-bin` substitution.
- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/lib/ask-user-adapter.mjs`
  — implementations of the structured Q&A adapter from the design spec.
  Each exports `askUserStructured({stage, prompt, choices, multi,
  freeFormFallback, invoker})` with the same contract across all 4
  platforms.

### Specs

- `docs/superpowers/specs/2026-05-18-harness-thrift-design.md` — full
  design for Theme B `harness-thrift` plugin (6 sub-projects, ~3 weeks).
- `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`
  refreshed with bin/init.mjs + spawn-wave/page + ask-user-adapter
  verification steps; updated acceptance criteria.

### Tests

- `tests/lib/harness-floor-init.test.mjs` (16 tests)
- `tests/lib/gemini-spawn.test.mjs` (8 tests)
- `tests/lib/ask-user-adapter.test.mjs` (26 tests)
- `scripts/sync-lib.mjs` extended for `harness-floor-*/bin/lib/` render.mjs

### Result

330/330 tests pass (was 280, +50). Working tree clean.

### Still deferred

- Live CLI verification of all bin/init.mjs outputs.
- Subprocess dispatcher run with real `gemini` binary (sandbox lacks it).
- Each platform's `ask_user` response-shape confirmation.
- `harness-thrift` implementation per its design spec (~3 weeks).

## cross-platform full-pipeline porting (scaffold) — 2026-05-18

### Added — agent-all per-platform ports (4 sub-projects)

Per the agent-all porting decomposition spec, ships scaffold-only ports
of the 7-phase /agent-all pipeline across 4 platforms with platform-
specific dispatch primitives:

- `harness-floor-cursor/skills/agent-all-cursor/` — prompt template
  approach (3d estimate). Cursor delegates via description-matching;
  ships `.cursor/rules/agent-all.mdc` + 3 subagent files
  (`is_background: true` for parallel).
- `harness-floor-copilot/skills/agent-all-copilot/` — uses Copilot's
  `task` tool for parallel wave dispatch (1w estimate). Awaiter prefers
  `subagentStop` hook, falls back to `list_agents` polling. Plan persists
  to `store_memory(scope=repository)`.
- `harness-floor-codex/skills/agent-all-codex/` — dual dispatch: `agent`
  hook (preferred) OR sequential `.codex/skills/<role>/SKILL.md` (fallback,
  auto-detected at preflight; 1w estimate). Ships
  `codex-hooks-snippet.toml.hbs` for `[[hooks.agent]]` matcher.
- `harness-floor-gemini/skills/agent-all-gemini/` — subprocess-based
  dispatch via `run_shell_command("gemini chat ... &")` (1.5w estimate,
  heaviest because Gemini has no native subagent primitive). Config
  adds `dispatch.{subprocessTimeout, maxSubprocesses, subprocessTmpDir}`.

All 4 ports preserve the 7-phase contract (preflight → intent → plan →
dispatch → gate → PR → loop). Each ships SKILL.md + 7 phase docs +
templates + references/porting-notes.md documenting platform-specific
limits and open research questions.

### Added — visual-qa per-platform ports (4 plugins graduated)

Graduates all 4 cross-platform `visual-qa-<platform>` plugins from
scaffold-only (config + MCP snippet) to full 6-phase pipeline (Phase 3
fan-out uses platform-native primitive):

- Cursor: `@visual-qa-page` subagent with `is_background: true`
- Copilot: `task()` per page + `subagentStop`/polling awaiter
- Codex: `[[hooks.agent]]` matcher OR sequential `.codex/skills/visual-qa-page`
- Gemini: parallel `gemini chat` subprocess spawn with PID waiter

Per platform adds 6 phase files + page-prompt + analysis-prompt + report
templates + porting-notes. Codex also gets `codex-hooks-snippet.toml.hbs`.

### Added — design specs

- `docs/superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md`
  — design for unifying brainstorming Q&A across Claude Code AskUserQuestion,
  Cursor chat, Copilot/Codex/Gemini ask_user. ~10d implementation effort
  estimated; deferred to per-platform sessions.
- `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`
  — handoff doc for runtime checks that require live CLI access (sandbox
  cannot install Codex/Copilot/Gemini/Cursor). Enumerates per-plugin
  verification matrix + acceptance criteria.

### Added — Cursor visual-qa scaffold baseline

New `harness-floor-cursor` plugin (was missing from the original 3-plugin
scaffold). Completes the 4-platform matrix. Adds 10th plugin to marketplace.

### Tests

- `tests/lib/agent-all-{cursor,copilot,codex,gemini}.test.mjs` —
  per-platform structure validation (8 tests each × 4 = 32 tests)
- `tests/lib/visual-qa-cross-platform.test.mjs` — graduation + phase
  contract validation (6 tests × 4 platforms = 24 tests)
- `tests/lib/cross-platform-render.test.mjs` — extended with 13 new
  template render cases (4 agent-all + 7 visual-qa)
- `tests/lib/cross-platform-{manifest,isolation}.test.mjs` — registers
  harness-floor-cursor (8th entry)
- 280/280 tests pass (was 203, +77)

### Still deferred

- Implementation of subprocess machinery (Gemini), `agent` hook research
  (Codex), `task` tool concurrency probe (Copilot), background-chat
  awaiter (Cursor) — all require live CLI access; see runtime checklist.
- `bin/init.mjs` renderers per cross-platform `harness-floor-*` plugin
  for automated install (current scaffolds are docs-only for some).
- `ask-user-adapter` implementations per platform — design spec exists;
  implementation is ~10d follow-up.
- End-to-end agent-all + visual-qa runs on actual CLIs — per the runtime
  checklist's acceptance criteria.

## visual-qa porting scaffold — 2026-05-18

### Added
- Three new sibling plugins for cross-platform visual-qa scaffolding:
  - `harness-floor-codex`, `harness-floor-copilot`, `harness-floor-gemini`
- Each emits `.visual-qa.json` config + a Playwright MCP entry (printed to stdout) for the host platform's MCP config location.
- Marketplace entries; manifest/render/isolation tests extended to cover the new plugins.
- `scripts/sync-lib.mjs` — single command to sync vendored `lib/` copies between harness-builder/agent-init and each cross-platform plugin. `--check` mode for CI drift detection.

### Still deferred
- Full 6-phase orchestrator port per platform (visual-qa) — separate per-platform spec needed.
- agent-all port per platform — subagent dispatch differs sharply per host; per-platform research + spec needed. See `docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md`.
- Brainstorm integration via host-native ask_user equivalents.
- Runtime validation against actual CLIs.

## Cross-platform follow-up — 2026-05-18

### Added
- Optional Phase 4 emit in `codex-init`, `copilot-init`, `gemini-init`:
  - Codex: `.codex/config.toml` with `[hooks]` + `[mcp_servers.*]` stubs
  - Copilot: `.github/hooks/{preToolUse,postToolUse,agentStop}.json` static stubs + `mcp-config.json` snippet printed to stdout
  - Gemini: `.gemini/settings.json` with `hooks` (BeforeTool/SessionStart) + `mcpServers` stubs
- `plugins/harness-builder-cursor/bin/init.mjs` — Node renderer that reads ctx JSON, runs `detectProject`, and writes all rendered `.cursor/rules/` and `.cursor/agents/` files. Refuses to overwrite without `--force`.
- `bin/install.sh` is now a deprecation shim that points to `init.mjs`.

### Tests
- Extended cross-platform render coverage for the three new platform-config templates.
- New `cursor-renderer.test.mjs` exercises the full end-to-end renderer against a temp directory.

### Still deferred
- visual-qa / agent-all per-platform porting (separate specs)
- Brainstorm integration via host-native `ask_user` equivalents
- Runtime validation against actual CLIs

## Cross-platform plugins — 2026-05-18

### Added
- Four new sibling plugins so users on each tool get a harness-builder equivalent inside their host:
  - `harness-builder-codex` — emits `AGENTS.md` + `.codex/skills/<role>/SKILL.md` for Codex CLI
  - `harness-builder-copilot` — emits `.github/copilot-instructions.md` + `AGENTS.md` + path-specific instruction files for GitHub Copilot CLI
  - `harness-builder-gemini` — emits `GEMINI.md` + `.gemini/skills/<role>/SKILL.md` for Gemini CLI (a.k.a. "antigravity")
  - `harness-builder-cursor` — emits `.cursor/rules/agent-init.mdc` + `.cursor/agents/<role>.md` for Cursor
- Marketplace entries for all four new plugins.
- Tests: manifest validity, render-substring snapshots, per-plugin isolation.

### Out of scope (this iteration)
- Visual-qa / agent-all parity per platform
- Hook & MCP wiring beyond stubs
- Full brainstorm integration inside each platform

## harness-builder 0.3.0 — 2026-05-18

### Added
- `detectProject(dir)` in `lib/detect-stack.mjs` returns `{ stack, runtime, services }`. Detects Docker runtime via `Dockerfile` or any `docker-compose.yml` / `compose.yaml` variant, and extracts top-level `services:` keys from compose YAML (regex parser, sorted).
- New fixtures: `docker-only`, `node-ts-docker`, `python-compose-only`, `python-requirements-only`, `dockerfile-bad-compose`.
- `CLAUDE.md` template now renders `(on docker: postgres, redis)` when runtime/services are present.

### Changed
- Phase 1 of `/agent-init` calls `detectProject` and spreads the result into the discovery context. Adds a pre-joined `services_str` for the template.

### Preserved
- `detectStack(dir)` remains as a thin back-compat wrapper returning the stack string. No callers were impacted.

## harness-builder v0.2.0 / harness-floor v0.2.0 — 2026-05-18
### Breaking
- **Renamed `/harness-init` → `/agent-init`**. Old name removed. Plugin/state names follow: `.harness-state.json` → `.agent-init-state.json` (backward-compat: old filename still gitignored).
- **`/agent-init --theme=floor` is now the DEFAULT.** Opt out with `/agent-init --lite` (`--theme=lite` remains a compatibility alias).

### Added
- `/agent-init --theme=thrift` flag — RESERVED stub for Theme B (no behaviour yet).
- `/agent-all` skill in `harness-floor` (Theme C-2): 7-phase pipeline wrapping superpowers brainstorming + writing-plans + subagent-driven-development, with optional `--loop` (Theme C-3 ralph-pattern absorbed as flag).
- `/agent-init --theme=floor` integration (now default): seeds `.agent-all.json` alongside `.visual-qa.json` and adds Floor section to generated CLAUDE.md.
- Korean documentation siblings (`*.ko.md`).
- Cost-unrestricted defaults: `maxIter=10`, `maxCostUSD=500`, `waveSize=large`. Visual-QA confirm threshold raised 500→5000 captures.
- Render lib: nested same-type blocks now supported (balance-counter parser).
- `--theme=thrift` reserved as future Theme B entry point.

### Tags
- `harness-builder-v0.1.0-rc1` (initial release)
- `harness-floor-v0.1.0-rc1` (visual-qa initial)
- `harness-floor-v0.2.0-rc1` (visual-qa + agent-all)

## harness-floor v0.1.0 — 2026-05-17
### Added
- `/visual-qa` skill: Playwright MCP capture matrix + per-image LLM analysis + run-to-run diff. Hybrid JSON+markdown analysis output per capture.
- 3 lib modules: config-loader, matrix-builder, diff-runs, cost-estimator (all TDD).
- `/harness-init --visual-qa` flag (legacy alias post-v0.2.0) — seeds `.visual-qa.json`.
- Multi-plugin layout migration: `skills/harness-init` moved under `plugins/harness-builder/`.

## harness-builder v0.1.0 — 2026-05-17
### Added
- Initial release. `/harness-init` skill bootstraps CLAUDE.md + `.claude/agents/` + 3 hooks + plugin wiring in 5 phases.
- 4 lib modules: render (mustache-subset engine), detect-stack, plugin-scan, manifest-merge — all TDD.
- 12 templates: CLAUDE.md.hbs + 9 agent role templates + 3 hook templates + settings.local.json.hbs.
- Global hook: `context-mode-cache-heal.mjs` (SessionStart).
