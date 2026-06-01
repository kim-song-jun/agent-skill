import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CODEX_INIT = resolve("plugins/harness-builder-codex/bin/init.mjs");

function read(path) {
  return readFileSync(resolve(path), "utf-8");
}

test("codex-init CLI help documents canonical release flags", () => {
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

test("codex-init CLI rejects unknown flags before target resolution", () => {
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
});
