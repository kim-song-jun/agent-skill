import { test } from "node:test";
import assert from "node:assert/strict";

import { summarise, heuristicSummariseFn } from "../../plugins/harness-thrift/skills/thrift/lib/summariser.mjs";

test("summariser: requires array of turns", async () => {
  await assert.rejects(
    () => summarise({ turns: null, summariseFn: async () => "x" }),
    /turns must be array/,
  );
});

test("summariser: requires summariseFn", async () => {
  await assert.rejects(
    () => summarise({ turns: [{ role: "user", content: "x" }] }),
    /summariseFn required/,
  );
});

test("summariser: nothing to compress when turns <= preserveLastTurns", async () => {
  const turns = Array.from({ length: 5 }, (_, i) => ({ role: "user", content: `turn ${i}` }));
  const r = await summarise({ turns, preserveLastTurns: 6, summariseFn: async () => "should-not-be-called" });
  assert.equal(r.droppedTurnCount, 0);
  assert.equal(r.summaryText, "");
});

test("summariser: compresses head, preserves tail", async () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `turn ${i}` }));
  const r = await summarise({
    turns,
    preserveLastTurns: 6,
    preserveSpecPaths: false,
    summariseFn: async (head) => `compressed ${head.length} turns`,
  });
  assert.equal(r.droppedTurnCount, 14);
  assert.match(r.summaryText, /compressed 14 turns/);
  assert.match(r.summaryText, /14 turns from the start/);
});

test("summariser: extracts and pins spec paths when preserveSpecPaths=true", async () => {
  const turns = [
    { role: "user", content: "see docs/superpowers/specs/2026-05-18-harness-thrift-design.md for the design" },
    { role: "assistant", content: "ok, also referencing docs/superpowers/plans/2026-05-18-thrift-core-plan.md" },
    { role: "user", content: "and docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md" },
    ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `noise ${i}` })),
  ];
  const r = await summarise({
    turns,
    preserveLastTurns: 6,
    preserveSpecPaths: true,
    summariseFn: async () => "summary",
  });
  assert.equal(r.preservedRefs.length, 3);
  assert.ok(r.preservedRefs.includes("docs/superpowers/specs/2026-05-18-harness-thrift-design.md"));
  assert.ok(r.preservedRefs.includes("docs/superpowers/plans/2026-05-18-thrift-core-plan.md"));
  assert.ok(r.preservedRefs.includes("docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md"));
  assert.match(r.summaryText, /Spec \/ plan references/);
});

test("summariser: reports tokens before + estimated after", async () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: "x".repeat(300),
  }));
  const r = await summarise({
    turns,
    preserveLastTurns: 6,
    summariseFn: async () => "tiny summary",
  });
  // Head is 24 turns × 300 bytes / 3 bytes/token = 2400 tokens
  assert.equal(r.tokensBefore, 2400);
  // Summary is much smaller
  assert.ok(r.tokensAfterEstimate < r.tokensBefore);
});

test("heuristicSummariseFn: extracts first sentence per turn", async () => {
  const fn = heuristicSummariseFn();
  const out = await fn([
    { role: "user", content: "First sentence. Second sentence." },
    { role: "assistant", content: "Reply with multiple. Sentences. Yes." },
    { role: "user", content: "Short" },
  ]);
  const lines = out.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /\(user\) First sentence\./);
  assert.match(lines[0], / …$/, "should mark truncation");
  assert.match(lines[1], /\(assistant\) Reply with multiple\./);
  assert.match(lines[2], /\(user\) Short$/, "no truncation marker when whole content fits");
});

test("summariser: integrates with heuristicSummariseFn end-to-end", async () => {
  const turns = Array.from({ length: 15 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `Turn ${i}. Some longer content here that should be trimmed.`,
  }));
  const r = await summarise({
    turns,
    preserveLastTurns: 6,
    summariseFn: heuristicSummariseFn(),
  });
  assert.equal(r.droppedTurnCount, 9);
  assert.match(r.summaryText, /Conversation summary/);
  assert.match(r.summaryText, /\(user\) Turn 0\./);
});
