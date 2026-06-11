const MAX_ITEM_LENGTH = 300;
const TRUNCATION_MARKER = "... [truncated]";

export function sanitizeLine(value) {
  const line = String(value ?? "")
    .replace(/```/g, "'''")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (line.length <= MAX_ITEM_LENGTH) return line;
  return `${line.slice(0, MAX_ITEM_LENGTH - TRUNCATION_MARKER.length).trimEnd()}${TRUNCATION_MARKER}`;
}

function list(items) {
  const values = Array.isArray(items) && items.length > 0 ? items : ["None"];
  return values.map((item) => `- ${sanitizeLine(item) || "None"}`).join("\n");
}

function metadataJson(metadata) {
  return JSON.stringify(metadata, null, 2)
    .replace(/--/g, "\\u002d\\u002d")
    .replace(/```/g, "'''");
}

export function renderMetadataComment(marker, metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  return `<!-- ${sanitizeLine(marker) || "metadata"}\n${metadataJson(metadata)}\n-->`;
}

function nextActionLine(action) {
  if (typeof action === "string") return action;
  const label = sanitizeLine(action?.label || action?.id || "Next action");
  const command = action?.command ? ` — ${sanitizeLine(action.command)}` : "";
  const reason = action?.reason ? ` (${sanitizeLine(action.reason)})` : "";
  const recommended = action?.recommended ? "Recommended: " : "";
  return `${recommended}${label}${command}${reason}`;
}

function dataEvidenceLine(entry) {
  const adapter = sanitizeLine(entry?.adapter || "data evidence");
  const status = sanitizeLine(entry?.status || "unknown");
  const summary = sanitizeLine(entry?.summary || "");
  const artifacts = Array.isArray(entry?.artifacts) && entry.artifacts.length > 0
    ? ` artifacts=${entry.artifacts.map(sanitizeLine).join(", ")}`
    : "";
  const run = entry?.runId ? ` run=${sanitizeLine(entry.runId)}` : "";
  return `${adapter} ${status}${summary ? `: ${summary}` : ""}${artifacts}${run}`;
}

function costTelemetrySummary(value) {
  if (!value || typeof value !== "object") return null;
  return value.summary && typeof value.summary === "object" ? value.summary : value;
}

function objectEntriesLine(value = {}) {
  const entries = Object.entries(value).filter(([, amount]) => Number(amount) > 0);
  if (entries.length === 0) return "none";
  return entries.map(([key, amount]) => `${key}=$${Number(amount).toFixed(4)}`).join("; ");
}

function costTelemetryLines(value) {
  const summary = costTelemetrySummary(value);
  if (!summary) return [];
  const budget = summary.budget ?? {};
  const lines = [
    `totalUSD: $${Number(summary.totalUSD ?? 0).toFixed(4)}`,
    `calls: ${summary.calls ?? 0}`,
    `tokens: input=${summary.inputTokens ?? 0}, cachedInput=${summary.cachedInputTokens ?? 0}, output=${summary.outputTokens ?? 0}, total=${summary.totalTokens ?? 0}`,
    `budget: ${budget.status ?? "unknown"} (${summary.totalUSD ?? 0} / ${budget.maxCostUSD ?? "unbounded"})`,
    `sources: ${objectEntriesLine(summary.bySource)}`,
  ];
  if (Object.keys(summary.byPlatform ?? {}).length > 0) {
    lines.push(`platforms: ${objectEntriesLine(summary.byPlatform)}`);
  }
  if (Object.keys(summary.byModel ?? {}).length > 0) {
    lines.push(`models: ${objectEntriesLine(summary.byModel)}`);
  }
  return lines;
}

function loopStateLines(loopState) {
  if (!loopState || typeof loopState !== "object") return [];
  const maxIter = loopState.maxIterMode === "unlimited" || loopState.maxIter == null
    ? "unlimited"
    : loopState.maxIter;
  const lines = [
    `iter: ${loopState.iter ?? "unknown"} / maxIter: ${maxIter}`,
    `consecutivePass: ${loopState.consecutivePass ?? 0}`,
    `costUSD: ${loopState.costUSD ?? 0} / maxCostUSD: ${loopState.maxCostUSD ?? "unknown"}`,
    `lastBreakConditionExit: ${loopState.lastBreakConditionExit ?? "unknown"}`,
  ];
  if (loopState.maxRuntimeSec != null || loopState.elapsedRuntimeSec != null) {
    lines.push(`runtimeSec: ${loopState.elapsedRuntimeSec ?? "unknown"} / maxRuntimeSec: ${loopState.maxRuntimeSec ?? "unknown"}`);
  }
  if (loopState.lastFailureSignature) {
    lines.push(`lastFailureSignature: ${loopState.lastFailureSignature}`);
  }
  if (loopState.lastVerifierSummary) {
    lines.push(`lastVerifierSummary: ${loopState.lastVerifierSummary}`);
  }
  if (Array.isArray(loopState.lastTouchedFiles) && loopState.lastTouchedFiles.length > 0) {
    lines.push(`lastTouchedFiles: ${loopState.lastTouchedFiles.join(", ")}`);
  }
  if (loopState.nextAction) {
    lines.push(`nextAction: ${loopState.nextAction}`);
  }
  const failures = Object.entries(loopState.failureSignatures ?? {});
  if (failures.length > 0) {
    lines.push(`failureSignatures: ${failures.map(([key, count]) => `${key}=${count}`).join("; ")}`);
  }
  return lines;
}

export function renderHandoff({
  title = "Task",
  completed = [],
  remaining = [],
  blockers = [],
  validation = "Not run",
  gitState = "Unknown",
  nextAction = "Resume from the next incomplete phase",
  resumeFiles = [],
  nextActions = [],
  loopState = null,
  costTelemetry = null,
  dataEvidence = [],
  metadata = null,
} = {}) {
  const lines = [
    `# Handoff: ${sanitizeLine(title) || "Task"}`,
  ];
  const metadataComment = renderMetadataComment("agent-handoff-metadata", metadata);
  if (metadataComment) lines.push(metadataComment);
  lines.push(
    "",
    "## Completed",
    list(completed),
    "",
    "## Remaining",
    list(remaining),
    "",
    "## Blockers",
    list(blockers),
    "",
    "## Latest Validation Evidence",
    list([validation]),
    "",
    "## Current Git State",
    list([gitState]),
    "",
  );
  if (resumeFiles.length > 0) {
    lines.push(
      "## Resume Files",
      list(resumeFiles),
      "",
    );
  }
  if (nextActions.length > 0) {
    lines.push(
      "## Next Action Candidates",
      list(nextActions.map(nextActionLine)),
      "",
    );
  }
  if (loopState) {
    lines.push(
      "## Loop State",
      list(loopStateLines(loopState)),
      "",
    );
  }
  const resolvedCostTelemetry = costTelemetry ?? loopState?.costTelemetry;
  if (resolvedCostTelemetry) {
    lines.push(
      "## Cost Telemetry",
      list(costTelemetryLines(resolvedCostTelemetry)),
      "",
    );
  }
  if (dataEvidence.length > 0) {
    lines.push(
      "## Data Artifacts / Evidence",
      list(dataEvidence.map(dataEvidenceLine)),
      "",
    );
  }
  lines.push(
    "## Next Action",
    list([nextAction]),
    "",
  );
  return lines.join("\n");
}
