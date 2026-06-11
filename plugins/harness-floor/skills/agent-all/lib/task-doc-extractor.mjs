import { basename } from "node:path";
import { artifactPaths, handoffPathsForTaskPath } from "./artifact-paths.mjs";
import { parseTaskFrontmatter, REQUIRED_SECTIONS } from "./task-ledger.mjs";
import { sanitizeLine } from "./handoff-writer.mjs";

const CHECKED = /^\s*[-*+]\s+\[[xX]\]\s+(.+)$/;
const UNCHECKED = /^\s*[-*+]\s+\[ \]\s+(.+)$/;
const EXCLUDED_CHECKBOX_SECTIONS = new Set(["Backlog", "Follow-up"]);

export function sectionRanges(text) {
  const source = String(text || "");
  const headings = [...source.matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const bodyStart = heading.index + heading[0].length;
    const next = headings[index + 1]?.index ?? source.length;
    return { title, body: source.slice(bodyStart, next).trim() };
  });
}

export function sectionsByTitle(text) {
  const sections = new Map();
  for (const section of sectionRanges(text)) {
    sections.set(section.title.toLowerCase(), section);
  }
  return sections;
}

export function taskTitleFromText(text, fallback = "Task") {
  const match = String(text || "").match(/^#\s+(.+)$/m);
  return sanitizeLine(match?.[1] || fallback || "Task");
}

function conciseBody(section, fallback = "") {
  const body = String(section?.body || "").trim();
  if (!body) return fallback;
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  return lines.length > 0 ? lines.join("; ") : fallback;
}

function checklistItems(sections, pattern, prefix) {
  const items = [];
  for (const section of sections.values()) {
    if (EXCLUDED_CHECKBOX_SECTIONS.has(section.title)) continue;
    for (const line of section.body.split(/\r?\n/)) {
      const match = line.match(pattern);
      if (!match) continue;
      const item = sanitizeLine(match[1]);
      items.push(prefix ? `${section.title}: ${item}` : item);
    }
  }
  return items;
}

function blockerItems(sections) {
  const direct = sections.get("blockers") || sections.get("blocked");
  const directLines = String(direct?.body || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+]\s+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(none|n\/a|no blockers?)\.?$/i.test(line));
  if (directLines.length > 0) return directLines.map(sanitizeLine);

  const candidates = [];
  for (const sectionName of ["progress snapshot", "handoff", "ambiguity log"]) {
    const section = sections.get(sectionName);
    if (!section) continue;
    for (const line of section.body.split(/\r?\n/)) {
      if (/\b(blocked|blocker|waiting|stuck)\b/i.test(line)) {
        candidates.push(sanitizeLine(line.replace(/^\s*[-*+]\s+/, "")));
      }
    }
  }
  return candidates;
}

function stateCompleted(state) {
  const phases = Array.isArray(state?.phases) ? state.phases : [];
  return phases
    .filter((phase) => phase && phase.phase !== undefined)
    .map((phase) => {
      const status = phase.status ? ` (${phase.status})` : "";
      return `Phase ${phase.phase}${status} recorded in .agent-all-state.json`;
    });
}

export function validateTaskDocShape(text) {
  const errors = [];
  const title = taskTitleFromText(text, "");
  if (!title) errors.push("missing title heading");
  const sections = sectionsByTitle(text);
  for (const required of REQUIRED_SECTIONS) {
    if (!sections.has(required.toLowerCase())) errors.push(`missing section: ${required}`);
  }
  return { ok: errors.length === 0, errors };
}

export function extractTaskDoc({ taskPath = "", taskText = "", state = null } = {}) {
  const title = taskTitleFromText(taskText, basename(taskPath, ".md") || "Task");
  const handoffPaths = taskPath ? handoffPathsForTaskPath(taskPath) : null;
  const identity = parseTaskFrontmatter(taskText);
  const sections = sectionsByTitle(taskText);
  const goal = conciseBody(sections.get("goal"), title);
  const progressSnapshot = conciseBody(sections.get("progress snapshot"), "No progress snapshot recorded.");
  const verification = conciseBody(sections.get("verification"), "No verification evidence recorded.");

  const completed = [
    ...checklistItems(sections, CHECKED, true),
    ...stateCompleted(state),
  ];
  const remaining = checklistItems(sections, UNCHECKED, true);
  const blockers = blockerItems(sections);

  return {
    id: identity?.id ?? state?.task?.id ?? null,
    displayId: identity?.display_id ?? state?.task?.displayId ?? null,
    githubIssue: identity?.github_issue ?? null,
    title,
    goal,
    progressSnapshot,
    validation: verification,
    completed: completed.length > 0 ? completed : ["No completed checklist items recorded."],
    remaining: remaining.length > 0
      ? remaining
      : ["No unchecked checklist items found; inspect the task doc and resume from the next incomplete phase."],
    blockers: blockers.length > 0 ? blockers : ["None"],
    ssot: [
      taskPath,
      artifactPaths().taskRegistryPath,
      ".agent-all-state.json",
      handoffPaths?.handoffPath,
      handoffPaths?.sessionPath,
    ].filter(Boolean),
    shape: validateTaskDocShape(taskText),
  };
}
