import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FLOOR_POLICY_SENTINEL = /floor-policy-(?:hook|pre|post)/;

function loadSettings(dir) {
  const p = join(dir, ".claude/settings.local.json");
  if (!existsSync(p)) return { path: p, json: { hooks: {} } };
  try {
    const json = JSON.parse(readFileSync(p, "utf-8"));
    if (!json.hooks || typeof json.hooks !== "object") json.hooks = {};
    return { path: p, json };
  } catch {
    throw new Error(`cannot parse ${p} — refusing to patch`);
  }
}

function atomicWrite(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function hookCommands(entry) {
  if (Array.isArray(entry?.hooks)) {
    return entry.hooks.map((hook) => hook?.command).filter(Boolean);
  }
  if (entry?.command) return [entry.command];
  return [];
}

function hasCommand(entries, command) {
  return entries.some((entry) => hookCommands(entry).includes(command));
}

function hasFloorPolicyCommand(entry) {
  return hookCommands(entry).some((command) => FLOOR_POLICY_SENTINEL.test(command));
}

function taskHook(command) {
  return {
    matcher: "Task",
    hooks: [{ type: "command", command }],
  };
}

export function installFloorPolicy({ projectDir, hookScriptAbsPath }) {
  const { path, json } = loadSettings(projectDir);
  json.hooks.PreToolUse = Array.isArray(json.hooks.PreToolUse)
    ? json.hooks.PreToolUse.filter((entry) => !hasFloorPolicyCommand(entry))
    : [];
  json.hooks.PostToolUse = Array.isArray(json.hooks.PostToolUse)
    ? json.hooks.PostToolUse.filter((entry) => !hasFloorPolicyCommand(entry))
    : [];

  const preCmd = `node "${hookScriptAbsPath}" PreToolUse`;
  const postCmd = `node "${hookScriptAbsPath}" PostToolUse`;
  if (!hasCommand(json.hooks.PreToolUse, preCmd)) {
    json.hooks.PreToolUse.push(taskHook(preCmd));
  }
  if (!hasCommand(json.hooks.PostToolUse, postCmd)) {
    json.hooks.PostToolUse.push(taskHook(postCmd));
  }
  atomicWrite(path, `${JSON.stringify(json, null, 2)}\n`);
}

export function uninstallFloorPolicy({ projectDir }) {
  const settingsPath = join(projectDir, ".claude/settings.local.json");
  if (!existsSync(settingsPath)) return;
  const { path, json } = loadSettings(projectDir);
  for (const event of ["PreToolUse", "PostToolUse"]) {
    const entries = Array.isArray(json.hooks[event]) ? json.hooks[event] : [];
    const filtered = entries.filter((entry) => !hasFloorPolicyCommand(entry));
    if (filtered.length === 0) delete json.hooks[event];
    else json.hooks[event] = filtered;
  }
  atomicWrite(path, `${JSON.stringify(json, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();
  const scriptPath = fileURLToPath(new URL("./floor-policy-hook.mjs", import.meta.url));
  if (cmd === "install") installFloorPolicy({ projectDir, hookScriptAbsPath: scriptPath });
  else if (cmd === "uninstall") uninstallFloorPolicy({ projectDir });
  else { console.error("usage: install-floor-policy.mjs install|uninstall [dir]"); process.exit(1); }
}
