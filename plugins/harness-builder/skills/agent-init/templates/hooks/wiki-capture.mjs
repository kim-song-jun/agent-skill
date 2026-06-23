#!/usr/bin/env node
// PostToolUse Write|Edit hook (project-scoped). Advisory: when a project doc under a configured
// wiki source root is written, nudge the orchestrator to record it in the wiki via /wiki import.
// Suppressed during an agent-all run (it records to the wiki itself). Non-fatal, never blocks.
import { readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

const HOOK_NAME = "wiki-capture";
const DEFAULT_SOURCES = ["docs/superpowers/specs", "docs/superpowers/plans", ".agent-skill/tasks"];
const DEFAULT_EXCLUDE = ["**/process-archive/**", "**/raw/**", "**/artifacts/**", "**/*-shots/**", "**/meeting-*/**"];

function warn(action, err) {
  const msg = (err && err.message ? String(err.message) : String(err)).split(/\r?\n/, 1)[0].slice(0, 200);
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${msg}`);
}
function globToRe(g) {
  const re = g.split("/").map((s) => s === "**" ? ".*" : s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("/").replace(/\.\*\//g, "(?:.*/)?");
  return new RegExp(re);
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf-8") || "{}"); } catch { process.exit(0); }

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const fp = payload?.tool_input?.file_path;
if (!fp || !/\.md$/i.test(fp)) process.exit(0);

try {
  // Suppress during an agent-all run.
  try {
    const st = JSON.parse(readFileSync(resolve(cwd, ".agent-all-state.json"), "utf-8"));
    if (st && st.status === "running") process.exit(0);
  } catch { /* no state → not running */ }

  let sources = DEFAULT_SOURCES, exclude = DEFAULT_EXCLUDE;
  try {
    const cfg = JSON.parse(readFileSync(resolve(cwd, ".agent-all.json"), "utf-8"));
    if (Array.isArray(cfg?.wiki?.sources) && cfg.wiki.sources.length) sources = cfg.wiki.sources;
    if (Array.isArray(cfg?.wiki?.exclude)) exclude = cfg.wiki.exclude;
  } catch { /* use defaults */ }

  const rel = isAbsolute(fp) ? relative(cwd, fp) : fp;
  if (rel.startsWith("..")) process.exit(0);
  const underSource = sources.some((s) => rel === s || rel.startsWith(s.replace(/\/?$/, "/")));
  if (!underSource) process.exit(0);
  if (exclude.map(globToRe).some((re) => re.test(rel))) process.exit(0);

  process.stdout.write(`agent-skill: recorded a project doc at ${rel}. Record it in the wiki (reference, not copy): run \`/wiki import ${rel}\` when convenient.\n`);
} catch (err) { warn("evaluate capture", err); }
process.exit(0);
