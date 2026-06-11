import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths } from "../artifact-paths.mjs";
import { sanitizeRunId } from "../policy/audit-log-writer.mjs";

export function decisionMarkdownLogPath({
  cwd = process.cwd(),
  iter = 0,
  runId = null,
  config = {},
} = {}) {
  const safeRunId = runId == null ? `iter-${iter}` : sanitizeRunId(runId);
  return join(cwd, artifactPaths(config).runsDir, safeRunId, "decisions.md");
}

export function appendDecisionMarkdownLog({
  cwd = process.cwd(),
  iter = 0,
  runId = null,
  config = {},
  timestamp = new Date().toISOString(),
  taskId,
  taskTitle,
  decision,
  interaction,
  result,
  chosenIndex = null,
} = {}) {
  const path = decisionMarkdownLogPath({ cwd, iter, runId, config });
  mkdirSync(dirname(path), { recursive: true });
  const lines = [];
  if (!existsSync(path)) {
    lines.push(`# Auto-resolved decisions - iter ${iter} - ${timestamp}`);
    lines.push("");
  }

  const selected = Number.isInteger(chosenIndex)
    ? decision?.options?.[chosenIndex]
    : interaction?.options?.find((option) => option.id === result?.selectedOptionId);
  const recommended = selected && decision?.recommended_index === chosenIndex;

  lines.push(`## Task ${taskId} - ${taskTitle ?? taskId}`);
  lines.push("");
  lines.push(`### ${decision?.title ?? interaction?.title ?? "Decision"}`);
  if (result?.action === "selected") {
    lines.push(`- Chosen: **${selected?.label ?? result.selectedOptionId}**${recommended ? " (recommended)" : ""}`);
    if (selected?.description) lines.push(`- Description: ${selected.description}`);
  } else {
    lines.push(`- ${labelForAction(result?.action)}: ${result?.reason ?? "requires user input"}`);
  }
  if (decision?.reasoning) lines.push(`- Reasoning: ${decision.reasoning}`);
  if (selected?.risk) lines.push(`- Risk: ${selected.risk}`);
  lines.push("");

  appendFileSync(path, `${lines.join("\n")}\n`, "utf-8");
  return path;
}

function labelForAction(action) {
  if (action === "blocked") return "Blocked";
  if (action === "pause") return "Paused";
  if (action === "fail") return "Failed";
  if (action === "continue_with_warning") return "Warning";
  return "Result";
}
