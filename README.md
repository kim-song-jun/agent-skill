> 🇰🇷 한국어: [README.ko.md](README.ko.md)

# agent-skill

Claude Code plugin marketplace for **`/agent-init`** and the cost-unrestricted-by-default agent harness ecosystem.

One command (`/agent-init`) bootstraps a complete agent harness: CLAUDE.md, role-specific subagent files, hooks, plugin wiring, and (by default) the full Floor theme bundle for visual-QA and multi-wave pipeline execution.

## Quick start

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
```

Then in any git repo:

```
/agent-init                        # full Floor harness (DEFAULT)
/agent-init --theme=lite           # minimal: CLAUDE.md + agents + hooks only
/agent-init --theme=thrift         # RESERVED: token-cost optimisation (Theme B planned)
/agent-init --size=large --force   # rebuild with 9-agent roster
```

Then run any of:

```
/agent-all "Add user signup form"                  # full pipeline → PR
/agent-all "Fix flaky test" --loop --max-iter=5    # iterate until green
/visual-qa                                          # screenshot matrix + LLM analysis
```

## Themes (default: `--theme=floor`)

| Theme | What gets bundled | Default? | Use when |
|-------|-------------------|----------|----------|
| `floor` | CLAUDE.md + agents + 3 hooks + `.visual-qa.json` + `.agent-all.json` + Floor section | ✅ DEFAULT | Most projects — cost-unrestricted, ship everything |
| `lite` | CLAUDE.md + agents + 3 hooks only | opt-in | Constrained env / quick prototype |
| `thrift` | (RESERVED) Theme B — context-mode aggressive use, prompt cache, summarisation hooks | planned | Cost-sensitive long-running projects |

## Example workflows

### 1. Bootstrap a new feature project end-to-end

```
mkdir my-app && cd my-app && git init
/agent-init                                         # ← floor harness installed
/agent-all "Build a todo list with auth"            # ← brainstorm→plan→dispatch→PR
```

### 2. Visual regression on a Next.js dev server

```
cd my-next-app                                      # already has .visual-qa.json
npm run dev                                         # localhost:3000
/visual-qa                                          # captures all pages × breakpoints
# → docs/visual-qa/2026-05-18-abc1234/report.md
```

### 3. Self-iterating fix loop

```
/agent-all "Fix bug where login redirects 3x" \
  --loop \
  --max-iter=10 \
  --max-cost=20
```

Stops when `npm test` (the configured breakCondition) exits 0 for `stableIters` consecutive runs, or maxIter/maxCost hit.

### 4. Compose with `/goal` for hands-off execution

```
/goal "ship feature X to staging"                   # block stop until satisfied
/agent-all "Implement feature X" --loop             # iterate
```

The `/goal` hook keeps the session alive until you (or the agent) say the goal is met. Combine with `--loop` for fully unattended convergence.

## Codex / non-Claude-Code platforms

The lib modules (`plugins/*/skills/*/lib/*.mjs`) and templates (`*.hbs`, `*.json`) are pure Node.js / pure data — portable. The phase prompts are Claude Code skill conventions and need adaptation for other platforms.

If you use the `codex@openai-codex` plugin alongside `harness-floor`, the `agent-all` phase 3 dispatch can delegate to Codex via the `codex:rescue` skill when a wave gets stuck — useful as a second-opinion implementer for tough tasks.

For pure Codex CLI usage:
- Install `agent-skill` lib code: `node -e "..."` (or vendor the lib files)
- Re-implement the skill orchestration as Codex prompts (the phase docs are good source material)
- The hook system is Claude Code specific; replicate via Codex's own hook equivalents if available

## Architecture at a glance

```
agent-skill/
├── plugins/
│   ├── harness-builder/        # /agent-init (theme A)
│   └── harness-floor/          # /visual-qa, /agent-all (theme C)
├── hooks/                      # global SessionStart hooks
└── docs/superpowers/{specs,plans}/
```

3 themes; 2 implemented + 1 reserved:
- **A (harness-builder)** — Per-project harness builder via `/agent-init`
- **B (harness-thrift)** — Token-cost optimisation — **planned**, reserved as `--theme=thrift`
- **C (harness-floor)** — Cost-unrestricted patterns: `/visual-qa` + `/agent-all`

## Roadmap

- Theme B (harness-thrift): context-mode aggressive integration, prompt cache optimisation, summariser hooks, pixel-diff visual-qa mode
- Telemetry opt-in for which phases get skipped most
- `gh` PR comment integration for visual-qa reports
- Distributed wave dispatch (multi-machine)

## FAQ

**Q: Will `/agent-init` overwrite my CLAUDE.md?**
A: No. Default is abort if CLAUDE.md exists. Use `--merge` to append a harness section, or `--force` to overwrite.

**Q: Is `/agent-all --loop` safe?**
A: Bounded by `maxIter` (hard cap 50), `maxCostUSD` (default $500), and `breakCondition`. If you set a tight cost cap and a clear test command, it can't run forever.

**Q: What if I don't want the Floor theme?**
A: `/agent-init --theme=lite` skips it. You get just the basic CLAUDE.md + agents + 3 hooks.

**Q: Can I customize the agent roster?**
A: Edit `.claude/agents/*.md` after `/agent-init`. They're plain markdown.

**Q: Does this work with Codex/Cursor/other tools?**
A: Lib code and templates are portable; skill orchestration is Claude Code specific. See "Codex / non-Claude-Code platforms" above.

## Versioning

- `harness-builder`: v0.2.0 (current) — `/harness-init` renamed to `/agent-init`
- `harness-floor`: v0.2.0 (current) — `agent-all` skill added alongside `visual-qa`

See [CHANGELOG.md](CHANGELOG.md) for full history.
