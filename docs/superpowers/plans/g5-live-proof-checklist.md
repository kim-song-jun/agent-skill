# G5 Live-Proof Checklist — Operator Runbook

**Purpose:** Step-by-step instructions for a human operator to perform the live
`/agent-all` proof that G1 (adversarial-verifier) and G4 (checkpoint) are wired
correctly end-to-end. This is NOT a CI job — it requires a live Claude Code session.

**Preconditions (verify before starting):**
- G1 committed: `plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs`
- G4 committed: `flushCheckpoint` + `recallLatestCheckpoint` in `plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs`
- G5 isolation tests GREEN: `node --test tests/agent-all/lib/adversarial-verifier-isolation.test.mjs` → 3 pass / 0 fail
- `/agent-init` has been run for the target project (`.claude/agents/` populated, hooks installed)
- `gates.adversarialVerify: true` in the run config (or the `/agent-all` call explicitly enables it), so the adversarial dispatch fires during the verification phase

---

## Step G5-A — Create a throwaway task doc

Write the task doc to a temp file (do NOT commit it; it is throwaway):

```bash
cat > /tmp/g5-throwaway-task.md << 'EOF'
# G5 Proof Task

## Task 1: Add a trivially correct utility function

**Files:**
- Create: `src/g5-proof-util.mjs`
- Create: `tests/lib/g5-proof-util.test.mjs`

**Work:**
Add `export function echo(s) { return s; }` to `src/g5-proof-util.mjs`.
Add a test at `tests/lib/g5-proof-util.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { echo } from "../../src/g5-proof-util.mjs";
test("echo returns its argument", () => { assert.equal(echo("hello"), "hello"); });
```
EOF
```

---

## Step G5-B — Run `/agent-all` (no PR, no brainstorm)

In a Claude Code session pointed at this repo:

```
/agent-all /tmp/g5-throwaway-task.md --no-pr --no-brainstorm --yes
```

Wait for the run to complete. Note the `RUNID` (the directory name under `.agent-skill/runs/`):

```bash
RUNID=$(ls -t .agent-skill/runs/ | head -1)
echo "RUNID=$RUNID"
```

---

## Step G5-C — Capture and assert evidence

### Evidence 1 — Adversarial entry in `verification-evidence.jsonl`

The adversarial verifier writes to `verification-evidence.jsonl` via `ctx.writeEvidence`. Verify
an entry with `schemaVersion === "verification-evidence/v1"` and `status ∈ {passed, failed}` exists:

```bash
python3 - "$RUNID" << 'PY'
import sys, json
runid = sys.argv[1]
path = f".agent-skill/runs/{runid}/verification-evidence.jsonl"
lines = [json.loads(l) for l in open(path) if l.strip()]
adv = [l for l in lines if l.get("status") in ("passed", "failed")]
assert adv, f"no adversarial-verifier evidence; entries={lines}"
assert adv[0]["schemaVersion"] == "verification-evidence/v1", adv[0]
print("EVIDENCE-1 OK:", adv[0]["schemaVersion"], adv[0]["status"])
PY
```

Expected output: `EVIDENCE-1 OK: verification-evidence/v1 passed` (or `failed` if blocked).

### Evidence 2 — Checkpoint entry in `memory-log.jsonl`

The G4 `flushCheckpoint` writes to `memory-log.jsonl` at the wave/phase boundary:

```bash
python3 - "$RUNID" << 'PY'
import sys, json
runid = sys.argv[1]
path = f".agent-skill/runs/{runid}/memory-log.jsonl"
lines = [json.loads(l) for l in open(path) if l.strip()]
ck = [l for l in lines if l.get("event") == "checkpoint"]
assert ck, f"no checkpoint entry; lines={lines}"
assert ck[0]["schemaVersion"] == "memory-log/v1", ck[0]
assert isinstance(ck[0].get("taskIds", ck[0].get("miniPlans")), list), ck[0]
print("EVIDENCE-2 OK: checkpoint wave", ck[0]["wave"], "iter", ck[0]["iter"],
      "inFlight", ck[0]["inFlight"])
PY
```

Expected: `EVIDENCE-2 OK: checkpoint wave 0 iter 1 inFlight True` (coordinates vary).

### Evidence 3 — A failing diff is BLOCKED (adversarial gate fires)

Craft a task that deletes a test file (the break-condition command will exit 1):

```bash
cat > /tmp/g5-bad-task.md << 'EOF'
# G5 Bad Task (gate test)

## Task 1: Delete the echo utility test

**Files:**
- Delete: `tests/lib/g5-proof-util.test.mjs`

**Work:**
Remove the file `tests/lib/g5-proof-util.test.mjs`.
EOF
```

Run it:
```
/agent-all /tmp/g5-bad-task.md --no-pr --no-brainstorm --yes
```

Check that the run was BLOCKED (exit non-zero) and inspect the evidence:

```bash
BADRUNID=$(ls -t .agent-skill/runs/ | head -1)
python3 - "$BADRUNID" << 'PY'
import sys, json
runid = sys.argv[1]
path = f".agent-skill/runs/{runid}/verification-evidence.jsonl"
lines = [json.loads(l) for l in open(path) if l.strip()]
blocked = [l for l in lines if l.get("status") == "failed"]
assert blocked, f"expected a failed adversarial entry but got: {lines}"
print("EVIDENCE-3 OK: failing diff was BLOCKED, status=", blocked[0]["status"])
PY
```

Also confirm the target test file was NOT deleted (the gate must have prevented it):

```bash
test -f tests/lib/g5-proof-util.test.mjs && echo "EVIDENCE-3b OK: file NOT deleted" || echo "FAIL: file was deleted"
```

### Evidence 4 — Resume recovers from checkpoint/LATEST

After the good run (EVIDENCE-2), simulate a dead-session resume:

```bash
node -e "
import('./plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs').then(async ({ recallLatestCheckpoint }) => {
  const { makeFileMirror } = await import('./plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs');
  const fileMirror = makeFileMirror({ rootDir: process.cwd() + '/.agent-skill/memory' });
  const r = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
  if (!r.found || r.source !== 'file') {
    console.error('EVIDENCE-4 FAIL:', JSON.stringify(r));
    process.exit(1);
  }
  console.log('EVIDENCE-4 OK: recovered from file, source=' + r.source + ', wave=' + r.checkpoint?.wave + ', iter=' + r.checkpoint?.iter);
});
" --input-type=module
```

If your Node version requires a `.mjs` extension for top-level `await`, write this as a temp file:

```bash
node --input-type=module << 'MJS'
import { recallLatestCheckpoint } from './plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs';
import { makeFileMirror } from './plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs';
const fileMirror = makeFileMirror({ rootDir: process.cwd() + '/.agent-skill/memory' });
const r = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
if (!r.found || r.source !== 'file') {
  console.error('EVIDENCE-4 FAIL:', JSON.stringify(r));
  process.exit(1);
}
console.log('EVIDENCE-4 OK: recovered from file, source=' + r.source + ', wave=' + r.checkpoint?.wave + ', iter=' + r.checkpoint?.iter);
MJS
```

Expected: `EVIDENCE-4 OK: recovered from file, source=file, wave=0, iter=1` (coordinates vary).

---

## Artifact-shape reference (current G4 schema)

| Artifact | Path | Key fields |
|---|---|---|
| Adversarial evidence | `.agent-skill/runs/<runId>/verification-evidence.jsonl` | `schemaVersion: "verification-evidence/v1"`, `status: "passed"\|"failed"\|"blocked"` |
| Checkpoint JSONL (audit) | `.agent-skill/runs/<runId>/memory-log.jsonl` | `schemaVersion: "memory-log/v1"`, `event: "checkpoint"`, `wave`, `iter`, `inFlight`, `taskIds: []`, `miniPlans: []` |
| Checkpoint file mirror | `.agent-skill/memory/checkpoint_LATEST.json` | `pointerTo: "checkpoint/wave-<w>-iter-<i>"`, `wave`, `iter`, `inFlight`, `flushedAt` |
| History key file | `.agent-skill/memory/checkpoint_wave-<w>-iter-<i>.json` | full payload with `taskIds`, `miniPlans`, `requiredAgents`, `decisionsSoFar` |

**Note:** The `makeFileMirror` key sanitizer maps `/` to `_`, so `checkpoint/LATEST`
becomes `checkpoint_LATEST.json` on disk.

---

## Pass criteria

All four evidence checks must print `OK`. If any check fails:
- EVIDENCE-1 missing → adversarial verifier not firing (check `gates.adversarialVerify` config)
- EVIDENCE-2 missing → G4 `flushCheckpoint` not called (check orchestrator phase-boundary logic)
- EVIDENCE-3 not blocked → adversarial gate not wired to the abort path (regression in G1/orchestrator)
- EVIDENCE-4 fails → `checkpoint/LATEST` was not written or `recallLatestCheckpoint` is broken (G4 regression)
