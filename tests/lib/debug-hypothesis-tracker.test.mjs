import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addHypothesis,
  decide,
  rejectHypothesis,
  selectCandidate,
  nextUntested,
  summary,
  promote,
  demote,
  exportToDebugLog,
  findHypothesis,
  VALID_STATUSES,
} from "../../plugins/harness-debug/skills/debug/lib/hypothesis-tracker.mjs";
import { skeleton } from "../../plugins/harness-debug/skills/debug/lib/state-checkpoint.mjs";

function fresh() {
  return skeleton({ command: "x" });
}

// ---------- add / find ----------

test("hypothesis-tracker: addHypothesis assigns sequential ids", () => {
  const s = fresh();
  assert.equal(addHypothesis(s, "race condition"), 1);
  assert.equal(addHypothesis(s, "cache miss"), 2);
  assert.equal(addHypothesis(s, "off-by-one"), 3);
  assert.equal(s.hypotheses.length, 3);
  assert.equal(s.hypotheses[0].status, "untested");
});

test("hypothesis-tracker: addHypothesis rejects empty/whitespace text", () => {
  const s = fresh();
  assert.throws(() => addHypothesis(s, ""), /non-empty/);
  assert.throws(() => addHypothesis(s, "   "), /non-empty/);
});

test("hypothesis-tracker: findHypothesis returns null for unknown id", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  assert.equal(findHypothesis(s, 99), null);
  assert.equal(findHypothesis(s, 1).text, "h1");
});

// ---------- decide / status transitions ----------

test("hypothesis-tracker: decide(verified) sets currentCandidate", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  addHypothesis(s, "h2");
  decide(s, 2, { status: "verified", experiment: "ran X", result: "matched prediction" });
  assert.equal(s.currentCandidate, 2);
  assert.equal(s.hypotheses[1].status, "verified");
  assert.equal(s.hypotheses[1].experiment, "ran X");
});

test("hypothesis-tracker: decide(rejected) on current candidate auto-promotes next untested", () => {
  const s = fresh();
  const id1 = addHypothesis(s, "h1");
  addHypothesis(s, "h2");
  addHypothesis(s, "h3");
  selectCandidate(s, id1);
  assert.equal(s.currentCandidate, 1);
  rejectHypothesis(s, id1, { experiment: "tried", result: "no match" });
  assert.equal(s.currentCandidate, 2, "next untested should auto-promote");
});

test("hypothesis-tracker: decide rejects invalid status", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  assert.throws(() => decide(s, 1, { status: "maybe" }), /status must be one of/);
});

test("hypothesis-tracker: decide on unknown id throws", () => {
  const s = fresh();
  assert.throws(() => decide(s, 99, { status: "verified" }), /not found/);
});

// ---------- selection / next ----------

test("hypothesis-tracker: nextUntested returns first untested in order", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  addHypothesis(s, "h2");
  addHypothesis(s, "h3");
  rejectHypothesis(s, 1, {});
  const n = nextUntested(s);
  assert.equal(n.id, 2);
});

test("hypothesis-tracker: nextUntested returns null when none untested", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  rejectHypothesis(s, 1, {});
  assert.equal(nextUntested(s), null);
});

// ---------- summary ----------

test("hypothesis-tracker: summary tallies all statuses", () => {
  const s = fresh();
  addHypothesis(s, "h1"); // pending
  addHypothesis(s, "h2"); // → rejected
  addHypothesis(s, "h3"); // → verified
  addHypothesis(s, "h4"); // → partial
  rejectHypothesis(s, 2, {});
  decide(s, 3, { status: "verified" });
  decide(s, 4, { status: "partial" });
  const sum = summary(s);
  assert.equal(sum.total, 4);
  assert.equal(sum.pending, 1);
  assert.equal(sum.tested, 3);
  assert.equal(sum.rejected, 1);
  assert.equal(sum.verified, 1);
  assert.equal(sum.partial, 1);
});

// ---------- promote / demote ----------

test("hypothesis-tracker: promote moves a hypothesis to the front", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  addHypothesis(s, "h2");
  addHypothesis(s, "h3");
  assert.equal(promote(s, 3), true);
  assert.equal(s.hypotheses[0].id, 3);
});

test("hypothesis-tracker: demote moves a hypothesis toward the end", () => {
  const s = fresh();
  addHypothesis(s, "h1");
  addHypothesis(s, "h2");
  addHypothesis(s, "h3");
  assert.equal(demote(s, 1), true);
  assert.equal(s.hypotheses[s.hypotheses.length - 1].id, 1);
});

// ---------- export ----------

test("hypothesis-tracker: exportToDebugLog produces a markdown bullet list with status glyphs", () => {
  const s = fresh();
  addHypothesis(s, "race condition");
  addHypothesis(s, "cache miss");
  decide(s, 1, { status: "verified", experiment: "ran X", result: "matched" });
  rejectHypothesis(s, 2, { experiment: "ran Y", result: "no match" });
  const md = exportToDebugLog(s);
  assert.match(md, /\[✓ verified\] H1\./);
  assert.match(md, /race condition/);
  assert.match(md, /experiment: ran X/);
  assert.match(md, /\[✗ rejected\] H2\./);
  assert.match(md, /cache miss/);
});

test("hypothesis-tracker: exportToDebugLog handles empty state", () => {
  const md = exportToDebugLog(fresh());
  assert.equal(md, "_No hypotheses recorded._");
});

test("hypothesis-tracker: VALID_STATUSES is the contract surface", () => {
  assert.deepEqual([...VALID_STATUSES].sort(),
    ["partial", "rejected", "untested", "verified"]);
});
