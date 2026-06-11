import { renderMetadataComment, sanitizeLine } from "./handoff-writer.mjs";

export const DANGEROUS_COMMAND_APPROVALS = [
  { pattern: "git reset", reason: "can discard committed or staged work" },
  { pattern: "reseed", reason: "can rewrite local data" },
  { pattern: "--apply", reason: "can turn a preview into mutation" },
  { pattern: "docker volume rm", reason: "can delete persistent local data" },
];

function list(items, fallback = "None") {
  const values = Array.isArray(items) && items.length > 0 ? items : [fallback];
  return values.map((item) => `- ${sanitizeLine(item) || fallback}`).join("\n");
}

function actionLine(action) {
  if (typeof action === "string") return action;
  const prefix = action?.recommended ? "Recommended: " : "";
  const command = action?.command ? ` — ${action.command}` : "";
  const reason = action?.reason ? ` (${action.reason})` : "";
  return `${prefix}${action?.label || action?.id || "Next action"}${command}${reason}`;
}

function approvalLine(item) {
  return `User approval required / 사용자 승인 필요: ${item.pattern} — ${item.reason}`;
}

export function renderSessionPrompt({
  title = "Task",
  taskPath = "",
  goal = "",
  ssot = [],
  currentStatus = "",
  completed = [],
  remaining = [],
  blockers = [],
  validation = "Not run",
  gitState = "Unknown",
  nextActions = [],
  selectedNextAction = null,
  editableFiles = ["Files named by the task doc, plan, and current git diff"],
  forbiddenFiles = ["Unrelated files outside the task scope"],
  firstAction = "Inspect the task doc, handoff, session metadata, and git status before editing.",
  metadata = null,
} = {}) {
  const selected = selectedNextAction
    ? `${selectedNextAction.label || selectedNextAction.id}: ${selectedNextAction.command || selectedNextAction.reason || ""}`
    : "Ask the user which next action to take unless running non-interactively.";

  const metadataComment = renderMetadataComment("agent-session-metadata", metadata);
  return [
    `# Session Prompt: ${sanitizeLine(title) || "Task"}`,
    metadataComment,
    "",
    "You are resuming an agent-skill task. Treat the files listed here as the source of truth and verify current state before making edits.",
    "",
    "## Goal",
    sanitizeLine(goal || title),
    "",
    "## Source Of Truth",
    list([taskPath, ...ssot].filter(Boolean)),
    "",
    "## Current State",
    list([
      currentStatus || "No progress snapshot recorded.",
      `Git: ${gitState}`,
    ]),
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
    "## Next Action Candidates",
    list(nextActions.map(actionLine), "No next action candidates generated."),
    "",
    "## Non-TTY Selection",
    sanitizeLine(selected),
    "",
    "## Preflight Gates",
    list([
      "Read the task doc and sibling handoff/session files before editing.",
      "Run `git status --short` and preserve unrelated user changes.",
      "If resuming `/agent-all`, prefer `/agent-all <task> --resume` after checking generated metadata.",
    ]),
    "",
    "## Operating Constraints",
    list([
      "Do not run destructive commands during handoff collection.",
      ...DANGEROUS_COMMAND_APPROVALS.map(approvalLine),
      "Use pathspecs for any future commit commands.",
    ]),
    "",
    "## Editable Scope",
    list(editableFiles),
    "",
    "## Forbidden Scope",
    list(forbiddenFiles),
    "",
    "## Verification Gates",
    list([validation]),
    "",
    "## First Action",
    sanitizeLine(firstAction),
    "",
  ].join("\n");
}
