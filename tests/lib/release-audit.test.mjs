import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runReleaseAudit } from "../../scripts/release-audit.mjs";

test("release audit reports Claude and Codex as independently ready", () => {
  const result = runReleaseAudit({ root: process.cwd(), platforms: ["claude", "codex"] });

  assert.equal(result.ok, true);
  assert.equal(result.platforms.claude.ok, true);
  assert.equal(result.platforms.codex.ok, true);
  assert.ok(result.platforms.claude.checks.length >= 6);
  assert.ok(result.platforms.codex.checks.length >= 6);
  assert.match(result.platforms.claude.summary, /Claude/i);
  assert.match(result.platforms.codex.summary, /Codex/i);
});

test("release audit CLI emits machine-readable JSON", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-audit.mjs"), "--json"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const data = JSON.parse(res.stdout);
  assert.equal(data.ok, true);
  assert.equal(data.platforms.claude.ok, true);
  assert.equal(data.platforms.codex.ok, true);
});

test("release audit CLI emits human-readable platform summaries", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-audit.mjs")], {
    encoding: "utf-8",
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, output);
  assert.match(output, /release readiness audit: ok/i);
  assert.match(output, /Claude: ok/i);
  assert.match(output, /Codex: ok/i);
});

test("release audit reports missing contract text files as failed checks", () => {
  const root = mkdtempSync(resolve(tmpdir(), "release-audit-"));
  mkdirSync(resolve(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    resolve(root, ".claude-plugin/marketplace.json"),
    JSON.stringify({
      plugins: [
        { name: "harness-builder" },
        { name: "harness-floor" },
        { name: "harness-thrift" },
        { name: "harness-explore" },
        { name: "harness-debug" },
      ],
    }),
  );

  const result = runReleaseAudit({ root, platforms: ["claude"] });

  assert.equal(result.ok, false);
  assert.equal(result.platforms.claude.ok, false);
  assert.ok(
    result.platforms.claude.checks.some(
      (check) => !check.ok && check.name.includes("CLAUDE.md.hbs") && check.details === "missing",
    ),
  );
});
