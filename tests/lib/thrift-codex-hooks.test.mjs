import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Regression: thrift-codex registers 5 Codex hooks that invoke
// `node "<hooksDir>/thrift-*.mjs"`. Those .mjs bodies must (a) be produced by
// the installer and (b) actually run under Codex-shaped hook payloads.
// Previously only the .toml registration snippets existed, so every hook failed
// with "Cannot find module".

const INSTALL = resolve(
  "plugins/harness-thrift-codex/bin/install.mjs",
);

const EXPECTED_HOOKS = [
  "thrift-pretool-bash-telemetry.mjs",
  "thrift-pretool-read-coerce.mjs",
  "thrift-posttool-summariser-trigger.mjs",
  "thrift-sessionstart-cache-prime.mjs",
  "thrift-sessionend-audit.mjs",
];

function installTo(target) {
  const r = spawnSync(process.execPath, [INSTALL, target, "--no-instrument", "--force"], { encoding: "utf-8" });
  assert.equal(r.status, 0, `install failed: ${r.stderr}`);
}

function runHook(target, hook, payload) {
  return spawnSync(process.execPath, [join(target, ".codex/hooks", hook)], {
    cwd: target,
    env: { ...process.env, CODEX_PROJECT_DIR: target },
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
}

test("install writes all 5 executable hook bodies + they are valid JS", () => {
  const target = mkdtempSync(join(tmpdir(), "thrift-codex-hooks-"));
  try {
    installTo(target);
    const hooksDir = join(target, ".codex/hooks");
    const present = readdirSync(hooksDir).filter((n) => n.endsWith(".mjs")).sort();
    assert.deepEqual(present, [...EXPECTED_HOOKS].sort(), "all 5 hook .mjs bodies installed");
    for (const h of EXPECTED_HOOKS) {
      const chk = spawnSync(process.execPath, ["--check", join(hooksDir, h)], { encoding: "utf-8" });
      assert.equal(chk.status, 0, `${h} is not valid JS: ${chk.stderr}`);
    }
    // TOML snippets must reference exactly the bodies we ship.
    for (const h of EXPECTED_HOOKS) {
      const toml = readFileSync(join(hooksDir, h.replace(/\.mjs$/, ".toml")), "utf-8");
      assert.match(toml, new RegExp(h.replace(/[.]/g, "\\.")), `${h}.toml references its body`);
    }
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("telemetry hook records a coercion for a large Bash command", () => {
  const target = mkdtempSync(join(tmpdir(), "thrift-codex-hooks-"));
  try {
    installTo(target);
    const r = runHook(target, "thrift-pretool-bash-telemetry.mjs", { tool_input: { command: "git log --oneline" } });
    assert.equal(r.status, 0);
    const state = JSON.parse(readFileSync(join(target, ".thrift-state.json"), "utf-8"));
    assert.ok(state.coercions?.some((c) => c.tool === "Bash"), "Bash coercion recorded");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("summariser-trigger fires a reminder when the turn threshold is hit", () => {
  const target = mkdtempSync(join(tmpdir(), "thrift-codex-hooks-"));
  try {
    installTo(target);
    // Force an immediate fire on the first PostToolUse.
    const cfg = JSON.parse(readFileSync(join(target, ".thrift.json"), "utf-8"));
    cfg.summariser.everyNTurns = 1;
    writeFileSync(join(target, ".thrift.json"), JSON.stringify(cfg));
    const r = runHook(target, "thrift-posttool-summariser-trigger.mjs", { tool_output: "x".repeat(500) });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /thrift summariser ready/, "summariser reminder emitted");
    assert.ok(existsSync(join(target, ".thrift/notifications/summarise.md")), "notification written");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("session-end audit writes a report from accumulated state", () => {
  const target = mkdtempSync(join(tmpdir(), "thrift-codex-hooks-"));
  try {
    installTo(target);
    runHook(target, "thrift-pretool-bash-telemetry.mjs", { tool_input: { command: "find ." } });
    const r = runHook(target, "thrift-sessionend-audit.mjs", {});
    assert.equal(r.status, 0);
    const auditDir = join(target, "docs/thrift");
    assert.ok(existsSync(auditDir), "audit dir created");
    const report = readdirSync(auditDir).find((n) => n.startsWith("audit-") && n.endsWith(".md"));
    assert.ok(report, "audit report written");
    assert.match(readFileSync(join(auditDir, report), "utf-8"), /Thrift audit \(Codex\)/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
