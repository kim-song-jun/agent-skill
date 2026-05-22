import { readFileSync, writeFileSync } from "node:fs";

export function autoResolveAndLog(payload, { statePath, now = () => new Date().toISOString() }) {
  if (payload.status !== "NEEDS_DECISIONS") return {};
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  state.decisions = state.decisions || {};
  const taskId = payload.scope.task_id;
  state.decisions[taskId] = state.decisions[taskId] || {};
  const resolved = {};
  const ts = now();
  for (const d of payload.decisions) {
    state.decisions[taskId][d.id] = {
      chosen_index: d.recommended_index,
      auto_resolved: true,
      reasoning: d.reasoning,
      timestamp: ts,
    };
    resolved[d.id] = d.recommended_index;
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return resolved;
}
