# agent-skill

Claude Code plugin marketplace for `/agent-init` and (eventually) sibling skills that bootstrap project-level agent harnesses.

## Install

```
/plugin marketplace add https://github.com/<owner>/agent-skill
/plugin install harness-builder@agent-skill
```

## What it ships

- `harness-builder` plugin → `/agent-init` skill
- Global hook `context-mode-cache-heal.mjs` (SessionStart)

See `docs/superpowers/specs/` for design, `docs/superpowers/plans/` for implementation plans.

## Themes (roadmap)

| Theme | Plugin | Status |
|-------|--------|--------|
| A. Per-project harness builder | `harness-builder` | implementing |
| B. Token-cost optimisation | `harness-thrift` | planned |
| C. Cost-unrestricted parallel mode | `harness-floor` | planned |
