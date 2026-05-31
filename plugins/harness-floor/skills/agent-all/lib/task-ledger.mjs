import { posix as pathPosix } from "node:path";

export const REQUIRED_SECTIONS = [
  "Goal",
  "Acceptance",
  "Phases",
  "Decision Matrix",
  "Ambiguity Log",
  "Progress Snapshot",
  "Verification",
];

const EXCLUDED_CHECKBOX_SECTIONS = new Set(["Backlog", "Follow-up"]);
const INDEX_TASK_EXCLUDED = new Set(["_template.md", "_handoff-template.md"]);
const TASKS_DIR = "docs/tasks";

function sectionRanges(text) {
  const headings = [...String(text || "").matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const next = headings[index + 1]?.index ?? text.length;
    return { title, body: text.slice(heading.index, next) };
  });
}

export function validateTaskDoc(text) {
  const errors = [];
  const sections = sectionRanges(text);
  const names = new Set(sections.map((section) => section.title));
  for (const required of REQUIRED_SECTIONS) {
    if (!names.has(required)) errors.push(`missing section: ${required}`);
  }
  for (const section of sections) {
    if (EXCLUDED_CHECKBOX_SECTIONS.has(section.title)) continue;
    const unchecked = section.body.match(/^\s*- \[ \]\s+.+$/gm) || [];
    for (const item of unchecked) errors.push(`unchecked item in ${section.title}: ${item.replace(/^\s*- \[ \]\s+/, "")}`);
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeActiveTaskPath(rawPath) {
  const taskPath = String(rawPath || "")
    .trim()
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .replace(/#.*$/, "")
    .replace(/[.,;:]+$/, "");
  if (!taskPath.endsWith(".md")) return null;

  let normalized;
  if (taskPath.startsWith(`${TASKS_DIR}/`)) {
    normalized = pathPosix.normalize(taskPath);
  } else if (taskPath.startsWith("./") || !taskPath.includes("/")) {
    normalized = pathPosix.normalize(pathPosix.join(TASKS_DIR, taskPath));
  } else {
    return null;
  }

  if (!normalized.startsWith(`${TASKS_DIR}/`)) return null;
  if (INDEX_TASK_EXCLUDED.has(pathPosix.basename(normalized))) return null;
  return normalized;
}

export function activeTaskPaths(indexText) {
  const active = sectionRanges(indexText).find((section) => section.title.toLowerCase() === "active");
  if (!active) return [];

  const paths = new Set();
  const matches = active.body.matchAll(/[^()\]\s`'"]+/g);
  for (const match of matches) {
    const taskPath = normalizeActiveTaskPath(match[0]);
    if (taskPath) paths.add(taskPath);
  }
  return [...paths];
}

export function validateTaskLedger({
  taskPath,
  taskText,
  indexText,
  templateExists = false,
  taskExists = () => false,
} = {}) {
  const errors = [];

  if (indexText == null) {
    errors.push("missing docs/tasks/index.md");
  }
  if (!templateExists) {
    errors.push("missing docs/tasks/_template.md");
  }

  if (taskPath && !taskExists(taskPath)) {
    errors.push(`task file not found: ${taskPath}`);
  }

  if (indexText != null) {
    for (const activePath of activeTaskPaths(indexText)) {
      if (!taskExists(activePath)) errors.push(`missing active task: ${activePath}`);
    }
  }

  if (taskText != null) {
    errors.push(...validateTaskDoc(taskText).errors);
  }

  return { ok: errors.length === 0, errors };
}
