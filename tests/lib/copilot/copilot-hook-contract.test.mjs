import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOOK_TEMPLATE_DIR = "plugins/harness-builder-copilot/skills/copilot-init/templates/hooks";
const COPILOT_INSTRUCTIONS =
  "plugins/harness-builder-copilot/skills/copilot-init/templates/copilot-instructions.md.hbs";

const VALID_TOOL_MATCHERS = new Set([
  "ask_user",
  "bash",
  "create",
  "edit",
  "glob",
  "grep",
  "powershell",
  "task",
  "view",
  "web_fetch",
]);

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf-8"));
}

function matcherTokens(matcher) {
  if (!matcher) return [];
  return String(matcher).split("|").filter(Boolean);
}

for (const [file, event] of [
  ["agentStop.json", "agentStop"],
  ["postToolUse.json", "postToolUse"],
  ["preToolUse.json", "preToolUse"],
]) {
  test(`copilot hook template ${file}: uses official versioned hooks shape`, () => {
    const json = readJson(`${HOOK_TEMPLATE_DIR}/${file}`);
    assert.equal(json.version, 1);
    assert.ok(json.hooks && typeof json.hooks === "object");
    assert.ok(Array.isArray(json.hooks[event]), `${file} must declare hooks.${event}[]`);
    assert.equal(json.hooks[event].length, 1);
    const [entry] = json.hooks[event];
    assert.equal(entry.type, "command");
    assert.ok(entry.bash || entry.powershell || entry.command);
    assert.ok(!("args" in entry), "Copilot hook command entries use command strings, not args arrays");
  });
}

test("copilot hook templates: matchers use Copilot runtime tool names", () => {
  for (const file of ["postToolUse.json", "preToolUse.json"]) {
    const json = readJson(`${HOOK_TEMPLATE_DIR}/${file}`);
    const event = Object.keys(json.hooks)[0];
    for (const entry of json.hooks[event]) {
      for (const token of matcherTokens(entry.matcher)) {
        assert.ok(VALID_TOOL_MATCHERS.has(token), `${file} uses unknown Copilot tool matcher: ${token}`);
      }
    }
  }
});

test("copilot instructions template does not reference nonexistent Copilot tools", () => {
  const text = readFileSync(resolve(COPILOT_INSTRUCTIONS), "utf-8");
  for (const invalid of ["apply_patch", "read_bash", "read_file", "store_memory", "recall_memory"]) {
    assert.ok(!text.includes(invalid), `instructions must not reference nonexistent tool: ${invalid}`);
  }
  for (const valid of ["view", "create", "edit", "bash", "powershell"]) {
    assert.ok(text.includes(valid), `instructions should mention Copilot tool: ${valid}`);
  }
});
