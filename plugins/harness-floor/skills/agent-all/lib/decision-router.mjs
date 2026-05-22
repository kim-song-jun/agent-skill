import { readFileSync, writeFileSync } from "node:fs";
import { autoResolveAndLog } from "./decisions/non-tty-resolver.mjs";
import { renderToAskUserQuestion } from "./decisions/renderer.mjs";

export async function routeWaveDecisions({ payloads, statePath, isTTY, askUser }) {
  const answers = {};
  for (const p of payloads) {
    const taskId = p.scope.task_id;
    if (p.status === "NO_DECISIONS" || !p.decisions || p.decisions.length === 0) {
      answers[taskId] = {};
      continue;
    }
    if (!isTTY) {
      answers[taskId] = autoResolveAndLog(p, { statePath });
      continue;
    }
    answers[taskId] = {};
    for (const decision of p.decisions) {
      const args = renderToAskUserQuestion(decision, { taskTitle: p.scope.task_title });
      const chosenLabel = await askUser(args);
      const originalIdx = mapBackToOriginalIndex(decision, chosenLabel);
      answers[taskId][decision.id] = originalIdx;
      persistAnswer(statePath, taskId, decision.id, originalIdx, false);
    }
  }
  return { answers };
}

function mapBackToOriginalIndex(decision, chosen) {
  // chosen is the index user picked in the *reordered* (recommended-first) list.
  // The first slot was recommended_index; the rest were the others in original order.
  if (typeof chosen === "number") {
    if (chosen === 0) return decision.recommended_index;
    const others = decision.options.map((_, i) => i).filter((i) => i !== decision.recommended_index);
    return others[chosen - 1];
  }
  return decision.recommended_index;
}

function persistAnswer(statePath, taskId, decisionId, idx, autoResolved) {
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  state.decisions = state.decisions || {};
  state.decisions[taskId] = state.decisions[taskId] || {};
  state.decisions[taskId][decisionId] = {
    chosen_index: idx, auto_resolved: autoResolved, timestamp: new Date().toISOString(),
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
