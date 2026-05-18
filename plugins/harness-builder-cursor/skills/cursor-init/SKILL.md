---
name: cursor-init
description: Manual scaffold instructions for using harness patterns inside Cursor.
---

# Cursor Init (manual)

Cursor doesn't have an automated plugin loader, so this skill is documentation
plus a thin install script.

## Install

```bash
bash plugins/harness-builder-cursor/bin/install.sh /path/to/your/project
```

The script copies `templates/rules/agent-init.mdc` to `.cursor/rules/` and
the three `templates/agents/*.md` files to `.cursor/agents/`. Templates are
NOT rendered automatically yet — substitute `{{stack}}`, `{{purpose}}`, etc.
manually for now. See follow-up tracker for the automated renderer.

The plugin's templates are also useful as reference for any Cursor user
who prefers to copy-paste them by hand.
