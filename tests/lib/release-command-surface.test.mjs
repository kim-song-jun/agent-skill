import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const CODEX_INIT = resolve("plugins/harness-builder-codex/bin/init.mjs");

function read(path) {
  return readFileSync(resolve(path), "utf-8");
}

function collectFiles(root, predicate) {
  const out = [];
  for (const entry of readdirSync(resolve(root))) {
    const path = `${root}/${entry}`;
    const stats = statSync(resolve(path));
    if (stats.isDirectory()) {
      out.push(...collectFiles(path, predicate));
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}

test("agent-init Codex CLI help documents canonical release flags", () => {
  const res = spawnSync(process.execPath, [CODEX_INIT, "--help"], {
    encoding: "utf-8",
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, output);
  assert.match(output, /Usage: init\.mjs <target-project-dir>/);
  assert.match(output, /--lite/);
  assert.match(output, /--theme=lite/);
  assert.match(output, /--lang=en\|ko\|auto/);
  assert.match(output, /--dry-run/);
  assert.match(output, /--update-foundations/);
  assert.doesNotMatch(output, /target directory does not exist/);
});

test("agent-init Codex CLI rejects unknown flags before target resolution", () => {
  const res = spawnSync(process.execPath, [CODEX_INIT, "--definitely-not-a-flag"], {
    encoding: "utf-8",
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.notEqual(res.status, 0, output);
  assert.match(output, /Unknown flag: --definitely-not-a-flag/);
  assert.match(output, /Usage: init\.mjs <target-project-dir>/);
  assert.doesNotMatch(output, /target directory does not exist/);
});

test("Claude and Codex init skill docs expose the heavy default and lite opt-out", () => {
  const claude = read("plugins/harness-builder/skills/agent-init/SKILL.md");
  const codex = read("plugins/harness-builder-codex/skills/codex-init/SKILL.md");

  assert.match(claude, /Default \(no theme flag\) is operational\/heavy/);
  assert.match(claude, /`--lite`[\s\S]{0,220}canonical lightweight mode/);
  assert.match(claude, /`--theme=lite`[\s\S]{0,160}legacy alias for `--lite`/);
  assert.match(claude, /post-install doctor/i);
  assert.match(codex, /default[\s\S]{0,80}operational and heavy/i);
  assert.match(codex, /`--lite`[\s\S]{0,240}AGENTS and base skills only/);
  assert.match(codex, /`--theme=lite`[\s\S]{0,180}write root\s+AGENTS and base skills only/);
  assert.match(codex, /post-install doctor/i);
  assert.match(codex, /--theme=debug[\s\S]{0,140}debug doctor/i);
  assert.match(codex, /--profile=debug/);
});

test("platform skill ports expose canonical public command names", () => {
  const cases = [
    ["plugins/harness-builder/skills/agent-init/SKILL.md", "agent-init"],
    ["plugins/harness-builder-codex/skills/codex-init/SKILL.md", "agent-init"],
    ["plugins/harness-builder-copilot/skills/copilot-init/SKILL.md", "agent-init"],
    ["plugins/harness-builder-cursor/skills/cursor-init/SKILL.md", "agent-init"],
    ["plugins/harness-builder-gemini/skills/gemini-init/SKILL.md", "agent-init"],
    ["plugins/harness-floor/skills/agent-all/SKILL.md", "agent-all"],
    ["plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md", "agent-all"],
    ["plugins/harness-floor-copilot/skills/agent-all-copilot/SKILL.md", "agent-all"],
    ["plugins/harness-floor-cursor/skills/agent-all-cursor/SKILL.md", "agent-all"],
    ["plugins/harness-floor-gemini/skills/agent-all-gemini/SKILL.md", "agent-all"],
    ["plugins/harness-floor/skills/visual-qa/SKILL.md", "visual-qa"],
    ["plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md", "visual-qa"],
    ["plugins/harness-floor-copilot/skills/visual-qa-copilot/SKILL.md", "visual-qa"],
    ["plugins/harness-floor-cursor/skills/visual-qa-cursor/SKILL.md", "visual-qa"],
    ["plugins/harness-floor-gemini/skills/visual-qa-gemini/SKILL.md", "visual-qa"],
    ["plugins/harness-thrift/skills/thrift/SKILL.md", "thrift"],
    ["plugins/harness-thrift-codex/skills/thrift-codex/SKILL.md", "thrift"],
    ["plugins/harness-thrift-copilot/skills/thrift-copilot/SKILL.md", "thrift"],
    ["plugins/harness-thrift-cursor/skills/thrift-cursor/SKILL.md", "thrift"],
    ["plugins/harness-thrift-gemini/skills/thrift-gemini/SKILL.md", "thrift"],
    ["plugins/harness-debug/skills/debug/SKILL.md", "debug"],
    ["plugins/harness-debug-codex/skills/debug-codex/SKILL.md", "debug"],
  ];

  for (const [path, name] of cases) {
    const body = read(path);
    assert.match(body, new RegExp(`^---\\nname: ${name}\\n`, "m"), path);
    assert.match(body, /^description:\s*(?:>\n\s*)?Use when\b/m, path);
  }
});

test("active plugin docs do not expose platform-suffixed public slash commands", () => {
  const files = collectFiles("plugins", (path) => /\.(md|hbs)$/.test(path));
  const stalePublicCommand =
    /(^|[\s`"'(])(?:\/(?:codex-init|agent-all-(?:codex|copilot|cursor|gemini)|visual-qa-(?:codex|copilot|cursor|gemini)|thrift-codex|debug-codex)|@visual-qa-(?:codex|copilot|cursor|gemini))\b/m;

  for (const path of files) {
    assert.doesNotMatch(read(path), stalePublicCommand, path);
  }
});
