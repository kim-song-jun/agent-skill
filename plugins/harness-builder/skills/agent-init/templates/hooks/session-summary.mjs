#!/usr/bin/env node
// Stop hook. Appends a short markdown entry to .agent-skill/decisions/YYYY-MM-DD-<slug>.md
// summarising the session. Reads the Stop payload from stdin; never blocks.
import { readFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const HOOK_NAME = "session-summary";

function formatHookError(error) {
  const raw = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error || "unknown error");
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();
  return (firstLine || "unknown error").slice(0, 200);
}

function warnHook(action, error) {
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${formatHookError(error)}`);
}

let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch (error) {
  warnHook("read stdin", error);
}
let payload = {};
try {
  payload = JSON.parse(input || "{}");
} catch (error) {
  if (input.trim()) warnHook("parse hook payload", error);
  payload = {};
}

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const decisionsDir = resolve(cwd, ".agent-skill", "decisions");

try {
  mkdirSync(decisionsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(decisionsDir, `${date}-session.md`);
  const stamp = new Date().toISOString();
  const note = (payload?.stop_reason || payload?.reason || "session end").toString();
  const header = existsSync(file) ? "" : `# Session decisions — ${date}\n\n`;
  appendFileSync(file, `${header}- [${stamp}] ${note}\n`);
} catch (error) {
  warnHook("append session decision", error);
}
process.exit(0);
