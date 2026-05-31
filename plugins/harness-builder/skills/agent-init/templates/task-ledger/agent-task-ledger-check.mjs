#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const REQUIRED = ["Goal", "Acceptance", "Phases", "Decision Matrix", "Ambiguity Log", "Progress Snapshot", "Verification"];
const EXCLUDED = new Set(["Backlog", "Follow-up"]);

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

const taskPath = process.argv[2];
const baseErrors = [];
if (!existsSync("docs/tasks/index.md")) baseErrors.push("missing docs/tasks/index.md");
if (!existsSync("docs/tasks/_template.md")) baseErrors.push("missing docs/tasks/_template.md");
if (!taskPath) baseErrors.push("usage: node scripts/agent-task-ledger-check.mjs docs/tasks/NN-slug.md");
if (taskPath && !existsSync(taskPath)) baseErrors.push(`task file not found: ${taskPath}`);

const taskErrors = taskPath && existsSync(taskPath) ? validateTaskDoc(readFileSync(taskPath, "utf-8")) : [];
const errors = [...baseErrors, ...taskErrors];
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(`task ledger ok: ${taskPath}`);
