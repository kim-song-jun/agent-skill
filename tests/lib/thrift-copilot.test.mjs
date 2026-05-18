// Tests for harness-thrift-copilot — Theme B per-platform port for
// GitHub Copilot CLI.
//
// Covers:
//   - config-loader: DEFAULTS, validation, Copilot-specific storeMemory section
//   - settings-patcher: append, skip-on-rerun, unpatch, sentinel revert,
//     refuses unparseable, dry-run
//   - cost-estimator: zero usage, full uncached, cache savings, unknown
//     model rejection, OpenAI rate table
//   - store-memory-bridge: file fallback round-trip, MCP invoker
//     short-circuit
//   - install: missing target, fresh-dir install, --dry-run, --no-instrument,
//     --force overwrites

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  loadConfig,
  DEFAULTS,
} from "../../plugins/harness-thrift-copilot/skills/thrift-copilot/lib/config-loader.mjs";
import {
  patchHooks,
  unpatchHooks,
  buildStandardThriftHooks,
} from "../../plugins/harness-thrift-copilot/skills/thrift-copilot/lib/settings-patcher.mjs";
import {
  estimate,
  estimateSession,
  SUPPORTED_MODELS,
  RATE_TABLE_PROVENANCE,
} from "../../plugins/harness-thrift-copilot/skills/thrift-copilot/lib/cost-estimator.mjs";
import {
  storeMemoryWrite,
  storeMemoryRead,
  storeMemoryProbe,
} from "../../plugins/harness-thrift-copilot/skills/thrift-copilot/lib/store-memory-bridge.mjs";

const INSTALL_SCRIPT = resolve("plugins/harness-thrift-copilot/bin/install.mjs");

function tmp(prefix = "thrift-copilot-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runInstall(args) {
  return spawnSync("node", [INSTALL_SCRIPT, ...args], { encoding: "utf-8" });
}

// ---------- config-loader ----------

test("[copilot] config-loader: DEFAULTS includes storeMemory + cache.intermediationWarning", () => {
  const r = loadConfig(null);
  assert.equal(r.ok, true);
  assert.equal(r.config.summariser.model, "gpt-5-nano");
  assert.equal(r.config.cache.enabled, false, "Phase 4 should default to disabled on Copilot");
  assert.equal(r.config.cache.intermediationWarning, true, "intermediation warning should default to true");
  assert.equal(r.config.storeMemory.enabled, true);
  assert.equal(r.config.storeMemory.scope, "repository");
  assert.equal(r.config.platform, "copilot");
});

test("[copilot] config-loader: returns DEFAULTS + warning when path missing", () => {
  const r = loadConfig("/tmp/nonexistent-copilot/.thrift.json");
  assert.equal(r.ok, true);
  assert.match(r.warning, /not found/);
  assert.equal(r.config.summariser.everyNTurns, 25);
});

test("[copilot] config-loader: parses a valid Copilot config", () => {
  const dir = tmp("thrift-copilot-cl-");
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      summariser: { ...DEFAULTS.summariser, everyNTurns: 50, model: "gpt-5-mini" },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, true);
    assert.equal(r.config.summariser.everyNTurns, 50);
    assert.equal(r.config.summariser.model, "gpt-5-mini");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] config-loader: rejects invalid storeMemory.scope", () => {
  const dir = tmp("thrift-copilot-cl-");
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      storeMemory: { ...DEFAULTS.storeMemory, scope: "nonsense" },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map(e => e.field);
    assert.ok(fields.includes("storeMemory.scope"), `fields: ${fields.join(", ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] config-loader: rejects missing required sections (incl. storeMemory)", () => {
  const dir = tmp("thrift-copilot-cl-");
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({ version: "0.1.0" }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map(e => e.field);
    for (const f of ["summariser", "cache", "contextMode", "audit", "storeMemory"]) {
      assert.ok(fields.includes(f), `missing required-section check: ${f} (got: ${fields.join(", ")})`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- settings-patcher (Copilot variant: .github/hooks/*.json) ----------

test("[copilot] settings-patcher: patches into empty .github/hooks/", () => {
  const dir = tmp("thrift-copilot-patch-");
  try {
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: "/abs/scripts" });
    const res = patchHooks({ hooksDir: dir, hooksToAdd: hooks });
    // 2 preToolUse + 1 postToolUse + 1 sessionStart + 1 agentStop = 5
    assert.equal(res.applied, 5);
    assert.equal(res.skipped, 0);

    const preFile = JSON.parse(readFileSync(resolve(dir, "thrift-preToolUse.json"), "utf-8"));
    assert.equal(preFile.hooks.length, 2);
    assert.match(preFile.hooks[0].command, /thrift-pretool-bash-telemetry/);
    assert.equal(preFile.hooks[0].matcher, "read_bash");

    const postFile = JSON.parse(readFileSync(resolve(dir, "thrift-postToolUse.json"), "utf-8"));
    assert.equal(postFile.hooks.length, 1);

    const sessFile = JSON.parse(readFileSync(resolve(dir, "thrift-sessionStart.json"), "utf-8"));
    assert.equal(sessFile.hooks.length, 1);

    const stopFile = JSON.parse(readFileSync(resolve(dir, "thrift-agentStop.json"), "utf-8"));
    assert.equal(stopFile.hooks.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] settings-patcher: append-only — preserves existing user hooks in same file", () => {
  const dir = tmp("thrift-copilot-patch-");
  try {
    const userFile = resolve(dir, "thrift-preToolUse.json");
    writeFileSync(userFile, JSON.stringify({
      hooks: [{ matcher: "read_bash", command: "node existing-user-hook.mjs" }],
    }));
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: "/abs/scripts" });
    patchHooks({ hooksDir: dir, hooksToAdd: hooks });
    const after = JSON.parse(readFileSync(userFile, "utf-8"));
    // User entry preserved at head; thrift appended after.
    assert.equal(after.hooks[0].command, "node existing-user-hook.mjs");
    assert.equal(after.hooks.length, 3);
    assert.match(after.hooks[1].command, /thrift-pretool-bash-telemetry/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] settings-patcher: skips already-registered entries on re-run", () => {
  const dir = tmp("thrift-copilot-patch-");
  try {
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: "/abs/scripts" });
    patchHooks({ hooksDir: dir, hooksToAdd: hooks });
    const r2 = patchHooks({ hooksDir: dir, hooksToAdd: hooks });
    assert.equal(r2.applied, 0);
    assert.equal(r2.skipped, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] settings-patcher: dry-run does not write", () => {
  const dir = tmp("thrift-copilot-patch-");
  try {
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: "/abs/scripts" });
    const res = patchHooks({ hooksDir: dir, hooksToAdd: hooks, dryRun: true });
    assert.equal(res.applied, 5);
    assert.ok(!existsSync(resolve(dir, "thrift-preToolUse.json")),
      "dry-run must not write any thrift-*.json file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] settings-patcher: refuses to touch unparseable file", () => {
  const dir = tmp("thrift-copilot-patch-");
  try {
    writeFileSync(resolve(dir, "thrift-preToolUse.json"), "{not json}");
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: "/abs/scripts" });
    assert.throws(
      () => patchHooks({ hooksDir: dir, hooksToAdd: hooks }),
      /cannot parse/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] settings-patcher: unpatch removes only thrift entries; deletes empty files", () => {
  const dir = tmp("thrift-copilot-patch-");
  try {
    // Seed user hook + thrift hooks together in preToolUse file.
    const userFile = resolve(dir, "thrift-preToolUse.json");
    writeFileSync(userFile, JSON.stringify({
      hooks: [{ matcher: "read_bash", command: "node user-hook.mjs" }],
    }));
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: "/abs/scripts" });
    patchHooks({ hooksDir: dir, hooksToAdd: hooks });

    // Before unpatch: preToolUse file has 3 hooks (1 user + 2 thrift).
    const before = JSON.parse(readFileSync(userFile, "utf-8"));
    assert.equal(before.hooks.length, 3);

    const res = unpatchHooks({ hooksDir: dir });
    assert.equal(res.removed, 5);

    // User hook preserved.
    const after = JSON.parse(readFileSync(userFile, "utf-8"));
    assert.equal(after.hooks.length, 1);
    assert.match(after.hooks[0].command, /user-hook/);

    // Other event files (which contained ONLY thrift entries) deleted entirely.
    assert.ok(!existsSync(resolve(dir, "thrift-postToolUse.json")),
      "postToolUse file should be deleted when emptied");
    assert.ok(!existsSync(resolve(dir, "thrift-sessionStart.json")),
      "sessionStart file should be deleted when emptied");
    assert.ok(!existsSync(resolve(dir, "thrift-agentStop.json")),
      "agentStop file should be deleted when emptied");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] settings-patcher: unpatch on missing dir is safe no-op", () => {
  const res = unpatchHooks({ hooksDir: "/tmp/definitely-nonexistent-thrift-copilot-xyz" });
  assert.equal(res.removed, 0);
});

test("[copilot] buildStandardThriftHooks: encodes hooksScriptsDir into commands; uses Copilot event names", () => {
  const h = buildStandardThriftHooks({ hooksScriptsDir: "/abs/path/to/scripts" });
  // Events must be camelCase Copilot convention.
  assert.deepEqual(Object.keys(h).sort(), ["agentStop", "postToolUse", "preToolUse", "sessionStart"]);
  // Every command embeds the scripts dir.
  for (const event of Object.values(h)) {
    for (const entry of event) {
      assert.match(entry.command, /\/abs\/path\/to\/scripts\/thrift-/);
    }
  }
  // preToolUse matchers are Copilot tool names.
  assert.equal(h.preToolUse[0].matcher, "read_bash");
  assert.equal(h.preToolUse[1].matcher, "read_file");
});

// ---------- cost-estimator (OpenAI rate table; assumed) ----------

test("[copilot] cost-estimator: supports OpenAI-family models", () => {
  assert.deepEqual(SUPPORTED_MODELS.sort(), ["gpt-5", "gpt-5-mini", "gpt-5-nano", "o4-mini"]);
});

test("[copilot] cost-estimator: rate-table provenance marked 'assumed'", () => {
  assert.equal(RATE_TABLE_PROVENANCE.source, "assumed");
  assert.equal(RATE_TABLE_PROVENANCE.lastVerifiedAt, null);
  assert.match(RATE_TABLE_PROVENANCE.notes, /Verify against current OpenAI pricing/);
});

test("[copilot] cost-estimator: zero usage → zero cost", () => {
  const r = estimate({ tokensInUncached: 0, tokensInCached: 0, tokensOut: 0, model: "gpt-5-nano" });
  assert.equal(r.actualUSD, 0);
  assert.equal(r.baselineUSD, 0);
  assert.equal(r.savedRatio, 0);
});

test("[copilot] cost-estimator: full uncached run → no savings", () => {
  const r = estimate({ tokensInUncached: 1_000_000, tokensInCached: 0, tokensOut: 100_000, model: "gpt-5-nano" });
  // 1M × $0.15 + 100K × $0.60 = $0.15 + $0.06 = $0.21
  assert.equal(r.actualUSD, 0.21);
  assert.equal(r.baselineUSD, 0.21);
  assert.equal(r.savedRatio, 0);
});

test("[copilot] cost-estimator: cached hits produce savings using OpenAI 0.5× multiplier", () => {
  const r = estimate({ tokensInUncached: 100_000, tokensInCached: 900_000, tokensOut: 100_000, model: "gpt-5-nano" });
  // actual: 100K × $0.15 + 900K × $0.075 + 100K × $0.60
  //       = 0.015 + 0.0675 + 0.060 = 0.1425
  // baseline: 1M × $0.15 + 100K × $0.60 = 0.15 + 0.06 = 0.21
  // saved: 1 - 0.1425/0.21 ≈ 0.3214
  assert.ok(Math.abs(r.actualUSD - 0.1425) < 1e-4, `actualUSD ${r.actualUSD}`);
  assert.ok(Math.abs(r.baselineUSD - 0.21) < 1e-4, `baselineUSD ${r.baselineUSD}`);
  assert.ok(r.savedRatio > 0.3 && r.savedRatio < 0.35, `savedRatio ${r.savedRatio}`);
});

test("[copilot] cost-estimator: rejects unknown model", () => {
  assert.throws(
    () => estimate({ tokensInUncached: 1, tokensInCached: 0, tokensOut: 1, model: "claude-opus-4-7" }),
    /unknown model rate/,
    "Anthropic models must not be honored by the Copilot port's estimator",
  );
});

test("[copilot] cost-estimator: estimateSession aggregates per-model and exposes provenance", () => {
  const records = [
    { tokensInUncached: 100_000, tokensInCached: 0,       tokensOut: 10_000, model: "gpt-5-nano" },
    { tokensInUncached: 50_000,  tokensInCached: 50_000,  tokensOut: 5_000,  model: "gpt-5-nano" },
    { tokensInUncached: 200_000, tokensInCached: 0,       tokensOut: 1_000,  model: "gpt-5-mini" },
  ];
  const r = estimateSession(records);
  assert.ok(r.actualUSD > 0);
  assert.ok(r.baselineUSD > r.actualUSD, "cache hits should yield savings");
  assert.equal(r.perModel["gpt-5-nano"].calls, 2);
  assert.equal(r.perModel["gpt-5-mini"].calls, 1);
  assert.equal(r.provenance.source, "assumed");
});

// ---------- store-memory-bridge ----------

test("[copilot] store-memory-bridge: file fallback round-trip when invoker absent", async () => {
  const dir = tmp("thrift-copilot-mem-");
  try {
    const wr = await storeMemoryWrite({
      key: "thrift/test-key",
      value: { hello: "world" },
      scope: "repository",
      invoker: null,
      fallbackRoot: dir,
    });
    assert.equal(wr.ok, true);
    assert.equal(wr.mode, "file");
    assert.ok(wr.path.includes(".thrift/store-memory-fallback"));

    const rd = await storeMemoryRead({
      key: "thrift/test-key",
      scope: "repository",
      invoker: null,
      fallbackRoot: dir,
    });
    assert.equal(rd.ok, true);
    assert.equal(rd.mode, "file");
    assert.deepEqual(rd.value, { hello: "world" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] store-memory-bridge: MCP invoker short-circuits file fallback when ok", async () => {
  const dir = tmp("thrift-copilot-mem-");
  let setSeen = null;
  let getSeen = null;
  const memStore = new Map();
  const invoker = async ({ action, key, value, scope }) => {
    if (action === "set") {
      memStore.set(`${scope}/${key}`, value);
      setSeen = { key, value, scope };
      return { ok: true };
    }
    if (action === "get") {
      getSeen = { key, scope };
      const v = memStore.get(`${scope}/${key}`);
      return { ok: true, value: v };
    }
    return { ok: false, error: "unsupported" };
  };
  try {
    const wr = await storeMemoryWrite({
      key: "thrift/test", value: { n: 42 }, scope: "repository", invoker, fallbackRoot: dir,
    });
    assert.equal(wr.mode, "memory");
    assert.equal(setSeen.key, "thrift/test");

    // No file should have been written when MCP path succeeds.
    const fb = resolve(dir, ".thrift/store-memory-fallback");
    assert.ok(!existsSync(fb), "MCP success path must not touch file fallback");

    const rd = await storeMemoryRead({ key: "thrift/test", scope: "repository", invoker, fallbackRoot: dir });
    assert.equal(rd.mode, "memory");
    assert.deepEqual(rd.value, { n: 42 });
    assert.equal(getSeen.key, "thrift/test");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] store-memory-bridge: invoker error → silent file fallback", async () => {
  const dir = tmp("thrift-copilot-mem-");
  const invoker = async () => { throw new Error("MCP unreachable"); };
  try {
    const wr = await storeMemoryWrite({
      key: "thrift/fb", value: { v: 1 }, scope: "repository", invoker, fallbackRoot: dir,
    });
    assert.equal(wr.mode, "file", "should fall back to file when invoker throws");

    const rd = await storeMemoryRead({ key: "thrift/fb", scope: "repository", invoker, fallbackRoot: dir });
    assert.equal(rd.mode, "file");
    assert.deepEqual(rd.value, { v: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[copilot] store-memory-bridge: probe reports round-trip status", async () => {
  const dir = tmp("thrift-copilot-mem-");
  try {
    const probe = await storeMemoryProbe({ invoker: null, scope: "repository", fallbackRoot: dir });
    assert.equal(probe.writeMode, "file");
    assert.equal(probe.readMode, "file");
    assert.equal(probe.roundTripOk, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- install (end-to-end CLI smoke) ----------

test("[copilot] install: missing target → exit 1 with usage error", () => {
  const res = runInstall([]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
});

test("[copilot] install: nonexistent target → exit 1", () => {
  const res = runInstall(["/tmp/definitely-not-here-thrift-copilot-xyz"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /target directory does not exist/);
});

test("[copilot] install: fresh dir creates .thrift.json + .github/hooks tree", () => {
  const target = tmp("thrift-copilot-install-");
  try {
    const res = runInstall([target]);
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);

    // Config
    assert.ok(existsSync(resolve(target, ".thrift.json")));
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.platform, "copilot");
    assert.equal(cfg.summariser.model, "gpt-5-nano");
    assert.equal(cfg.cache.enabled, false);
    assert.equal(cfg.storeMemory.enabled, true);

    // Hook scripts
    const scriptsDir = resolve(target, ".github/hooks/scripts");
    const scripts = readdirSync(scriptsDir).filter((n) => n.startsWith("thrift-") && n.endsWith(".mjs"));
    assert.ok(scripts.length >= 5, `expected ≥5 thrift-*.mjs scripts, got ${scripts.length}: ${scripts.join(", ")}`);

    // chmod +x on at least one (non-fatal on platforms without it)
    const mode = statSync(resolve(scriptsDir, scripts[0])).mode;
    assert.ok((mode & 0o100) !== 0, "hook script should be executable");

    // Lib copied
    const libFiles = readdirSync(resolve(scriptsDir, "lib")).filter((n) => n.endsWith(".mjs"));
    assert.ok(libFiles.includes("config-loader.mjs"));
    assert.ok(libFiles.includes("settings-patcher.mjs"));
    assert.ok(libFiles.includes("store-memory-bridge.mjs"));
    assert.ok(libFiles.includes("render.mjs"));

    // Audit template
    assert.ok(existsSync(resolve(scriptsDir, "audit-report.md.hbs")));

    // Import paths rewritten in rendered hook scripts
    const sample = readFileSync(resolve(scriptsDir, "thrift-posttool-summariser-trigger.mjs"), "utf-8");
    assert.ok(!sample.includes('"../../lib/'), "should rewrite ../../lib/ imports");
    assert.ok(sample.includes('"./lib/'), "should use ./lib/ paths");

    // .github/hooks/thrift-<event>.json registrations
    const hooksDir = resolve(target, ".github/hooks");
    const regs = readdirSync(hooksDir).filter((n) => n.startsWith("thrift-") && n.endsWith(".json"));
    assert.ok(regs.includes("thrift-preToolUse.json"));
    assert.ok(regs.includes("thrift-postToolUse.json"));
    assert.ok(regs.includes("thrift-sessionStart.json"));
    assert.ok(regs.includes("thrift-agentStop.json"));
    // applied=5 in stdout
    assert.match(res.stdout, /applied=5/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("[copilot] install: --dry-run does not write files", () => {
  const target = tmp("thrift-copilot-install-");
  try {
    const res = runInstall([target, "--dry-run"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!existsSync(resolve(target, ".thrift.json")));
    assert.ok(!existsSync(resolve(target, ".github")));
    assert.match(res.stdout, /would write/);
    assert.match(res.stdout, /dry-run:\s+yes/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("[copilot] install: --no-instrument skips hooks/ patches", () => {
  const target = tmp("thrift-copilot-install-");
  try {
    const res = runInstall([target, "--no-instrument"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(resolve(target, ".thrift.json")));
    // Scripts are still written (they're needed for any future opt-in patch),
    // but no thrift-*.json registration files should exist.
    const hooksDir = resolve(target, ".github/hooks");
    if (existsSync(hooksDir)) {
      const regs = readdirSync(hooksDir).filter((n) => n.startsWith("thrift-") && n.endsWith(".json"));
      assert.equal(regs.length, 0, `--no-instrument must not write thrift-*.json registrations (saw: ${regs.join(", ")})`);
    }
    assert.match(res.stdout, /instrument:\s+no/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("[copilot] install: refuses to overwrite existing .thrift.json without --force", () => {
  const target = tmp("thrift-copilot-install-");
  try {
    writeFileSync(resolve(target, ".thrift.json"), '{"existing":true}');
    const res = runInstall([target]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Refusing to overwrite/);
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.existing, true);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("[copilot] install: --force overwrites existing .thrift.json", () => {
  const target = tmp("thrift-copilot-install-");
  try {
    writeFileSync(resolve(target, ".thrift.json"), '{"existing":true}');
    const res = runInstall([target, "--force"]);
    assert.equal(res.status, 0, res.stderr);
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.existing, undefined);
    assert.equal(cfg.summariser.model, "gpt-5-nano");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("[copilot] install: --ctx overrides defaults (custom summariser model)", () => {
  const target = tmp("thrift-copilot-install-");
  const ctxPath = join(target, "ctx.json");
  try {
    writeFileSync(ctxPath, JSON.stringify({ everyNTurns: 50, summariserModel: "o4-mini" }));
    const res = runInstall([target, "--ctx", ctxPath, "--force"]);
    assert.equal(res.status, 0, res.stderr);
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.summariser.everyNTurns, 50);
    assert.equal(cfg.summariser.model, "o4-mini");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
