# Phase 5 — Summarise

Render the durable debug-log artifact and populate `state.resolution`.

## Steps

1. Derive a slug from `state.failure.description ?? state.failure.command`:
   slugify (lowercase, non-alphanum → `-`, collapse repeats), cap at 40
   chars. If empty, fall back to `unknown`.
2. Compute the output path:
   ```
   const path = `.agent-skill/reports/debug/${todayISO()}-${slug}.md`;
   ```
   `--slug=<name>` overrides the auto slug.
3. Render `templates/debug-log.md.hbs` with the full state. The
   template iterates `hypotheses[]`, `checkpoints[]`, and the parsed
   error frames.
4. Prefer the deterministic helper:
   ```
   import { finishDebugSession } from "./.codex/skills/debug/lib/debug-artifacts.mjs";
   const result = finishDebugSession({ projectRoot, state, slug, now });
   ```
   It renders the markdown, writes the log atomically, updates
   `.debug-state.json`, appends `.agent-skill/reports/debug/index.md`, and runs every durable
   debug artifact through the secret/privacy redaction gate before writing.
   High-severity findings block the write; medium findings are masked; the
   redaction audit stores only rule/count/severity/action metadata.
5. If implementing manually, write the rendered markdown to the computed
   path with atomic write (tmp + rename).
6. Populate `state.resolution`:
   ```
   state.resolution = {
     rootCause: <verified hypothesis's text || "abandoned — no verification">,
     fixCommit: null,                                 // user fills after fix
     debugLogPath: path,
     finishedAt: new Date().toISOString(),
   };
   saveState(statePath, state);
   ```
7. Optionally append a one-line entry to `.agent-skill/reports/debug/index.md`:
   ```
   - YYYY-MM-DD — <slug> — <rootCause one-liner> — <path>
   ```

## Output to user

```
Debug complete: <rootCause one-liner>
Log: <path>
Hypotheses: <tested>/<total> tested, <verified> verified, <rejected> rejected.
```

Exit code:
- 0 — `resolution.rootCause` is a verified hypothesis.
- 1 — `resolution.rootCause === "abandoned — no verification"` (user
  ran out of ideas; debug log preserved for future sessions).
