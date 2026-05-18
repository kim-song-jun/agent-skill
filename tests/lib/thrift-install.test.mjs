import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = resolve("plugins/harness-thrift/bin/install.mjs");

function runInstall(args) {
  return spawnSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "thrift-install-"));
}

test("install: missing target → exit 1 with usage error", () => {
  const res = runInstall([]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
});

test("install: nonexistent target dir → exit 1", () => {
  const res = runInstall(["/tmp/definitely-not-here-thrift-xyz"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /target directory does not exist/);
});

test("install: fresh tmp dir creates .thrift.json + hooks + lib", () => {
  const target = makeTmp();
  try {
    const res = runInstall([target]);
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);

    // .thrift.json
    assert.ok(existsSync(resolve(target, ".thrift.json")));
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.summariser.everyNTurns, 25);
    assert.equal(cfg.summariser.model, "claude-haiku-4-5-20251001");

    // Hook scripts
    const hookFiles = readdirSync(resolve(target, ".claude/hooks"))
      .filter((n) => n.startsWith("thrift-") && n.endsWith(".mjs"));
    assert.ok(hookFiles.length >= 5, `expected ≥5 thrift-*.mjs scripts, got ${hookFiles.length}: ${hookFiles.join(", ")}`);

    // chmod +x on at least one (non-fatal on platforms without it)
    const mode = statSync(resolve(target, ".claude/hooks", hookFiles[0])).mode;
    assert.ok((mode & 0o100) !== 0, "hook script should be executable");

    // Lib copied
    const libFiles = readdirSync(resolve(target, ".claude/hooks/lib"))
      .filter((n) => n.endsWith(".mjs"));
    assert.ok(libFiles.length >= 5, `expected ≥5 lib modules, got ${libFiles.length}`);
    assert.ok(libFiles.includes("settings-patcher.mjs"));
    assert.ok(libFiles.includes("render.mjs"));

    // Audit template
    assert.ok(existsSync(resolve(target, ".claude/hooks/audit-report.md.hbs")));

    // Import paths rewritten in rendered hooks
    const sample = readFileSync(resolve(target, ".claude/hooks/thrift-posttool-summariser-trigger.mjs"), "utf-8");
    assert.ok(!sample.includes('"../../lib/'), "should rewrite ../../lib/ imports");
    assert.ok(sample.includes('"./lib/'), "should use ./lib/ paths");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: --dry-run does not write files", () => {
  const target = makeTmp();
  try {
    const res = runInstall([target, "--dry-run"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!existsSync(resolve(target, ".thrift.json")));
    assert.ok(!existsSync(resolve(target, ".claude")));
    assert.match(res.stdout, /would write/);
    assert.match(res.stdout, /dry-run:\s+yes/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: refuses to overwrite existing .thrift.json without --force", () => {
  const target = makeTmp();
  try {
    writeFileSync(resolve(target, ".thrift.json"), '{"existing":true}');
    const res = runInstall([target]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Refusing to overwrite/);
    // Original preserved
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.existing, true);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: --force overwrites existing .thrift.json", () => {
  const target = makeTmp();
  try {
    writeFileSync(resolve(target, ".thrift.json"), '{"existing":true}');
    const res = runInstall([target, "--force"]);
    assert.equal(res.status, 0, res.stderr);
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.existing, undefined);
    assert.equal(cfg.summariser.everyNTurns, 25);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: --no-instrument skips settings.local.json patch", () => {
  const target = makeTmp();
  try {
    const res = runInstall([target, "--no-instrument"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(resolve(target, ".thrift.json")));
    assert.ok(!existsSync(resolve(target, ".claude/settings.local.json")),
      "settings.local.json should not be created");
    assert.match(res.stdout, /instrument:\s+no/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: default run patches .claude/settings.local.json with 5 thrift hooks", () => {
  const target = makeTmp();
  try {
    const res = runInstall([target]);
    assert.equal(res.status, 0, res.stderr);
    const sp = resolve(target, ".claude/settings.local.json");
    assert.ok(existsSync(sp), "settings.local.json should be written");
    const settings = JSON.parse(readFileSync(sp, "utf-8"));
    // 2 PreToolUse + 1 PostToolUse + 1 SessionStart + 1 SessionEnd = 5
    let total = 0;
    for (const arr of Object.values(settings.hooks)) total += arr.length;
    assert.equal(total, 5);
    assert.ok(settings.hooks.PreToolUse?.some((e) =>
      e.hooks.some((h) => /thrift-pretool-bash-telemetry/.test(h.command))));
    assert.match(res.stdout, /applied=5/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: --ctx overrides default values", () => {
  const target = makeTmp();
  const ctxPath = join(target, "ctx.json");
  try {
    writeFileSync(ctxPath, JSON.stringify({ everyNTurns: 50, summariserModel: "custom-model" }));
    const res = runInstall([target, "--ctx", ctxPath, "--force"]);
    assert.equal(res.status, 0, res.stderr);
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.summariser.everyNTurns, 50);
    assert.equal(cfg.summariser.model, "custom-model");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
