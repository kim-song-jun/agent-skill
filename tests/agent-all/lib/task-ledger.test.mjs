import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTaskDoc } from "../../../plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs";

const VALID = `# Task
## Goal
Ship it.
## Acceptance
- [x] in scope done
## Phases
- [x] build
## Decision Matrix
| Decision | Choice |
|---|---|
| A | B |
## Ambiguity Log
None.
## Progress Snapshot
Current phase: gate.
## Verification
- [x] node --test
## Follow-up
- [ ] outside hard gate
`;

test("valid task doc passes required section and checkbox gates", () => {
  assert.deepEqual(validateTaskDoc(VALID), { ok: true, errors: [] });
});

test("missing required section fails", () => {
  const result = validateTaskDoc(VALID.replace("## Verification", "## Proof"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing section: Verification/);
});

test("unchecked in-scope checkbox fails while Follow-up is ignored", () => {
  const result = validateTaskDoc(VALID.replace("- [x] build", "- [ ] build"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unchecked item/);
});
