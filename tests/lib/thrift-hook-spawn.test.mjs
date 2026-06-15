// thrift-hook-spawn — render + SPAWN coverage for the thrift hook templates.
//
// The thrift hooks import their lib modules via `import("../../lib/<x>.mjs")`,
// which only resolves if the installer (a) rewrites the path to `./lib/` and
// (b) copies the lib tree next to the hook. The phase-2 "instrument" flow
// historically skipped both, so every fired hook threw ERR_MODULE_NOT_FOUND —
// silently, for the audit hook (`main().catch(() => process.exit(0))`).
//
// The lib-import unit tests never spawn a hook, so they could not catch this.
// These tests render + write + SPAWN a real hook and assert behaviour, with a
// negative control that reproduces the broken-render path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const INSTALL = resolve("plugins/harness-thrift/bin/install.mjs");
const AUDIT_TEMPLATE = resolve(
  "plugins/harness-thrift/skills/thrift/templates/hooks/thrift-sessionend-audit.mjs.hbs",
);

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function datedReportPath(target) {
  const cfg = JSON.parse(readFileSync(join(target, ".thrift.json"), "utf-8"));
  const date = new Date().toISOString().slice(0, 10);
  return join(target, cfg.audit.outputPath.replace("<date>", date));
}

test("thrift hook spawn: installer-produced sessionend-audit hook resolves its libs and writes the report", () => {
  const target = tmp("thrift-pos-");
  try {
    const inst = spawnSync("node", [INSTALL, target], { encoding: "utf-8" });
    assert.equal(inst.status, 0, `install failed: ${inst.stderr}`);

    const hook = join(target, ".claude/hooks/thrift-sessionend-audit.mjs");
    assert.ok(existsSync(hook), "audit hook must be installed");
    assert.ok(
      existsSync(join(target, ".claude/hooks/lib/config-loader.mjs")),
      "lib must be copied beside the hooks (./lib/) so the rewritten import resolves",
    );

    const res = spawnSync("node", [hook], {
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: target },
    });
    assert.match(
      res.stderr,
      /thrift audit written:/,
      `hook did not reach its success path — lib import likely failed; stderr=${res.stderr}`,
    );
    assert.ok(existsSync(datedReportPath(target)), "audit report file must be written");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("thrift hook spawn: a hook rendered WITHOUT the lib copy + import rewrite silently no-ops (regression guard for the 2-instrument gap)", () => {
  const target = tmp("thrift-neg-");
  const seed = tmp("thrift-seed-");
  try {
    // Seed a valid .thrift.json so a missing config is NOT what stops the hook —
    // the only defect under test is the unresolved `../../lib/` import.
    const inst = spawnSync("node", [INSTALL, seed], { encoding: "utf-8" });
    assert.equal(inst.status, 0, `seed install failed: ${inst.stderr}`);
    mkdirSync(join(target, ".claude/hooks"), { recursive: true });
    writeFileSync(join(target, ".thrift.json"), readFileSync(join(seed, ".thrift.json")));

    // Reproduce the OLD broken phase-2 behaviour: render the hook but DO NOT
    // rewrite `../../lib/` and DO NOT copy any lib next to it. (The audit
    // template carries no handlebars placeholders, so the raw bytes equal the
    // rendered output for this hook.)
    const hook = join(target, ".claude/hooks/thrift-sessionend-audit.mjs");
    writeFileSync(hook, readFileSync(AUDIT_TEMPLATE, "utf-8"));
    chmodSync(hook, 0o755);

    const res = spawnSync("node", [hook], {
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: target },
    });
    assert.doesNotMatch(
      res.stderr,
      /thrift audit written:/,
      "without the lib copy the import must fail and the hook must NOT reach its success path",
    );
    assert.ok(
      !existsSync(datedReportPath(target)),
      "a hook with unresolved lib imports must not write a report",
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(seed, { recursive: true, force: true });
  }
});
