# Phase 1 — Reproduce

## Steps

1. Execute `failure.command` via the harness's shell-execution tool.
   Prefer `mcp__plugin_context-mode_context-mode__ctx_execute` with
   `language: "shell"` when context-mode is available so the raw log
   does not flood the conversation. Otherwise use `Bash`.

2. Capture stdout+stderr to `.debug-artifacts/run-<NNN>.log` where
   `NNN` zero-pads the next sequence number (scan existing files
   under `.debug-artifacts/`). Record:
   ```
   state.failure.lastExitCode   = exitCode;
   state.failure.lastRunAt      = new Date().toISOString();
   state.failure.rawOutputRef   = ".debug-artifacts/run-<NNN>.log";
   ```

3. **If `exitCode === 0`** the failure did not reproduce. Abort with:
   ```
   Failure did not reproduce — Phase 1 cannot proceed without a
   deterministic failure. Did the environment change?
   ```
   Do NOT advance. The user must investigate environment drift first.

4. Hand the captured log to `lib/error-parser.mjs#parseError(rawText)`.
   The parser returns `{kind, frames[], rootException?}` or
   `{kind: "unknown", raw}`.

5. Write structured result:
   ```
   state.failure.errorParsed = parsed;
   ```
   The full log stays on disk at `rawOutputRef`. The structured
   `errorParsed` lives in state. Do NOT paste the raw log into the
   conversation — Phase 4 reads it lazily from disk if needed.

6. Push checkpoint:
   ```
   pushCheckpoint(state, {
     phase: 1,
     actionsTaken: ["ran failing command", "parsed error", "captured raw log"],
   });
   saveState(path, state);
   ```

## Output to user

Print a single 5-line summary:
```
Reproduced: <command>  exit=<code>
Error kind: <kind>
Top frame:  <file>:<line>  <function|test>
Root cause: <rootException.type>: <rootException.value>   # if any
Raw log:    <rawOutputRef>
```
