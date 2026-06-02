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
const TASK_BASENAME_PATTERN = /^\d+-[^/]+\.md$/;

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
  const basename = pathPosix.basename(normalized);
  if (INDEX_TASK_EXCLUDED.has(basename)) return null;
  if (!TASK_BASENAME_PATTERN.test(basename)) return null;
  return normalized;
}

function activeTaskPathEntries(indexText) {
  const active = sectionRanges(indexText).find((section) => section.title.toLowerCase() === "active");
  if (!active) return [];

  const paths = [];
  for (const line of active.body.split(/\r?\n/)) {
    const item = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (!item) continue;

    const linkMatches = [...item[1].matchAll(/\[[^\]]*]\(([^)\s]+)\)/g)];
    if (linkMatches.length > 0) {
      for (const match of linkMatches) {
        const taskPath = normalizeActiveTaskPath(match[1]);
        if (taskPath) paths.push(taskPath);
      }
      continue;
    }

    const withoutInlineCode = item[1].replace(/`[^`]*`/g, " ");
    const matches = withoutInlineCode.matchAll(/<[^>\s]+\.md(?:#[^>\s]*)?>|[^()\]\s`'"]+\.md(?:#[^()\]\s`'"]*)?/g);
    for (const match of matches) {
      const taskPath = normalizeActiveTaskPath(match[0]);
      if (taskPath) paths.push(taskPath);
    }
  }
  return paths;
}

export function activeTaskPaths(indexText) {
  const paths = new Set(activeTaskPathEntries(indexText));
  return [...paths];
}

export function validateTaskLedger({
  taskPath,
  taskText,
  indexText,
  templateExists = false,
  taskExists,
} = {}) {
  const errors = [];
  const hasTaskExists = typeof taskExists === "function";
  const normalizedTaskPath = normalizeActiveTaskPath(taskPath) ?? taskPath;

  if (indexText == null) {
    errors.push("missing docs/tasks/index.md");
  }
  if (!templateExists) {
    errors.push("missing docs/tasks/_template.md");
  }

  const currentTaskExists = taskPath && (hasTaskExists ? taskExists(taskPath) : taskText != null);
  if (taskPath && !currentTaskExists) {
    errors.push(`task file not found: ${taskPath}`);
  }

  if (indexText != null) {
    const activeEntries = activeTaskPathEntries(indexText);
    const activeCounts = new Map();
    for (const activePath of activeEntries) {
      activeCounts.set(activePath, (activeCounts.get(activePath) ?? 0) + 1);
    }
    for (const [activePath, count] of activeCounts) {
      if (count > 1) errors.push(`duplicate active task: ${activePath}`);
    }

    for (const activePath of activeCounts.keys()) {
      if (hasTaskExists) {
        if (!taskExists(activePath)) errors.push(`missing active task: ${activePath}`);
      } else if (activePath === normalizedTaskPath && taskText == null) {
        errors.push(`missing active task: ${activePath}`);
      }
    }
  }

  if (taskText != null) {
    errors.push(...validateTaskDoc(taskText).errors);
  }

  return { ok: errors.length === 0, errors };
}
