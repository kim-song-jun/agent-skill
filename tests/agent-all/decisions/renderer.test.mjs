import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToAskUserQuestion } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/renderer.mjs";

test("renders single decision to AskUserQuestion arg shape", () => {
  const decision = {
    id: "d1",
    title: "Token storage",
    context: "Existing uses cookies",
    options: [
      { label: "Cookie", description: "secure httpOnly" },
      { label: "localStorage", description: "matches JWT" },
    ],
    recommended_index: 0,
    reasoning: "Aligns with existing pattern",
  };
  const args = renderToAskUserQuestion(decision, { taskTitle: "Add OAuth" });
  assert.equal(args.questions.length, 1);
  const q = args.questions[0];
  assert.match(q.question, /Token storage/);
  assert.match(q.question, /Add OAuth/);
  // AskUserQuestion enforces a 12-char header limit; "Token storage" (13) → "Token storag" (12)
  assert.equal(q.header, "Token storag");
  assert.equal(q.multiSelect, false);
  assert.equal(q.options.length, 2);
  // Recommended option must be first per AskUserQuestion convention
  assert.match(q.options[0].label, /Recommended/);
  assert.match(q.options[0].label, /Cookie/);
});

test("preserves option order when recommended_index is not 0", () => {
  const decision = {
    id: "d1", title: "X", context: "X",
    options: [
      { label: "A", description: "x" },
      { label: "B", description: "y" },
      { label: "C", description: "z" },
    ],
    recommended_index: 2, reasoning: "x",
  };
  const args = renderToAskUserQuestion(decision, { taskTitle: "T" });
  assert.match(args.questions[0].options[0].label, /Recommended.*C/);
  assert.equal(args.questions[0].options[1].label, "A");
  assert.equal(args.questions[0].options[2].label, "B");
});

test("includes reasoning in question text", () => {
  const decision = {
    id: "d1", title: "X", context: "ctx-text",
    options: [{ label: "A", description: "x" }, { label: "B", description: "y" }],
    recommended_index: 0, reasoning: "reason-text",
  };
  const args = renderToAskUserQuestion(decision, { taskTitle: "T" });
  assert.match(args.questions[0].question, /reason-text/);
  assert.match(args.questions[0].question, /ctx-text/);
});
