#!/usr/bin/env node
// Stop hook. Appends a short markdown entry to docs/decisions/YYYY-MM-DD-<slug>.md
// summarising the session. Reads the Stop payload from stdin; never blocks.
import { readFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

let input = "";
try { input = readFileSync(0, "utf-8"); } catch {}
let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const decisionsDir = resolve(cwd, "docs", "decisions");

try {
  mkdirSync(decisionsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(decisionsDir, `${date}-session.md`);
  const stamp = new Date().toISOString();
  const note = (payload?.stop_reason || payload?.reason || "session end").toString();
  const header = existsSync(file) ? "" : `# Session decisions — ${date}\n\n`;
  appendFileSync(file, `${header}- [${stamp}] ${note}\n`);
} catch {}
process.exit(0);
