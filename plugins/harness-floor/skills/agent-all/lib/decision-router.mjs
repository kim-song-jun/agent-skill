import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { autoResolveAndLog } from "./decisions/non-tty-resolver.mjs";
import { decisionToInteraction } from "./interactions/schema.mjs";
import { renderClaudeInteraction, selectedClaudeOptionId } from "./interactions/renderer-claude.mjs";
import { appendInteractionLog } from "./interactions/interaction-log-writer.mjs";

export async function routeWaveDecisions({
  payloads,
  statePath,
  isTTY,
  askUser,
  language = "en",
  cwd = dirname(statePath),
  runId = "default",
  config = {},
}) {
  const answers = {};
  for (const p of payloads) {
    const taskId = p.scope.task_id;
    if (p.status === "NO_DECISIONS" || !p.decisions || p.decisions.length === 0) {
      answers[taskId] = {};
      continue;
    }
    if (!isTTY) {
      answers[taskId] = autoResolveAndLog(p, { statePath, cwd, runId, config });
      continue;
    }
    answers[taskId] = {};
    for (const decision of p.decisions) {
      const interaction = decisionToInteraction(decision, {
        taskId,
        taskTitle: p.scope.task_title,
      });
      const args = renderClaudeInteraction(interaction, { language });
      const chosenLabel = await askUser(args);
      const selectedOptionId = selectedClaudeOptionId(args, chosenLabel);
      const selectedOption = interaction.options.find((option) => option.id === selectedOptionId);
      const originalIdx = Number.isInteger(selectedOption?.metadata?.originalIndex)
        ? selectedOption.metadata.originalIndex
        : mapBackToOriginalIndex(decision, chosenLabel);
      appendInteractionLog({
        cwd,
        runId,
        config,
        interaction,
        result: { action: "selected", selectedOptionId, reason: "user selected option" },
        source: "agent-all-decision",
      });
      answers[taskId][decision.id] = originalIdx;
      persistAnswer(statePath, taskId, decision.id, originalIdx, false, {
        interactionId: interaction.id,
        selectedOptionId,
      });
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

function persistAnswer(statePath, taskId, decisionId, idx, autoResolved, interactionResult = null) {
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  state.decisions = state.decisions || {};
  state.decisions[taskId] = state.decisions[taskId] || {};
  state.decisions[taskId][decisionId] = {
    chosen_index: idx, auto_resolved: autoResolved, timestamp: new Date().toISOString(),
  };
  if (interactionResult) {
    state.interactions = state.interactions || {};
    state.interactions[taskId] = state.interactions[taskId] || {};
    state.interactions[taskId][decisionId] = {
      ...interactionResult,
      action: "selected",
      auto_resolved: autoResolved,
      timestamp: new Date().toISOString(),
    };
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
