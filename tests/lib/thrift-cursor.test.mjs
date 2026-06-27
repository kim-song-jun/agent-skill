// Structural + behavioural tests for harness-thrift-cursor.
//
// Covers:
//   - plugin.json shape
//   - SKILL.md frontmatter + the 5 phase files (NO Phase 4)
//   - templates: thrift.config.json.hbs (no cache section),
//                rules/thrift.mdc.hbs (alwaysApply: true),
//                audit-report.md.hbs
//   - lib/config-loader.mjs (no cache validation)
//   - lib/cost-estimator.mjs (independent copy)
//   - bin/install.mjs end-to-end render against a tmp target
//   - bin/lib/render.mjs matches the harness-builder source-of-truth

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const PLUGIN_ROOT = "plugins/harness-thrift-cursor";
const SKILL_ROOT = `${PLUGIN_ROOT}/skills/thrift-cursor`;
const INSTALL_SCRIPT = resolve(`${PLUGIN_ROOT}/bin/install.mjs`);

import {
  loadConfig,
  DEFAULTS,
} from "../../plugins/harness-thrift-cursor/skills/thrift-cursor/lib/config-loader.mjs";
import {
  estimate,
  estimateSession,
  SUPPORTED_MODELS,
} from "../../plugins/harness-thrift-cursor/skills/thrift-cursor/lib/cost-estimator.mjs";

function runInstall(args) {
  return spawnSync("node", [INSTALL_SCRIPT, ...args], { encoding: "utf-8" });
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "thrift-cursor-"));
}

// ---------- plugin.json ----------

test("plugin.json: name + version match the spec", () => {
  const p = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf-8"));
  assert.equal(p.name, "harness-thrift-cursor");
  assert.equal(p.version, "0.7.12");
  assert.match(p.description, /Cursor/);
  assert.match(p.description, /advisory/i);
  assert.ok(Array.isArray(p.keywords) && p.keywords.includes("cursor"));
});

// ---------- SKILL.md ----------

test("SKILL.md: has canonical thrift name frontmatter", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: thrift/);
  assert.match(md, /Cursor port/);
  assert.match(md, /advisory/i);
});

// ---------- phases ----------

test("phases: 5 files exist (0,1,2-instrument-as-rule,3,5 — NO 4-cache-prime)", () => {
  const expected = [
    "0-preflight.md",
    "1-config.md",
    "2-instrument-as-rule.md",
    "3-summariser.md",
    "5-audit.md",
  ];
  for (const f of expected) {
    assert.ok(
      existsSync(resolve(SKILL_ROOT, "phases", f)),
      `phase file missing: ${f}`,
    );
  }
  // Phase 4 cache-prime must NOT exist
  assert.ok(
    !existsSync(resolve(SKILL_ROOT, "phases/4-cache-prime.md")),
    "phase 4 cache-prime must be removed for Cursor port",
  );
});

test("phases: heading line matches phase contract", () => {
  const cases = [
    ["0-preflight.md", "# Phase 0 — Preflight"],
    ["1-config.md", "# Phase 1 — Config"],
    ["2-instrument-as-rule.md", "# Phase 2 — Instrument as rule"],
    ["3-summariser.md", "# Phase 3 — Summariser"],
    ["5-audit.md", "# Phase 5 — Audit (textual recap)"],
  ];
  for (const [file, heading] of cases) {
    const body = readFileSync(resolve(SKILL_ROOT, "phases", file), "utf-8");
    assert.ok(body.startsWith(heading), `${file} should start with "${heading}"`);
  }
});

// ---------- templates ----------

test("templates: thrift.config.json.hbs omits cache section", () => {
  const tpl = readFileSync(resolve(SKILL_ROOT, "templates/thrift.config.json.hbs"), "utf-8");
  assert.ok(tpl.includes("summariser"));
  assert.ok(tpl.includes("contextMode"));
  assert.ok(tpl.includes("audit"));
  assert.ok(!tpl.includes('"cache"'), "Cursor port must omit `cache` section");
  assert.ok(!tpl.includes("primingStrategy"), "Cursor port must omit cache fields");
});

test("templates: rules/thrift.mdc.hbs has alwaysApply: true", () => {
  const tpl = readFileSync(resolve(SKILL_ROOT, "templates/rules/thrift.mdc.hbs"), "utf-8");
  assert.match(tpl, /^---/);
  assert.match(tpl, /alwaysApply:\s*true/);
  assert.match(tpl, /\{\{everyNTurns\}\}/);
  assert.match(tpl, /\{\{everyMTokensOutput\}\}/);
});

test("templates: audit-report.md.hbs documents Cursor caveats", () => {
  const tpl = readFileSync(resolve(SKILL_ROOT, "templates/audit-report.md.hbs"), "utf-8");
  assert.match(tpl, /Cursor/);
  assert.match(tpl, /advisory/i);
  // Recap shape preserved
  assert.match(tpl, /Cost summary/);
  assert.match(tpl, /Token usage/);
});

// ---------- references ----------

test("references: porting-notes.md exists and references source-of-truth", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.match(body, /Claude Code/);
  assert.match(body, /Cursor/);
  assert.match(body, /no programmatic hook/i);
  assert.match(body, /cache/i);
});

// ---------- config-loader (no cache validation) ----------

test("config-loader: DEFAULTS has NO cache section", () => {
  assert.ok(!("cache" in DEFAULTS), "Cursor DEFAULTS must omit cache section");
  assert.ok("summariser" in DEFAULTS);
  assert.ok("contextMode" in DEFAULTS);
  assert.ok("audit" in DEFAULTS);
  assert.equal(DEFAULTS.audit.estimateBaseline, "naive-cursor");
  assert.equal(DEFAULTS.audit.outputPath, ".agent-skill/reports/thrift/cursor-recap-<date>.md");
});

test("config-loader: returns DEFAULTS with warning when path missing", () => {
  const r = loadConfig("/tmp/nonexistent/.thrift.json");
  assert.equal(r.ok, true);
  assert.equal(r.config.summariser.everyNTurns, 25);
  assert.match(r.warning, /not found/);
});

test("config-loader: accepts config WITHOUT a cache section", () => {
  const dir = makeTmp();
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify(DEFAULTS));
    const r = loadConfig(p);
    assert.equal(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: tolerates extra cache keys (ignored)", () => {
  const dir = makeTmp();
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      cache: { ignored: true, primingStrategy: "tools-only" },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config-loader: surfaces summariser field errors", () => {
  const dir = makeTmp();
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      summariser: { ...DEFAULTS.summariser, everyNTurns: -1 },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map((e) => e.field);
    assert.ok(fields.includes("summariser.everyNTurns"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- cost-estimator ----------

test("cost-estimator: independent copy supports 3 models", () => {
  assert.deepEqual(SUPPORTED_MODELS.sort(), [
    "claude-haiku-4-5-20251001",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
  ]);
});

test("cost-estimator: zero usage → zero cost", () => {
  const r = estimate({ tokensInUncached: 0, tokensInCached: 0, tokensOut: 0, model: "claude-sonnet-4-6" });
  assert.equal(r.actualUSD, 0);
  assert.equal(r.baselineUSD, 0);
});

test("cost-estimator: estimateSession aggregates per-model", () => {
  const records = [
    { tokensInUncached: 100_000, tokensInCached: 0, tokensOut: 10_000, model: "claude-sonnet-4-6" },
    { tokensInUncached: 200_000, tokensInCached: 0, tokensOut: 1_000, model: "claude-haiku-4-5-20251001" },
  ];
  const r = estimateSession(records);
  assert.ok(r.actualUSD > 0);
  assert.equal(r.perModel["claude-sonnet-4-6"].calls, 1);
  assert.equal(r.perModel["claude-haiku-4-5-20251001"].calls, 1);
});

// ---------- bin/install.mjs ----------

test("install: missing target → exit 1 with usage error", () => {
  const res = runInstall([]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
});

test("install: nonexistent target dir → exit 1", () => {
  const res = runInstall(["/tmp/definitely-not-here-thrift-cursor-xyz"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /target directory does not exist/);
});

test("install: fresh tmp dir writes .thrift.json (no cache) + .cursor/rules/thrift.mdc", () => {
  const target = makeTmp();
  try {
    const res = runInstall([target]);
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);

    // .thrift.json
    assert.ok(existsSync(resolve(target, ".thrift.json")));
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.summariser.everyNTurns, 25);
    assert.equal(cfg.summariser.model, "claude-haiku-4-5-20251001");
    assert.ok(!("cache" in cfg), "rendered config must NOT have a cache section");

    // .cursor/rules/thrift.mdc
    const rulePath = resolve(target, ".cursor/rules/thrift.mdc");
    assert.ok(existsSync(rulePath));
    const rule = readFileSync(rulePath, "utf-8");
    assert.match(rule, /alwaysApply:\s*true/);
    assert.match(rule, /thrift/);
    // Threshold variables interpolated, not raw {{...}}
    assert.ok(!rule.includes("{{everyNTurns}}"), "everyNTurns should be interpolated");
    assert.match(rule, /\b25\b/);

    // No hook scripts, no settings.local.json
    assert.ok(!existsSync(resolve(target, ".claude")));
    assert.ok(!existsSync(resolve(target, ".cursor/rules/thrift.mdc.hbs")));
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
    assert.ok(!existsSync(resolve(target, ".cursor")));
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
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.existing, true);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install: --force overwrites existing files", () => {
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

test("install: --uninstall removes Cursor thrift artifacts", () => {
  const target = makeTmp();
  try {
    const install = runInstall([target]);
    assert.equal(install.status, 0, install.stderr);

    const res = runInstall([target, "--uninstall"]);
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);
    assert.match(res.stdout, /removed=2/);
    assert.ok(!existsSync(resolve(target, ".thrift.json")), "uninstall should remove .thrift.json");
    assert.ok(!existsSync(resolve(target, ".cursor/rules/thrift.mdc")), "uninstall should remove Cursor thrift rule");
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
    // Rule reflects the override too
    const rule = readFileSync(resolve(target, ".cursor/rules/thrift.mdc"), "utf-8");
    assert.match(rule, /\b50\b/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

// ---------- render.mjs vendored copy ----------

test("render.mjs: vendored copy is byte-identical to harness-builder source-of-truth", () => {
  const src = readFileSync("plugins/harness-builder/skills/agent-init/lib/render.mjs", "utf-8");
  const vendored = readFileSync(`${PLUGIN_ROOT}/bin/lib/render.mjs`, "utf-8");
  assert.equal(vendored, src, "bin/lib/render.mjs must match the harness-builder source-of-truth");
});
