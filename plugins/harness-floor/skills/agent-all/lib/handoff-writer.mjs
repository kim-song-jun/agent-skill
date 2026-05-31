const MAX_ITEM_LENGTH = 300;
const TRUNCATION_MARKER = "... [truncated]";

function sanitizeLine(value) {
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

export function renderHandoff({
  title = "Task",
  completed = [],
  remaining = [],
  blockers = [],
  validation = "Not run",
  gitState = "Unknown",
  nextAction = "Resume from the next incomplete phase",
} = {}) {
  return [
    `# Handoff: ${sanitizeLine(title) || "Task"}`,
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
    "## Next Action",
    list([nextAction]),
    "",
  ].join("\n");
}
