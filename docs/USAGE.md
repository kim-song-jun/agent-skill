> 🇰🇷 한국어: [USAGE.ko.md](USAGE.ko.md)

# Usage Cookbook

Common command recipes for the `agent-skill` plugins.

## Bootstrapping

### Fresh project (default — full Floor harness)

```
mkdir my-app && cd my-app && git init
/agent-init
```

Produces:
- `CLAUDE.md` with operating principles + agent index + Floor Theme section
- `.claude/agents/*.md` — base size roster plus operational roles: orchestrator, integration-dev, verification-reviewer, qa-reviewer, design-reviewer, security-reviewer, data-reviewer
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
/agent-all docs/tasks/12-fix-flaky-test.md
```

Skips brainstorming (you've already done it), goes straight to plan + dispatch.

### Iterate until tests pass

```
/agent-all "Fix the flaky login test" --loop --max-iter=10
```

Reruns the full pipeline until `npm test` (from `.agent-all.json`'s `loop.breakCondition`) exits 0 for `stableIters` consecutive iterations. Hard caps prevent runaway.

### Skip PR creation (commits only)

```
/agent-all "Refactor user.ts" --no-pr
```

### Override wave size

```
/agent-all "Build dashboard" --wave-size=large    # up to 8 parallel subagents
```

## Visual QA (`/visual-qa`)

### First run (creates baseline)

```
cd my-app
npm run dev                                       # dev server on :3000
/visual-qa
```

Output: `docs/visual-qa/<date>-<hex>/report.md` + per-image `.png` + `.analysis.{json,md}`.

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
3. `--max-iter` or `--max-cost` is hit (loop exits, but goal hook still blocks until you clear)

### Pattern: nested goal + per-task loop

```
/goal "complete sprint goal: 3 features + bugfix"
/agent-all "Feature A" && /agent-all "Feature B" && /agent-all "Feature C" && /agent-all "Bugfix" --loop
```

## Codex / non-Claude-Code integration

For Codex CLI projects, use the Codex-specific builder and floor ports:

```
/codex-init
/codex-init --lite
/codex-init --lang=ko
/codex-init --update-foundations
run /agent-all for "Hard refactor that needs second-opinion"
```

`/codex-init` writes `AGENTS.md`, `.codex/skills/*`, `.codex/hooks/agent-policy-hook.mjs`, and prints a current `~/.codex/config.toml` snippet using Codex command hooks such as `[[hooks.PreToolUse]]`. `/codex-init --lite` writes only the root `AGENTS.md` plus planner/dev/reviewer skills. Codex floor workflows run prompt-level/sequential dispatch because current Codex command hooks do not expose the Task-style subagent dispatch surface used by Claude Code.

`/codex-init --lang=ko` records Korean as the Codex interaction language in `AGENTS.md`; keep `.agent-all.json` `language` aligned when the floor bundle is installed. `/codex-init --update-foundations` refreshes only the approved foundations (`superpowers@claude-plugins-official`, `context-mode@context-mode`) and does not patch global Codex config.

For a shell-driven install into a target repo, use the platform renderer:

```bash
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lang=ko
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lite
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --update-foundations
```

The default renderer path installs the heavy builder + floor + thrift bundle. `--lang=ko|en|auto` keeps `AGENTS.md` and `.agent-all.json` language aligned across the builder/floor install. The `--lite` path is builder-only and skips floor/thrift files plus global Codex config snippets. `--update-foundations` delegates to `scripts/update.sh --foundations-only`; with `--dry-run`, it prints the approved plan without calling `claude`.

Post-install doctor:

```bash
node /path/to/agent-skill/scripts/doctor.mjs --target=/path/to/my-project --platform=codex
node /path/to/agent-skill/scripts/doctor.mjs --target=/path/to/my-project --platform=codex --profile=lite
```

The doctor validates the project-local Claude/Codex scaffold, auto-detects operational vs lite profile when `--profile=auto`, exits non-zero for missing required artifacts, and warns when `superpowers` or `context-mode` are not installed.

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

`--max-iter` exhausted. Either:
- Raise `--max-iter` (or the config `maxIter`)
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

When `/agent-all` dispatches an implementer subagent in Phase 3, the first thing it does is a **scoping pass** — read-only inspection that returns a JSON payload of decisions it would otherwise make alone. The main thread shows you each decision as a 1/2/3 panel with the subagent's recommendation flagged.

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

**Non-TTY mode** (overnight, `--yes`, loop iter ≥ 2) auto-picks the recommended option and appends to `docs/agent-all/iter-<N>/decisions.md`:

```markdown
# Auto-resolved decisions — iter 7 — 2026-05-21T03:14Z

## Task 3 — Add OAuth callback handler

### Token storage
- Chosen: **Cookie (httpOnly, secure)** (recommended)
- Reasoning: Sessions in this app are already cookie-based; mixing storage strategies adds complexity.
```

**Reviewing past auto-picks:** Run `grep -A2 "Chosen:" docs/agent-all/iter-*/decisions.md` to see every auto-resolved decision across iterations. If a regression appears, find the relevant decision and add it to the next iteration's plan with a note "force re-ask".

**Opting out per project:** `.agent-all.json` →
```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```
The protocol skips entirely. Verification + reviewer-audit hook validation continue independently.

**Per-platform enforcement strength:**
| Platform | Mechanism | Strength |
|---|---|---|
| Claude Code | `floor-policy` hook (PreToolUse + PostToolUse on Task) | 🟢 Hard |
| Copilot CLI | `.github/agent-all/decision-protocol.md`; optional hook helper after manual hook review | 🟡 Prompt-level |
| Codex CLI | Prompt-level/sequential floor workflow; command hooks only for shell/policy events | 🟡 Prompt-level |
| Cursor | `.cursor/rules/decision-protocol.mdc` (always-loaded rule) | 🟡 Soft |
| Gemini CLI | `.gemini/agent-all-decision-protocol.md` (referenced from GEMINI.md) | 🟡 Soft |
| VS Code Copilot | `.github/agent-all/decision-protocol.md` (from copilot-instructions.md) | 🟡 Soft |
