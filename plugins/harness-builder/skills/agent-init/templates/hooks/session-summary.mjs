#!/usr/bin/env node
// Stop hook. Appends a short markdown entry to .agent-skill/decisions/YYYY-MM-DD-<slug>.md
// summarising the session. Reads the Stop payload from stdin; never blocks.
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

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

export function appendSessionDecision(file, { date, stamp, note }) {
  // Atomic header creation: only the first writer wins the exclusive create.
  try {
    writeFileSync(file, `# Session decisions — ${date}\n\n`, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error; // EEXIST is the expected concurrent case
  }
  appendFileSync(file, `- [${stamp}] ${note}\n`);
}

function main() {
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
    try {
      appendSessionDecision(file, { date, stamp, note });
    } catch (error) {
      warnHook("append session decision", error);
    }
  } catch (error) {
    warnHook("append session decision", error);
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
