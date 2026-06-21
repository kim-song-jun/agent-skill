# Phase 0 — Preflight

**Purpose:** Confirm the wiki directory exists and the index is accessible. Create the scaffold on first run (with user confirmation).

## Steps

1. Resolve the wiki directory: `$CLAUDE_PROJECT_DIR/.wiki/` (default). Respect an override from `.agent-all.json` key `wiki.dir` if present.

2. Check for `.wiki/INDEX.md`:
   - **Exists** → read and validate. If the file is not a valid INDEX.md (no `| Page | Slug | Grade | Tags |` header), warn and continue.
   - **Missing** → prompt user: *"No wiki found at .wiki/. Create a new wiki scaffold? (y/n)"*
     - Yes → write `.wiki/INDEX.md` from `templates/index.md.tpl` and `.wiki/.gitignore` containing `*.tmp`.
     - No → abort with exit code 0.

3. Check flags:
   - `--dry-run`: set DRY_RUN=true; skip all writes throughout this skill.
   - `--force`: set FORCE=true; suppress overwrite confirmation in Phase B.
   - `--grade=A|B|C`: validate; default to C if absent or invalid.
   - `--tags=...`: parse as comma-separated list.

4. Print: *"wiki: .wiki/ ready (N pages indexed)"* or *"wiki: .wiki/ created (0 pages)"*.

5. Hand off to Phase A (`phases/1-route.md`) for read/write operations, or Phase 3 (`phases/3-compile.md`) for `/wiki compile`.
