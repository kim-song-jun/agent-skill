// plan-parser.mjs — extract task records from a markdown plan.
//
// The cursor coordinator runs this in `read_bash` before Phase 3 dispatch to
// avoid relying on natural-language interpretation of `### Task N:` headings.
// No Claude Code equivalent exists — Claude Code reads the plan in-context
// via LLM. For Cursor we want a deterministic parse so the dispatch wave
// counts are reliable.
//
// Expected plan shape (per superpowers:writing-plans):
//
//     # <Plan title>
//     ## Task list
//     ### Task 1: <title>
//     role: frontend-dev               (optional)
//     - Create: `src/foo.ts`
//     - Modify: `docs/bar.md`
//     Verification: npm test
//     ### Task 2: ...

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

function isMain() {
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
}

const HEADING_RE = /^###\s+Task\s+(\d+)\s*:\s*(.+?)\s*$/;
// Captures lines that look like a Task heading but with a non-numeric id.
const BAD_HEADING_RE = /^###\s+Task\s+(\S+?)\s*:\s*(.+?)\s*$/;
const FILE_RE = /^\s*-\s*(?:Create|Modify)\s*:\s*`([^`]+)`\s*$/i;
const ROLE_RE = /^role\s*:\s*(\S+)\s*$/i;

export function parsePlan(markdown) {
  const errors = [];
  const tasks = [];
  const lines = (markdown || "").split(/\r?\n/);

  let current = null;
  const flush = () => {
    if (current) tasks.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING_RE.exec(line);
    if (h) {
      flush();
      const id = Number(h[1]);
      current = { id, title: h[2].trim(), role: undefined, files: [] };
      continue;
    }
    // Non-numeric task id (e.g., `### Task abc:`) — surface as parse error
    // but DON'T enter a task block (we have no usable id).
    const bad = BAD_HEADING_RE.exec(line);
    if (bad && !/^\d+$/.test(bad[1])) {
      flush();
      errors.push({ line: i + 1, message: `bad task id: ${bad[1]}` });
      continue;
    }
    if (!current) continue;
    const r = ROLE_RE.exec(line);
    if (r) {
      current.role = r[1].trim();
      continue;
    }
    const f = FILE_RE.exec(line);
    if (f) {
      current.files.push(f[1].trim());
      continue;
    }
  }
  flush();

  // Post-validate: warn on tasks with zero files (still returned).
  for (const t of tasks) {
    if (t.files.length === 0) {
      errors.push({ taskId: t.id, message: "no Create/Modify file bullets found" });
    }
  }

  return { tasks, errors };
}

export function parsePlanFile(path) {
  const md = readFileSync(path, "utf-8");
  return parsePlan(md);
}

// CLI entrypoint — `node lib/plan-parser.mjs <plan.md>` prints JSON.
if (isMain()) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: plan-parser.mjs <plan.md>");
    process.exit(2);
  }
  const result = parsePlanFile(path);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.errors.some(e => e.message?.startsWith("bad task id")) ? 1 : 0);
}
