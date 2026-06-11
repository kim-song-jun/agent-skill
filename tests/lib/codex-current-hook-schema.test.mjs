import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const SCANNED_EXTENSIONS = new Set([".md", ".mjs", ".hbs", ".toml"]);

function listScannedFiles(root) {
  const files = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const rel = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listScannedFiles(rel));
      continue;
    }
    if (entry.isFile() && SCANNED_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      files.push(rel);
    }
  }
  return files.sort();
}

test("live Codex generators do not emit stale hook TOML schema", () => {
  const offenders = [];
  for (const rel of LIVE_CODEX_PATHS.flatMap(listScannedFiles)) {
    const body = readFileSync(resolve(rel), "utf-8");
    for (const pattern of STALE_PATTERNS) {
      if (pattern.test(body)) {
        offenders.push(`${rel}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
