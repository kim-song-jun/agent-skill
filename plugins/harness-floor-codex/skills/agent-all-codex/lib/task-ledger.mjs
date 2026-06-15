import { posix as pathPosix } from "node:path";
import {
  LEGACY_TASKS_DIR,
  artifactPaths,
  isTaskPathInDir,
  normalizeTaskPath,
} from "./artifact-paths.mjs";
import { isCanonicalTaskId, isDisplayTaskId } from "./task-id-allocator.mjs";

export const REQUIRED_SECTIONS = [
  "Goal",
  "Acceptance",
  "Phases",
  "Decision Matrix",
  "Ambiguity Log",
  "Progress Snapshot",
  "Verification",
  "Cost Telemetry",
];

const EXCLUDED_CHECKBOX_SECTIONS = new Set(["Backlog", "Follow-up"]);
const INDEX_TASK_EXCLUDED = new Set(["_template.md", "_handoff-template.md"]);
const TASKS_DIR = artifactPaths().tasksDir;
const TASK_BASENAME_PATTERN = /^(?:\d+-[^/]+|T-\d{8}-\d{3}(?:-\d+)?-[^/]+)\.md$/i;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function sectionRanges(text) {
  const headings = [...String(text || "").matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const next = headings[index + 1]?.index ?? text.length;
    return { title, body: text.slice(heading.index, next) };
  });
}

export function parseTaskFrontmatter(text) {
  const match = FRONTMATTER_RE.exec(String(text || ""));
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!item) continue;
    data[item[1]] = item[2].trim().replace(/^["']|["']$/g, "");
  }
  return data;
}

export function validateTaskIdentity(text, { requireIdentity = false } = {}) {
  const errors = [];
  const frontmatter = parseTaskFrontmatter(text);
  if (!frontmatter) {
    if (requireIdentity) errors.push("missing task identity frontmatter");
    return { ok: errors.length === 0, errors, frontmatter: null };
  }

  if (!isCanonicalTaskId(frontmatter.id)) errors.push("invalid task identity id: expected AS-TASK-<ULID>");
  if (!isDisplayTaskId(frontmatter.display_id)) errors.push("invalid task display_id: expected T-YYYYMMDD-NNN");
  if (frontmatter.github_issue && !/^[1-9]\d*$/.test(frontmatter.github_issue)) {
    errors.push("invalid github_issue: expected positive integer");
  }
  if (frontmatter.artifact_root && (/^(?:\/|[A-Za-z]:)/.test(frontmatter.artifact_root) || frontmatter.artifact_root.includes(".."))) {
    errors.push("invalid artifact_root: expected a relative artifact root");
  }
  return { ok: errors.length === 0, errors, frontmatter };
}

export function validateTaskDoc(text, { requireIdentity = false } = {}) {
  const errors = [];
  errors.push(...validateTaskIdentity(text, { requireIdentity }).errors);
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

export function normalizeActiveTaskPath(rawPath, {
  tasksDir = TASKS_DIR,
  legacyTasksDir = LEGACY_TASKS_DIR,
} = {}) {
  const taskPath = String(rawPath || "")
    .trim()
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .replace(/#.*$/, "")
    .replace(/[.,;:]+$/, "");
  if (!taskPath.endsWith(".md")) return null;

  const normalized = normalizeTaskPath(taskPath, { tasksDir, legacyTasksDir });
  if (!normalized) return null;
  const basename = pathPosix.basename(normalized);
  if (INDEX_TASK_EXCLUDED.has(basename)) return null;
  if (!TASK_BASENAME_PATTERN.test(basename)) return null;
  return normalized;
}

function activeTaskPathEntries(indexText, options = {}) {
  const active = sectionRanges(indexText).find((section) => section.title.toLowerCase() === "active");
  if (!active) return [];

  const paths = [];
  for (const line of active.body.split(/\r?\n/)) {
    const item = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (!item) continue;

    const linkMatches = [...item[1].matchAll(/\[[^\]]*]\(([^)\s]+)\)/g)];
    if (linkMatches.length > 0) {
      for (const match of linkMatches) {
        const taskPath = normalizeActiveTaskPath(match[1], options);
        if (taskPath) paths.push(taskPath);
      }
      continue;
    }

    const withoutInlineCode = item[1].replace(/`[^`]*`/g, " ");
    const matches = withoutInlineCode.matchAll(/<[^>\s]+\.md(?:#[^>\s]*)?>|[^()\]\s`'"]+\.md(?:#[^()\]\s`'"]*)?/g);
    for (const match of matches) {
      const taskPath = normalizeActiveTaskPath(match[0], options);
      if (taskPath) paths.push(taskPath);
    }
  }
  return paths;
}

export function activeTaskPaths(indexText, options = {}) {
  const paths = new Set(activeTaskPathEntries(indexText, options));
  return [...paths];
}

export function validateTaskLedger({
  taskPath,
  taskText,
  indexText,
  templateExists = false,
  taskExists,
  tasksDir = TASKS_DIR,
  legacyTasksDir = LEGACY_TASKS_DIR,
  requireIdentity = false,
} = {}) {
  const errors = [];
  const hasTaskExists = typeof taskExists === "function";
  const normalizedTaskPath = normalizeActiveTaskPath(taskPath, { tasksDir, legacyTasksDir }) ?? taskPath;

  if (indexText == null) {
    errors.push(`missing ${tasksDir}/index.md`);
  }
  if (!templateExists) {
    errors.push(`missing ${tasksDir}/_template.md`);
  }

  const currentTaskExists = taskPath && (hasTaskExists ? taskExists(taskPath) : taskText != null);
  if (taskPath && !currentTaskExists) {
    errors.push(`task file not found: ${taskPath}`);
  }

  if (indexText != null) {
    const activeEntries = activeTaskPathEntries(indexText, { tasksDir, legacyTasksDir });
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
    const shouldRequireIdentity = requireIdentity && !isTaskPathInDir(normalizedTaskPath, legacyTasksDir);
    errors.push(...validateTaskDoc(taskText, { requireIdentity: shouldRequireIdentity }).errors);
  }

  return { ok: errors.length === 0, errors };
}
