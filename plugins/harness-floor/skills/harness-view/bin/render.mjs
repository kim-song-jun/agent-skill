#!/usr/bin/env node
// /harness-view — regenerate the self-contained HTML dashboard of the harness's
// artifacts (live /agent-all run state, task ledger, design specs) and print its path.
// Honors CLAUDE_PROJECT_DIR so it works from a hook/skill context, else uses cwd.
import { writeDashboard } from "../lib/harness-html.mjs";

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
try {
  process.stdout.write(`${writeDashboard({ cwd })}\n`);
} catch (err) {
  console.error(`harness-view: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
