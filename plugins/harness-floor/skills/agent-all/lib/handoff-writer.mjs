function sanitizeLine(value) {
  return String(value ?? "")
    .replace(/```/g, "'''")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
