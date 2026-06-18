> 🇰🇷 한국어: [USAGE.ko.md](USAGE.ko.md)

# Usage Cookbook

Common command recipes for the `agent-skill` plugins.

If you are installing for the first time or deciding whether `/agent-init` is needed again, start with the [image-backed user manual](USER_MANUAL.md). It explains global plugin install versus per-project init, how to tell whether a project is ready, and good `/agent-all` request examples.

If you are comparing harnesses or building a general harness for your own
organization, read [Harness Positioning](HARNESS_POSITIONING.md). It explains
why `agent-skill` is a cross-host project scaffold rather than a standalone
runtime, and when Gajae-Code or OMO may be the better fit.

## Bootstrapping

### Fresh project (default — full Floor harness)

```
mkdir my-app && cd my-app && git init
/agent-init
```

Produces:
- `CLAUDE.md` with operating principles + agent index + Floor Theme section
- `.claude/agents/*.md` — base size roster plus operational roles: orchestrator, frontend-dev, backend-dev, integration-dev, verification-reviewer, qa-reviewer, design-reviewer, security-reviewer, data-reviewer
- `.claude/hooks/*.mjs` — context-mode-router, session-summary, cache-heal, and operational policy hook
- `.claude/settings.local.json` — registers the core hooks and policy hook
- `.visual-qa.json` + `.agent-all.json` — Floor configs

### Minimal harness (lite)

```
/agent-init --lite
```

Skips task ledger files, policy hooks, `.visual-qa.json`, `.agent-all.json`, and the Floor section in CLAUDE.md.

### Persistent language

```
/agent-init --lang=ko
/agent-init --lang=auto
```

Records the selected interaction language in `CLAUDE.md` and keeps
`.agent-all.json` `language` aligned so downstream `/agent-all` prompts inherit it.
Use `--lang=auto` to resolve from `$AGENT_INIT_LANG`, `$LANG`, `$LC_ALL`,
`$LC_MESSAGES`, or locale before persisting the resolved `ko`/`en` value.

### Existing project (preserve existing CLAUDE.md)

```
/agent-init --merge
```

Appends a harness section to the existing CLAUDE.md instead of refusing.

### Re-run / repair

```
/agent-init --resume       # continue after Ctrl-C or partial run
/agent-init --force        # nuke state and start over (overwrites)
```

## Multi-agent pipeline (`/agent-all`)

### One-shot from free-form prompt

```
/agent-all "Add OAuth login with GitHub"
```

Phases: brainstorming → writing-plans → wave dispatch (parallel impl + review) → PR.

### From an existing task file

```
/agent-all .agent-skill/tasks/T-20260611-001-fix-flaky-test.md
```

Skips brainstorming (you've already done it), goes straight to plan + dispatch.
New task files use a `T-YYYYMMDD-NNN` display id in the filename and an
`AS-TASK-*` canonical id in frontmatter and `.agent-skill/registry/tasks.json`.

### Iterate until tests pass

```
/agent-all "Fix the flaky login test" --loop --max-iter=10
```

Reruns the full pipeline until `npm test` (from `.agent-all.json`'s
`loop.breakCondition`) exits 0 for `stableIters` consecutive iterations. Use
`--max-iter=0` or `.agent-all.json` `loop.maxIter: null` for unlimited
iteration count; cost/runtime budgets, hard policy hooks, user interruption,
and repeated failure signatures still stop the loop.

Non-web completion checks can use verification adapters instead of visual QA:

```
/agent-all "Validate CLI behavior" --loop \
  --break-condition='{"type":"verification-adapter","adapter":"cli","config":{"command":"my-tool --check","goldenStdoutPath":"test/golden/help.txt"}}'

/agent-all "Refresh notebook output" --loop \
  --break-condition='{"type":"verification-adapter","adapter":"notebook-data","config":{"command":"jupyter nbconvert --execute analysis.ipynb --to notebook --inplace","notebooks":["analysis.ipynb"],"requiredArtifacts":["outputs/summary.csv"],"seed":"42","dataSnapshot":"snapshot-id"}}'

/agent-all "Validate SQL result" --loop \
  --break-condition='{"type":"verification-adapter","adapter":"sql-db","config":{"files":["queries/validate.sql"],"command":"npm run validate:sql","assertions":[{"id":"row-count","type":"row-count","expected":10}],"requiredArtifacts":["reports/explain.txt"]}}'
```

Adapters include `verify:web-ui`, `verify:cli`, `verify:api-contract`,
`verify:notebook-data`, `verify:sql-db`, and `verify:batch-job`. Results append
`verification-evidence/v1` entries to
`.agent-skill/runs/<run-id>/verification-evidence.jsonl`.

`harness-data` adds `/data-runner` guidance for notebook, SQL, and artifact
diff work. The generated task template includes a Data Task Addendum, and
destructive SQL/data operations are blocked unless `allowDestructive=true` is
explicitly approved.

### Skip PR creation (commits only)

```
/agent-all "Refactor user.ts" --no-pr
```

### Override wave size

```
/agent-all "Build dashboard" --wave-size=large    # up to 8 parallel subagents
```

## Session handoff (`/agent-handoff`)

### Generate handoff and new-session prompt

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md
```

Writes:
- `.agent-skill/handoff/T-20260611-001-fix-flaky-test.handoff.md`
- `.agent-skill/handoff/T-20260611-001-fix-flaky-test.session.md`

The handoff summarizes completed work, remaining work, blockers, validation
evidence, git state, and next-action candidates. The session prompt includes
source-of-truth files, preflight gates, editable scope, verification gates, and
dangerous-command approvals.

### Preview without writing

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --dry-run
```

### Strict task-doc structure check

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --strict
```

`--strict` requires the standard task-ledger sections but allows unfinished
checkboxes. In non-TTY mode or with `--yes`, the recommended next action
(`/agent-all <task> --resume`) is auto-selected and logged to
`.agent-skill/runs/handoff-audit.jsonl` and
`.agent-skill/runs/handoff/interactions.jsonl`.

### Resume from generated artifacts

```
/agent-all .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --resume
```

`--resume` auto-detects `.agent-skill/handoff/*.handoff.md` and `.session.md`
files, with legacy `docs/tasks/*` sibling fallback, and surfaces their metadata
before continuing.

## Visual QA (`/visual-qa`)

### First run (creates baseline)

```
cd my-app
npm run dev                                       # dev server on :3000
/visual-qa
```

Output: `.agent-skill/reports/visual-qa/<date>-<hex>/report.md` + per-image `.png` + `.analysis.{json,md}`.

## Artifact policy

Generated control-plane artifacts default to `.agent-skill/`: task docs in
`.agent-skill/tasks/`, specs in `.agent-skill/specs/`, plans in
`.agent-skill/plans/`, handoff files in `.agent-skill/handoff/`, task registry
records in `.agent-skill/registry/tasks.json`, run logs in
`.agent-skill/runs/`, visual QA reports in
`.agent-skill/reports/visual-qa/`, debug logs in
`.agent-skill/reports/debug/`, and thrift audits in
`.agent-skill/reports/thrift/`; baselines live in
`.agent-skill/baselines/`. Existing `docs/tasks/` task docs remain readable for
migration/resume. `/agent-init` does not delete existing user docs.

Use `.agent-all.json` `"artifact": {"root": ".custom-agent", "exportDocs": false}`
to change the root. `exportDocs: true` is an explicit opt-in for workflows that
mirror selected reports into `docs/` for publication.

Before control-plane artifacts are persisted or shared, the redaction gate scans
handoff/session prompts, visual/debug/thrift reports, verification evidence, policy and
interaction/spawn logs, and PR bodies. High-severity secret candidates block by
default; medium privacy candidates are masked. Configure only path/rule
allowlists, not raw secret values:

```json
{
  "security": {
    "redaction": {
      "allowPaths": ["docs/public-fixtures/**"],
      "allowRules": []
    }
  }
}
```

### Re-run after code changes

```
/visual-qa                                        # diff vs latest prior run
```

Reports new / resolved / unchanged issues at the top of `report.md`.

### Force fresh slug (overwrite today's run)

```
/visual-qa --force
```

### Budget guard

```
/visual-qa --budget=2.50
```

Aborts before any capture if estimated cost exceeds $2.50.

## Composition: `/goal` + `/agent-all --loop`

`/goal` is a Claude Code hook that blocks session stop until a condition is met. Combine with `--loop` for fully unattended convergence:

```
/goal "ship the analytics dashboard PR with all tests green"
/agent-all "Build analytics dashboard with auth, charts, export" --loop --max-iter=15 --max-cost=80
```

The session won't end until either:
1. Goal is acknowledged complete by the agent
2. You manually clear with `/goal clear`
3. `--max-iter`, `--max-cost`, or `--max-runtime-sec` is hit (loop exits, but goal hook still blocks until you clear)

### Pattern: nested goal + per-task loop

```
/goal "complete sprint goal: 3 features + bugfix"
/agent-all "Feature A" && /agent-all "Feature B" && /agent-all "Feature C" && /agent-all "Bugfix" --loop
```

## Claude/Codex / non-Claude-Code integration

For Codex CLI projects, use the Codex-specific builder and floor ports:

```
/agent-init
/agent-init --lite
/agent-init --lang=ko
/agent-init --update-foundations
run /agent-all for "Hard refactor that needs second-opinion"
```

`/agent-init` writes `AGENTS.md`, `.codex/skills/*`, `.codex/hooks/agent-policy-hook.mjs`, and prints a current `~/.codex/config.toml` snippet using Codex command hooks such as `[[hooks.PreToolUse]]`. `/agent-init --lite` writes only the root `AGENTS.md` plus planner/dev/reviewer skills. Codex floor workflows run prompt-level/sequential dispatch because current Codex command hooks do not expose the Task-style subagent dispatch surface used by Claude Code.

`/agent-init --lang=ko` records Korean as the Codex interaction language in `AGENTS.md`; keep `.agent-all.json` `language` aligned when the floor bundle is installed. `/agent-init --update-foundations` refreshes only the approved foundations (`superpowers@claude-plugins-official`, `context-mode@context-mode`) and does not patch global Codex config.

For a shell-driven install into a target repo, use the platform renderer. Claude uses the same project-local bootstrapper as `/agent-init`; Codex and other tools use their platform-specific renderers:

```bash
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --theme=builder
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --lite
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lang=ko
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lite
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --no-update-foundations
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --update-foundations  # strict foundation refresh
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --theme=debug
```

The default renderer path installs the operational scaffold. Non-Claude platforms install the heavy builder + floor + thrift bundle by default, and Codex `all` also installs the debug skill. `--theme=debug` installs only `.codex/skills/debug/`, `.debug-artifacts/`, and `.agent-skill/reports/debug/` for `run /debug "<failing command>"`. Claude `--theme=builder` installs the heavy builder scaffold without `.visual-qa.json` or `.agent-all.json`. `--lang=ko|en|auto` keeps generated root guidance aligned and, when floor config is installed, keeps `.agent-all.json` language aligned too. The `--lite` path is builder-only and skips floor/thrift/debug files plus global Codex config snippets. Claude/Codex operational installs auto-update only the approved foundations (`superpowers@claude-plugins-official`, `context-mode@context-mode`) when possible; when `claude` is missing or the approved foundation update fails, the renderer prints a degraded foundation warning and continues. Lite skips that automatic foundation update by default; combine `--lite --update-foundations` when you want the strict approved foundation refresh without installing heavy artifacts. Use `--update-foundations` to make that update strict, `--no-update-foundations` to opt out, and `--dry-run` to print the approved plan without calling `claude`. Claude and Codex `all`, `builder`, `--lite`, and Codex `--theme=debug` installs run the post-install doctor automatically; pass `--no-doctor` only when intentionally deferring validation.

Release artifacts can be verified before install or update with the provenance
manifest:

```bash
node scripts/release-provenance.mjs --release=<rc-tag> --out-dir=.agent-skill/releases/<rc-tag>
./scripts/install-all.sh --verify-checksums --manifest=.agent-skill/releases/<rc-tag>/release-manifest.json --claude-code
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --verify-checksums --manifest=.agent-skill/releases/<rc-tag>/release-manifest.json
./scripts/update.sh --verify-provenance --manifest=.agent-skill/releases/<rc-tag>/release-manifest.json --cli=codex
```

Manual doctor re-run:

```bash
node /path/to/harness-builder/bin/doctor.mjs --target=/path/to/my-project --platform=claude
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex --profile=builder
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex --profile=lite
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex --profile=debug
```

From a source checkout, `node /path/to/agent-skill/scripts/doctor.mjs ...` is the equivalent compatibility wrapper. The doctor validates the project-local Claude/Codex scaffold, auto-detects operational, builder, lite, or Codex debug profile when `--profile=auto`, exits non-zero for missing required artifacts, prints actionable `fix:` commands for missing or stale generated files, and prints `next:` foundation install commands when `superpowers` or `context-mode` are not installed.

Claude/Codex uninstall and cleanup:

```bash
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --uninstall
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --uninstall --force-root-clean
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --uninstall
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --uninstall --force-root-clean
node /path/to/harness-builder/bin/clean.mjs --target=/path/to/my-project --platform=claude --dry-run
node /path/to/harness-builder-codex/bin/clean.mjs --target=/path/to/my-project --platform=codex --dry-run
```

The conservative cleanup removes generated Claude/Codex role files, hooks,
floor/thrift config files, the Codex debug skill directory, task templates,
and helper scripts. It preserves debug evidence in `.agent-skill/reports/debug/` and
`.debug-artifacts/`. Root `CLAUDE.md`/`AGENTS.md` guidance is preserved
unless it has an agent-skill sentinel; pass `--force-root-clean` through
`install-platform.sh --uninstall` when intentionally removing generated-looking
root guidance.

For direct library usage, the core modules are portable Node.js:

```bash
node -e "
import('./node_modules/agent-skill/plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs')
  .then(m => console.log(m.buildWaves(tasks, waveConfig)))
"
```

(The plugin doesn't publish to npm yet; vendor the files directly for now.)

## Troubleshooting

### `/agent-init` aborts with "dirty git tree"

Commit or stash local changes first. `/agent-init` insists on a clean tree to make its single bootstrap commit cleanly.

### `/visual-qa` aborts with "Playwright MCP not available"

Install the playwright plugin:

```
/plugin install playwright@claude-plugins-official
```

### `/agent-all` loop exits with code 3

Loop guard exhausted. Either:
- Raise `--max-iter` (or the config `maxIter`), raise `--max-runtime-sec`, or set `--max-iter=0` for explicit unlimited iteration count
- Loosen `loop.breakCondition` in `.agent-all.json`
- Inspect the last wave's gate verdict in `.agent-all-state.json` for what's blocking

### Plugin not loading after `/plugin install`

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin marketplace update agent-skill
```

Then retry install.

---

## Decision-surfacing — what the panel looks like

When `/agent-all` dispatches an implementer subagent in Phase 3, the first thing it does is a **scoping pass** — read-only inspection that returns a JSON payload of decisions it would otherwise make alone. The coordinator normalizes each decision to `agent-interaction/v1` and shows you each one as a 1/2/3 panel with the subagent's recommendation flagged. Claude uses native `AskUserQuestion`; Codex, Copilot, Cursor, and Gemini use prompt/markdown renderers over the same schema.

Example session output (interactive mode):

```
=== Task 3: Add OAuth callback handler ===

[Token storage] Existing code uses cookies for session, but JWT tokens are typically
stored in localStorage in this codebase per src/lib/auth.ts:42.

Reasoning for recommendation: Sessions in this app are already cookie-based; mixing
storage strategies adds complexity. Cookie aligns with existing pattern.

  1. (Recommended) Cookie (httpOnly, secure) — Matches existing session pattern
  2. localStorage — Matches existing JWT pattern, XSS risk acknowledged
  3. Server-side session store (Redis) — Most secure, adds Redis dependency

Choose: _
```

**Non-TTY mode** (overnight, `--yes`, loop iter ≥ 2) auto-picks the recommended low/medium-risk option and appends to `.agent-skill/runs/<run-id>/decisions.md` plus `.agent-skill/runs/<run-id>/interactions.jsonl`:

```markdown
# Auto-resolved decisions — iter 7 — 2026-05-21T03:14Z

## Task 3 — Add OAuth callback handler

### Token storage
- Chosen: **Cookie (httpOnly, secure)** (recommended)
- Reasoning: Sessions in this app are already cookie-based; mixing storage strategies adds complexity.
```

**Reviewing past auto-picks:** Run `grep -A2 "Chosen:" .agent-skill/runs/*/decisions.md` to see every auto-resolved decision across iterations. If a regression appears, find the relevant decision and add it to the next iteration's plan with a note "force re-ask".

High-risk recommended/default options are not auto-approved in non-TTY mode.
They are written as blocked interactions in `.agent-all-state.json` and
`.agent-skill/runs/<run-id>/interactions.jsonl`, then the run must pause or
escalate for user/planner input. `/agent-handoff` and `/agent-all --resume`
use the same schema for the resume next-action prompt; handoff writes
`.agent-skill/runs/handoff/interactions.jsonl`.

**Opting out per project:** `.agent-all.json` →
```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```
The protocol skips entirely. Verification + reviewer-audit hook validation continue independently.

**Policy engine audit:** hard hooks and loop gates use the shared
`agent-policy-event/v1` -> `agent-policy-result/v1` schema. They append
JSONL decisions to `.agent-skill/runs/<run-id>/policy-log.jsonl`. Dynamic
`/agent-all` orchestration also writes
`.agent-skill/runs/<run-id>/spawn-log.jsonl` with each role, reason, wave, and
cost estimate. The persisted state field is
`orchestration: {runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,failureSignatures,blockedReasons,budget}`.
User-facing decisions persist under `state.interactions` and append
`.agent-skill/runs/<run-id>/interactions.jsonl`. Redaction summaries append to
`.agent-skill/runs/<run-id>/redaction-audit.jsonl` and store only
rule/count/severity/action metadata.

**Cost telemetry:** `/agent-all` normalizes reported platform cost, token
usage, or fallback output-size estimates as `agent-cost-telemetry/v1`. Runs
append `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror the latest
summary to `state.costTelemetry.summary`, ask at
`.agent-all.json: telemetry.cost.warnAtRatio` (default `0.8`), and stop at
`defaults.maxCostUSD`. Keep provider rate overrides in
`telemetry.cost.modelRates` when estimates need project-specific pricing.

**Skill utility eval:** `node scripts/skill-eval.mjs --smoke` compares the
fixture baseline against `agent-all` with pass rate, iterations, token estimate,
cost overhead, manual interventions, reviewer-gate failures, quality-debt
findings, and rollbacks. It writes `.agent-skill/evals/<date>/summary.md`,
`summary.json`, `runs.jsonl`, and `artifacts/fixture-manifest.json`. Use
`--smoke --no-write --json` for CI-safe reporting, and reserve `--full` for
manual/release-candidate benchmark runs that include visual QA, quality gate,
dynamic orchestration, and verification-adapter modes.

**Per-platform enforcement strength:**
| Platform | Mechanism | Strength |
|---|---|---|
| Claude Code | `floor-policy` hook + `renderer-claude.mjs` native `AskUserQuestion` | 🟢 Hard |
| Copilot CLI | `.github/agent-all/decision-protocol.md` + `renderer-copilot.mjs`; optional hook helper after manual hook review | 🟡 Prompt-level |
| Codex CLI | Generated command hook hard-blocks shell policy; `renderer-codex.mjs` for Prompt-level/sequential floor interactions | 🟡 Mixed |
| Cursor | `.cursor/rules/decision-protocol.mdc` + `renderer-cursor.mjs` | 🟡 Soft |
| Gemini CLI | `.gemini/agent-all-decision-protocol.md` + `renderer-gemini.mjs` | 🟡 Soft |
| VS Code Copilot | `.github/agent-all/decision-protocol.md` + Copilot markdown renderer | 🟡 Soft |
