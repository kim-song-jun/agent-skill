import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { appendDecisionMarkdownLog } from "./markdown-log-writer.mjs";
import { decisionToInteraction } from "../interactions/schema.mjs";
import { resolveNonTtyInteraction } from "../interactions/non-tty-resolver.mjs";
import { appendInteractionLog } from "../interactions/interaction-log-writer.mjs";

export function autoResolveAndLog(payload, {
  statePath,
  now = () => new Date().toISOString(),
  cwd = dirname(statePath),
  runId = "default",
  config = {},
} = {}) {
  if (payload.status !== "NEEDS_DECISIONS") return {};
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  state.decisions = state.decisions || {};
  state.interactions = state.interactions || {};
  const taskId = payload.scope.task_id;
  state.decisions[taskId] = state.decisions[taskId] || {};
  state.interactions[taskId] = state.interactions[taskId] || {};
  const resolved = {};
  const ts = now();
  for (const d of payload.decisions) {
    const interaction = decisionToInteraction(d, {
      taskId,
      taskTitle: payload.scope.task_title,
    });
    const result = resolveNonTtyInteraction(interaction, { now: new Date(ts) });
    appendInteractionLog({ cwd, runId, config, interaction, result, source: "agent-all-decision", now: new Date(ts) });
    const selected = interaction.options.find((option) => option.id === result.selectedOptionId);
    const chosenIndex = selected?.metadata?.originalIndex;
    appendDecisionMarkdownLog({
      cwd,
      iter: Number.isInteger(state.iter) ? state.iter : 0,
      runId,
      config,
      timestamp: ts,
      taskId,
      taskTitle: payload.scope.task_title,
      decision: d,
      interaction,
      result,
      chosenIndex,
    });
    state.interactions[taskId][d.id] = {
      interactionId: interaction.id,
      action: result.action,
      selectedOptionId: result.selectedOptionId,
      auto_resolved: result.action === "selected",
      reason: result.reason,
      timestamp: ts,
    };
    if (result.action !== "selected" || !Number.isInteger(chosenIndex)) {
      state.decisions[taskId][d.id] = {
        chosen_index: null,
        auto_resolved: false,
        blocked: result.action === "blocked" || result.action === "fail",
        reasoning: result.reason,
        timestamp: ts,
      };
      continue;
    }
    state.decisions[taskId][d.id] = {
      chosen_index: chosenIndex,
      auto_resolved: true,
      reasoning: d.reasoning,
      timestamp: ts,
    };
    resolved[d.id] = chosenIndex;
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return resolved;
}
