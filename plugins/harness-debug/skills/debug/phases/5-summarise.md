# Phase 5 — Summarise

Render the durable debug-log artifact and populate `state.resolution`.

## Steps

1. Derive a slug from `state.failure.description ?? state.failure.command`:
   slugify (lowercase, non-alphanum → `-`, collapse repeats), cap at 40
   chars. If empty, fall back to `unknown`.
2. Compute the output path:
   ```
   const path = `docs/debug/${todayISO()}-${slug}.md`;
   ```
   `--slug=<name>` overrides the auto slug.
3. Render `templates/debug-log.md.hbs` with the full state. The
   template iterates `hypotheses[]`, `checkpoints[]`, and the parsed
   error frames.
4. Write the rendered markdown to the computed path. Atomic write
   (tmp + rename).
5. Populate `state.resolution`:
   ```
   state.resolution = {
     rootCause: <verified hypothesis's text || "abandoned — no verification">,
     fixCommit: null,                                 // user fills after fix
     debugLogPath: path,
     finishedAt: new Date().toISOString(),
   };
   saveState(statePath, state);
   ```
6. Optionally append a one-line entry to `docs/debug/index.md`:
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
