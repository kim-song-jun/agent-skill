import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SENTINEL_PRE = "floor-policy-pre";
const SENTINEL_POST = "floor-policy-post";

function loadSettings(dir) {
  const p = join(dir, ".claude/settings.local.json");
  if (!existsSync(p)) return { path: p, json: { hooks: {} } };
  return { path: p, json: JSON.parse(readFileSync(p, "utf-8")) };
}

function ensureHooks(json) {
  json.hooks = json.hooks || {};
  json.hooks.PreToolUse = json.hooks.PreToolUse || [];
  json.hooks.PostToolUse = json.hooks.PostToolUse || [];
  return json;
}

export function installFloorPolicy({ projectDir, hookScriptAbsPath }) {
  const { path, json } = loadSettings(projectDir);
  ensureHooks(json);
  const preCmd = `${SENTINEL_PRE} node ${hookScriptAbsPath} PreToolUse`;
  const postCmd = `${SENTINEL_POST} node ${hookScriptAbsPath} PostToolUse`;
  if (!json.hooks.PreToolUse.some((h) => h.command?.includes(SENTINEL_PRE))) {
    json.hooks.PreToolUse.push({ matcher: "Task", command: preCmd });
  }
  if (!json.hooks.PostToolUse.some((h) => h.command?.includes(SENTINEL_POST))) {
    json.hooks.PostToolUse.push({ matcher: "Task", command: postCmd });
  }
  writeFileSync(path, JSON.stringify(json, null, 2));
}

export function uninstallFloorPolicy({ projectDir }) {
  const { path, json } = loadSettings(projectDir);
  ensureHooks(json);
  json.hooks.PreToolUse = json.hooks.PreToolUse.filter((h) => !h.command?.includes("floor-policy-"));
  json.hooks.PostToolUse = json.hooks.PostToolUse.filter((h) => !h.command?.includes("floor-policy-"));
  writeFileSync(path, JSON.stringify(json, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();
  const scriptPath = new URL("./floor-policy-hook.mjs", import.meta.url).pathname;
  if (cmd === "install") installFloorPolicy({ projectDir, hookScriptAbsPath: scriptPath });
  else if (cmd === "uninstall") uninstallFloorPolicy({ projectDir });
  else { console.error("usage: install-floor-policy.mjs install|uninstall [dir]"); process.exit(1); }
}
