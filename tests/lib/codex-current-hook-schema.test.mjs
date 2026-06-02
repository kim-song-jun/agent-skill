import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const LIVE_CODEX_PATHS = [
  "plugins/harness-builder-codex",
  "plugins/harness-thrift-codex",
  "plugins/harness-floor-codex",
];

const STALE_PATTERNS = [
  /\[\[hooks\.pre_tool_use\]\]/,
  /\[\[hooks\.post_tool_use\]\]/,
  /\[\[hooks\.session_start\]\]/,
  /\[\[hooks\.session_end\]\]/,
  /\[\[hooks\.agent\]\]/,
  /matcher = "shell_command"/,
  /timeout_seconds/,
];

test("live Codex generators do not emit stale hook TOML schema", () => {
  const rg = spawnSync(
    "rg",
    [
      "--files",
      ...LIVE_CODEX_PATHS,
      "-g",
      "*.md",
      "-g",
      "*.mjs",
      "-g",
      "*.hbs",
      "-g",
      "*.toml",
    ],
    { encoding: "utf-8" },
  );
  assert.equal(rg.status, 0, rg.stderr);

  const offenders = [];
  for (const rel of rg.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    const body = readFileSync(resolve(rel), "utf-8");
    for (const pattern of STALE_PATTERNS) {
      if (pattern.test(body)) {
        offenders.push(`${rel}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
