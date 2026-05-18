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
- `.claude/agents/*.md` — 3 to 9 role files (small/medium/large)
- `.claude/hooks/*.mjs` — context-mode-router, session-summary, cache-heal
- `.claude/settings.local.json` — registers the 3 hooks
- `.visual-qa.json` + `.agent-all.json` — Floor configs

### Minimal harness (lite)

```
/agent-init --theme=lite
```

Skips `.visual-qa.json`, `.agent-all.json`, and the Floor section in CLAUDE.md.

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

The `codex@openai-codex` plugin pairs well with `harness-floor`:

```
/agent-all "Hard refactor that needs second-opinion" --wave-size=medium
# When a wave subagent reports BLOCKED, invoke:
/codex:rescue
```

For pure Codex CLI usage (no Claude Code), the lib modules are portable Node.js:

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
