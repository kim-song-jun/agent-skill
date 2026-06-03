import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Regression: the shell tokenizer in the policy hooks must treat a
// backslash-newline as a LINE CONTINUATION (join the lines), not as a literal
// newline token. A literal "\n" token is classified as a command boundary, so
// a multi-line `git commit ... -- <pathspec>` was split into segments and the
// first segment (without the pathspec) was wrongly blocked with
// "git commit requires explicit pathspec after --".

const HOOKS = [
  "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
  "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
];

function runStatus(hook, command) {
  const r = spawnSync(process.execPath, [resolve(hook)], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf-8",
  });
  return r.status;
}

for (const hook of HOOKS) {
  test(`${hook}: backslash-newline is a line continuation, not a command boundary`, () => {
    // Baseline: single-line commit with `-- <pathspec>` is allowed.
    assert.equal(
      runStatus(hook, 'git commit -m "msg" -- src/file.txt'),
      0,
      "single-line `-- pathspec` commit must be allowed",
    );

    // Regression B: continuation AFTER `--` must stay allowed.
    assert.equal(
      runStatus(hook, 'git commit -m "msg" -- \\\n  src/file.txt'),
      0,
      "continuation after `--` must not sever the pathspec",
    );

    // Regression C: continuation BEFORE `--` must stay allowed.
    assert.equal(
      runStatus(hook, 'git commit -m "msg" \\\n  -- src/file.txt'),
      0,
      "continuation before `--` must not sever the command",
    );

    // CRLF continuation must also be handled.
    assert.equal(
      runStatus(hook, 'git commit -m "msg" -- \\\r\n  src/file.txt'),
      0,
      "CRLF backslash continuation must be joined",
    );

    // Control: a commit genuinely missing its pathspec is still blocked.
    assert.equal(
      runStatus(hook, 'git commit -m "msg"'),
      2,
      "commit without `-- pathspec` must still be blocked",
    );

    // Control: a real `;` boundary still segments (the first commit segment,
    // lacking a pathspec, is still caught — proving boundaries are intact).
    assert.equal(
      runStatus(hook, 'git commit -m "msg"; echo done'),
      2,
      "real `;` boundary must still split commands",
    );
  });
}
