#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { posix as pathPosix, resolve } from "node:path";

const REQUIRED = ["Goal", "Acceptance", "Phases", "Decision Matrix", "Ambiguity Log", "Progress Snapshot", "Verification", "Cost Telemetry"];
const EXCLUDED = new Set(["Backlog", "Follow-up"]);
const INDEX_TASK_EXCLUDED = new Set(["_template.md", "_handoff-template.md"]);
const DEFAULT_TASKS_DIR = ".agent-skill/tasks";
const LEGACY_TASKS_DIR = "docs/tasks";
const TASK_BASENAME_PATTERN = /^(?:\d+-[^/]+|T-\d{8}-\d{3}(?:-\d+)?-[^/]+)\.md$/i;
const CANONICAL_TASK_ID_RE = /^AS-TASK-[0-9A-HJKMNP-TV-Z]{26}$/;
const DISPLAY_ID_RE = /^T-\d{8}-\d{3}(?:-\d+)?$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function sections(text) {
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const next = headings[index + 1]?.index ?? text.length;
    return { title: heading[1].trim(), body: text.slice(heading.index, next) };
  });
}

function parseFrontmatter(text) {
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

function validateIdentity(text, requireIdentity = false) {
  const errors = [];
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter) {
    if (requireIdentity) errors.push("missing task identity frontmatter");
    return errors;
  }
  if (!CANONICAL_TASK_ID_RE.test(frontmatter.id || "")) errors.push("invalid task identity id: expected AS-TASK-<ULID>");
  if (!DISPLAY_ID_RE.test(frontmatter.display_id || "")) errors.push("invalid task display_id: expected T-YYYYMMDD-NNN");
  if (frontmatter.github_issue && !/^[1-9]\d*$/.test(frontmatter.github_issue)) {
    errors.push("invalid github_issue: expected positive integer");
  }
  if (frontmatter.artifact_root && (/^(?:\/|[A-Za-z]:)/.test(frontmatter.artifact_root) || frontmatter.artifact_root.includes(".."))) {
    errors.push("invalid artifact_root: expected a relative artifact root");
  }
  return errors;
}

function validateTaskDoc(text, requireIdentity = false) {
  const errors = [];
  errors.push(...validateIdentity(text, requireIdentity));
  const parsed = sections(text);
  const names = new Set(parsed.map((section) => section.title));
  for (const required of REQUIRED) {
    if (!names.has(required)) errors.push(`missing section: ${required}`);
  }
  for (const section of parsed) {
    if (EXCLUDED.has(section.title)) continue;
    const unchecked = section.body.match(/^\s*- \[ \]\s+.+$/gm) || [];
    for (const item of unchecked) errors.push(`unchecked item in ${section.title}: ${item.replace(/^\s*- \[ \]\s+/, "")}`);
  }
  return errors;
}

function isTaskPathInDir(taskPath, tasksDir) {
  return taskPath === tasksDir || taskPath.startsWith(`${tasksDir}/`);
}

function normalizeActiveTaskPath(rawPath, tasksDir = DEFAULT_TASKS_DIR) {
  const taskPath = rawPath
    .trim()
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .replace(/#.*$/, "")
    .replace(/[.,;:]+$/, "");
  if (!taskPath.endsWith(".md")) return null;

  let normalized;
  if (isTaskPathInDir(taskPath, tasksDir) || isTaskPathInDir(taskPath, LEGACY_TASKS_DIR)) {
    normalized = pathPosix.normalize(taskPath);
  } else if (taskPath.startsWith("./") || !taskPath.includes("/")) {
    normalized = pathPosix.normalize(pathPosix.join(tasksDir, taskPath.replace(/^\.\//, "")));
  } else {
    return null;
  }
  if (!isTaskPathInDir(normalized, tasksDir) && !isTaskPathInDir(normalized, LEGACY_TASKS_DIR)) return null;

  const fileName = pathPosix.basename(normalized);
  if (INDEX_TASK_EXCLUDED.has(fileName)) return null;
  if (!TASK_BASENAME_PATTERN.test(fileName)) return null;
  return normalized;
}

function validateActiveIndex(indexText, tasksDir) {
  const errors = [];
  for (const taskPath of activeTaskPaths(indexText, tasksDir)) {
    if (!existsSync(resolve(process.cwd(), taskPath))) errors.push(`missing active task: ${taskPath}`);
  }
  return errors;
}

function activeTaskPaths(indexText, tasksDir = DEFAULT_TASKS_DIR) {
  const active = sections(indexText).find((section) => section.title.toLowerCase() === "active");
  if (!active) return [];

  const paths = new Set();
  const matches = active.body.matchAll(/[^()\]\s`'"]+/g);
  for (const match of matches) {
    const taskPath = normalizeActiveTaskPath(match[0], tasksDir);
    if (taskPath) paths.add(taskPath);
  }
  return [...paths];
}

function selectTasksDir(taskPath) {
  if (taskPath && isTaskPathInDir(pathPosix.normalize(taskPath), LEGACY_TASKS_DIR)) return LEGACY_TASKS_DIR;
  if (existsSync(`${DEFAULT_TASKS_DIR}/index.md`) || existsSync(`${DEFAULT_TASKS_DIR}/_template.md`)) return DEFAULT_TASKS_DIR;
  if (existsSync(`${LEGACY_TASKS_DIR}/index.md`) || existsSync(`${LEGACY_TASKS_DIR}/_template.md`)) return LEGACY_TASKS_DIR;
  return DEFAULT_TASKS_DIR;
}

const taskPath = process.argv[2];
const tasksDir = selectTasksDir(taskPath);
const baseErrors = [];
const hasTaskIndex = existsSync(`${tasksDir}/index.md`);
if (!hasTaskIndex) baseErrors.push(`missing ${tasksDir}/index.md`);
if (!existsSync(`${tasksDir}/_template.md`)) baseErrors.push(`missing ${tasksDir}/_template.md`);
if (!taskPath) baseErrors.push("usage: node scripts/agent-task-ledger-check.mjs .agent-skill/tasks/T-YYYYMMDD-NNN-slug.md");
if (taskPath && !existsSync(taskPath)) baseErrors.push(`task file not found: ${taskPath}`);

const indexErrors = hasTaskIndex ? validateActiveIndex(readFileSync(`${tasksDir}/index.md`, "utf-8"), tasksDir) : [];
const taskName = taskPath ? pathPosix.basename(pathPosix.normalize(taskPath)) : "";
const requireIdentity = Boolean(
  taskPath
  && isTaskPathInDir(pathPosix.normalize(taskPath), DEFAULT_TASKS_DIR)
  && !INDEX_TASK_EXCLUDED.has(taskName)
);
const taskErrors = taskPath && existsSync(taskPath) ? validateTaskDoc(readFileSync(taskPath, "utf-8"), requireIdentity) : [];
const errors = [...baseErrors, ...indexErrors, ...taskErrors];
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(`task ledger ok: ${taskPath}`);
