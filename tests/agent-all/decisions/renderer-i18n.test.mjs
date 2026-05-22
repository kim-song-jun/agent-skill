import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToAskUserQuestion } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/renderer.mjs";

const fixture = {
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

test("language=en (default) uses English prefixes", () => {
  const args = renderToAskUserQuestion(fixture, { taskTitle: "Add OAuth" });
  assert.match(args.questions[0].question, /Context: /);
  assert.match(args.questions[0].question, /Reasoning for recommendation: /);
  assert.match(args.questions[0].options[0].label, /\(Recommended\) /);
});

test("language=ko swaps prefixes to Korean", () => {
  const args = renderToAskUserQuestion(fixture, { taskTitle: "OAuth 추가", language: "ko" });
  assert.match(args.questions[0].question, /맥락: /);
  assert.match(args.questions[0].question, /추천 사유: /);
  assert.match(args.questions[0].options[0].label, /\(추천\) /);
  assert.doesNotMatch(args.questions[0].question, /Context: /);
});

test("unknown language falls back to English", () => {
  const args = renderToAskUserQuestion(fixture, { taskTitle: "x", language: "klingon" });
  assert.match(args.questions[0].question, /Context: /);
  assert.match(args.questions[0].options[0].label, /\(Recommended\) /);
});
