#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { posix as pathPosix, resolve } from "node:path";

const REQUIRED = ["Goal", "Acceptance", "Phases", "Decision Matrix", "Ambiguity Log", "Progress Snapshot", "Verification"];
const EXCLUDED = new Set(["Backlog", "Follow-up"]);
const INDEX_TASK_EXCLUDED = new Set(["_template.md", "_handoff-template.md"]);
const TASKS_DIR = "docs/tasks";

function sections(text) {
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const next = headings[index + 1]?.index ?? text.length;
    return { title: heading[1].trim(), body: text.slice(heading.index, next) };
  });
}

function validateTaskDoc(text) {
  const errors = [];
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

function activeTaskPaths(indexText) {
  const active = sections(indexText).find((section) => section.title.toLowerCase() === "active");
  if (!active) return [];

  const paths = new Set();
  const matches = active.body.matchAll(/[^()\]\s`'"]+/g);
  for (const match of matches) {
    const taskPath = normalizeActiveTaskPath(match[0]);
    if (taskPath) paths.add(taskPath);
  }
  return [...paths];
}

function normalizeActiveTaskPath(rawPath) {
  const taskPath = rawPath
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

  const fileName = pathPosix.basename(normalized);
  if (INDEX_TASK_EXCLUDED.has(fileName)) return null;
  return normalized;
}

function validateActiveIndex(indexText) {
  const errors = [];
  for (const taskPath of activeTaskPaths(indexText)) {
    if (!existsSync(resolve(process.cwd(), taskPath))) errors.push(`missing active task: ${taskPath}`);
  }
  return errors;
}

const taskPath = process.argv[2];
const baseErrors = [];
const hasTaskIndex = existsSync("docs/tasks/index.md");
if (!hasTaskIndex) baseErrors.push("missing docs/tasks/index.md");
if (!existsSync("docs/tasks/_template.md")) baseErrors.push("missing docs/tasks/_template.md");
if (!taskPath) baseErrors.push("usage: node scripts/agent-task-ledger-check.mjs docs/tasks/NN-slug.md");
if (taskPath && !existsSync(taskPath)) baseErrors.push(`task file not found: ${taskPath}`);

const indexErrors = hasTaskIndex ? validateActiveIndex(readFileSync("docs/tasks/index.md", "utf-8")) : [];
const taskErrors = taskPath && existsSync(taskPath) ? validateTaskDoc(readFileSync(taskPath, "utf-8")) : [];
const errors = [...baseErrors, ...indexErrors, ...taskErrors];
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(`task ledger ok: ${taskPath}`);
