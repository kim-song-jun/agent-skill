import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadConfig, DEFAULTS } from "../../plugins/harness-thrift-codex/skills/thrift-codex/lib/config-loader.mjs";
import { estimate, estimateSession, SUPPORTED_MODELS, CACHE_READ_MULTIPLIER } from "../../plugins/harness-thrift-codex/skills/thrift-codex/lib/cost-estimator.mjs";
import {
  patchCodexConfig,
  unpatchCodexConfig,
  buildStandardThriftCodexHooks,
} from "../../plugins/harness-thrift-codex/skills/thrift-codex/lib/settings-patcher.mjs";

const PLUGIN_ROOT = "plugins/harness-thrift-codex";
const SKILL_ROOT = `${PLUGIN_ROOT}/skills/thrift-codex`;

function tmp() {
  return mkdtempSync(join(tmpdir(), "thrift-codex-"));
}

// ---------- plugin scaffold layout ----------

test("plugin.json exists with correct name and v0.6.12", () => {
  const p = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf-8"));
  assert.equal(p.name, "harness-thrift-codex");
  assert.equal(p.version, "0.6.12");
  assert.match(p.description, /Codex/);
  assert.ok(p.keywords.includes("codex"));
});

test("SKILL.md exists with name frontmatter and Codex-specific surface", () => {
  const md = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf-8");
  assert.match(md, /^---\nname: thrift\n/);
  assert.ok(md.includes("Codex CLI"));
  assert.ok(md.includes("~/.codex/config.toml"));
  assert.ok(md.includes("[hooks]"));
});

test("all 6 phase files exist with matching headings", () => {
  const cases = [
    ["0-preflight.md", "# Phase 0 — Preflight"],
    ["1-config.md", "# Phase 1 — Config"],
    ["2-instrument.md", "# Phase 2 — Instrument"],
    ["3-summariser.md", "# Phase 3 — Summariser"],
    ["4-cache-prime.md", "# Phase 4 — Cache prime"],
    ["5-audit.md", "# Phase 5 — Audit"],
  ];
  for (const [file, heading] of cases) {
    const p = resolve(SKILL_ROOT, "phases", file);
    assert.ok(existsSync(p), `phase file missing: ${file}`);
    const body = readFileSync(p, "utf-8");
    assert.ok(body.startsWith(heading), `${file} should start with "${heading}"`);
  }
});

test("templates: config + audit + 5 TOML hook templates exist", () => {
  assert.ok(existsSync(resolve(SKILL_ROOT, "templates/thrift.config.json.hbs")));
  assert.ok(existsSync(resolve(SKILL_ROOT, "templates/audit-report.md.hbs")));
  const hookTpls = readdirSync(resolve(SKILL_ROOT, "templates/hooks"))
    .filter((n) => n.endsWith(".toml.hbs"));
  assert.equal(hookTpls.length, 5, `expected 5 TOML hook templates, got ${hookTpls.length}: ${hookTpls.join(", ")}`);
  // Every snippet must carry start + end sentinels
  for (const f of hookTpls) {
    const body = readFileSync(resolve(SKILL_ROOT, "templates/hooks", f), "utf-8");
    const name = f.replace(/\.toml\.hbs$/, "");
    assert.ok(body.includes(`# thrift: ${name}`), `${f} missing start sentinel`);
    assert.ok(body.includes(`# end thrift: ${name}`), `${f} missing end sentinel`);
    assert.ok(body.includes("[[hooks."), `${f} should use TOML array-of-tables`);
    assert.ok(body.includes(".hooks]]"), `${f} should use nested Codex command hooks`);
    assert.ok(body.includes(`type = "command"`), `${f} should register a command hook`);
    assert.ok(!body.includes("timeout_seconds"), `${f} should use current Codex timeout key`);
  }
});

test("porting-notes document release caveats without placeholder language", () => {
  const body = readFileSync(resolve(SKILL_ROOT, "references/porting-notes.md"), "utf-8");
  assert.ok(body.includes("TOML"));
  assert.ok(body.includes("sentinel"));
  assert.ok(body.includes("Release caveats"));
  assert.ok(body.includes("gpt-5-nano"));
  assert.ok(body.includes("exec_command"));
  assert.doesNotMatch(body, /TBD|placeholder|remaining work/i);
});

test("thrift-codex release docs describe model default as overrideable, not placeholder", () => {
  for (const rel of [
    "README.md",
    "skills/thrift-codex/phases/1-config.md",
    "skills/thrift-codex/phases/3-summariser.md",
    "skills/thrift-codex/lib/config-loader.mjs",
  ]) {
    const body = readFileSync(resolve(PLUGIN_ROOT, rel), "utf-8");
    assert.match(body, /gpt-5-nano/);
    assert.doesNotMatch(body, /TBD|placeholder|Future \(v2\)|when Codex ships/i, rel);
  }

  const phase3 = readFileSync(resolve(SKILL_ROOT, "phases/3-summariser.md"), "utf-8");
  assert.match(phase3, /Release default[\s\S]{0,180}heuristicSummariseFn/);
  assert.match(phase3, /dependency-free[\s\S]{0,160}no model call/i);
  assert.match(phase3, /Model-backed extension point/i);
  assert.match(phase3, /gpt-5-nano` is the packaged deployment default/i);
});

// ---------- config-loader ----------

test("config-loader: DEFAULTS use Codex-appropriate summariser + baseline", () => {
  assert.equal(DEFAULTS.summariser.model, "gpt-5-nano");
  assert.equal(DEFAULTS.audit.estimateBaseline, "naive-codex");
  assert.equal(DEFAULTS.audit.outputPath, ".agent-skill/reports/thrift/audit-<date>.md");
  assert.equal(DEFAULTS.cache.enabled, false);
});

test("config-loader: missing path returns DEFAULTS with warning", () => {
  const r = loadConfig("/tmp/nonexistent/.thrift.json-codex");
  assert.equal(r.ok, true);
  assert.equal(r.config.summariser.everyNTurns, 25);
  assert.match(r.warning, /not found/);
  assert.match(r.warning, /Run \/thrift to seed/);
  assert.doesNotMatch(r.warning, /Run \/thrift-codex/);
});

test("config-loader: rejects field-level errors", () => {
  const dir = tmp();
  const p = join(dir, ".thrift.json");
  try {
    writeFileSync(p, JSON.stringify({
      ...DEFAULTS,
      summariser: { ...DEFAULTS.summariser, everyNTurns: -1 },
      cache: { ...DEFAULTS.cache, warmInterval: 999 },
    }));
    const r = loadConfig(p);
    assert.equal(r.ok, false);
    const fields = r.errors.map((e) => e.field);
    assert.ok(fields.includes("summariser.everyNTurns"));
    assert.ok(fields.includes("cache.warmInterval"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- cost-estimator (OpenAI rates) ----------

test("cost-estimator: independent OpenAI rate table (no Anthropic models)", () => {
  // None of the Claude family
  for (const m of SUPPORTED_MODELS) {
    assert.ok(!m.startsWith("claude-"), `Codex rate table should not include ${m}`);
  }
  // Must include the canonical Codex-accessible families
  assert.ok(SUPPORTED_MODELS.includes("gpt-5"));
  assert.ok(SUPPORTED_MODELS.includes("gpt-5-nano"));
  assert.ok(SUPPORTED_MODELS.includes("o4-mini"));
});

test("cost-estimator: documents 0.5× cache-read multiplier", () => {
  assert.equal(CACHE_READ_MULTIPLIER, 0.5);
});

test("cost-estimator: zero usage → zero cost and zero savings", () => {
  const r = estimate({ tokensInUncached: 0, tokensInCached: 0, tokensOut: 0, model: "gpt-5" });
  assert.equal(r.actualUSD, 0);
  assert.equal(r.baselineUSD, 0);
  assert.equal(r.savedRatio, 0);
});

test("cost-estimator: cached hits produce meaningful savings", () => {
  // 100K uncached + 900K cached + 100K out on gpt-5
  // actual: 100K×$10 + 900K×$5 + 100K×$30 = $1 + $4.5 + $3 = $8.5
  // baseline: 1M×$10 + 100K×$30 = $10 + $3 = $13
  // saved = 1 - 8.5/13 ≈ 0.3461 (cache-read is half of input rate, so smaller savings than Anthropic 0.1×)
  const r = estimate({ tokensInUncached: 100_000, tokensInCached: 900_000, tokensOut: 100_000, model: "gpt-5" });
  assert.equal(r.actualUSD, 8.5);
  assert.equal(r.baselineUSD, 13);
  assert.ok(r.savedRatio > 0.3 && r.savedRatio < 0.4, `savedRatio ${r.savedRatio} should be ~0.346`);
});

test("cost-estimator: estimateSession aggregates per-model", () => {
  const records = [
    { tokensInUncached: 100_000, tokensInCached: 0, tokensOut: 10_000, model: "gpt-5" },
    { tokensInUncached: 50_000, tokensInCached: 50_000, tokensOut: 5_000, model: "gpt-5" },
    { tokensInUncached: 200_000, tokensInCached: 0, tokensOut: 1_000, model: "gpt-5-nano" },
  ];
  const r = estimateSession(records);
  assert.equal(r.actualUSD, 2.2612);
  assert.equal(r.baselineUSD, 2.5112);
  assert.ok(r.baselineUSD > r.actualUSD, "cached reads must reduce cost vs baseline");
  assert.equal(r.perModel["gpt-5"].calls, 2);
  assert.equal(r.perModel["gpt-5-nano"].calls, 1);
});

test("cost-estimator: rejects unknown model", () => {
  assert.throws(
    () => estimate({ tokensInUncached: 1, tokensInCached: 0, tokensOut: 1, model: "gpt-99-nonexistent" }),
    /unknown model rate/,
  );
});

// ---------- TOML settings-patcher ----------

test("settings-patcher: refuses to create config.toml from scratch", () => {
  const dir = tmp();
  const cp = join(dir, "config.toml");
  try {
    const hooks = buildStandardThriftCodexHooks({ hooksDir: "/abs/.codex/hooks" });
    assert.throws(
      () => patchCodexConfig({ configPath: cp, hooksToAdd: hooks }),
      /does not exist/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: appends all 5 thrift snippets to seeded config.toml", () => {
  const dir = tmp();
  const cp = join(dir, "config.toml");
  try {
    writeFileSync(cp, `# user config\nmodel = "gpt-5"\n\n[hooks]\n`);
    const hooks = buildStandardThriftCodexHooks({ hooksDir: "/abs/.codex/hooks" });
    const res = patchCodexConfig({ configPath: cp, hooksToAdd: hooks });
    assert.equal(res.applied, 5);
    assert.equal(res.skipped, 0);
    const written = readFileSync(cp, "utf-8");
    // Original content preserved at top
    assert.ok(written.startsWith(`# user config\nmodel = "gpt-5"\n\n[hooks]\n`));
    // All 5 sentinels present
    for (const name of Object.keys(hooks)) {
      assert.ok(written.includes(`# thrift: ${name}`), `missing start sentinel for ${name}`);
      assert.ok(written.includes(`# end thrift: ${name}`), `missing end sentinel for ${name}`);
    }
    // Each snippet refers to the hooksDir
    assert.ok(written.includes("/abs/.codex/hooks/thrift-pretool-bash-telemetry.mjs"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: re-run is idempotent (skips already-installed sentinels)", () => {
  const dir = tmp();
  const cp = join(dir, "config.toml");
  try {
    writeFileSync(cp, `[hooks]\n`);
    const hooks = buildStandardThriftCodexHooks({ hooksDir: "/abs/.codex/hooks" });
    patchCodexConfig({ configPath: cp, hooksToAdd: hooks });
    const res2 = patchCodexConfig({ configPath: cp, hooksToAdd: hooks });
    assert.equal(res2.applied, 0);
    assert.equal(res2.skipped, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: dry-run does not write file", () => {
  const dir = tmp();
  const cp = join(dir, "config.toml");
  try {
    const seed = `[hooks]\n`;
    writeFileSync(cp, seed);
    const hooks = buildStandardThriftCodexHooks({ hooksDir: "/abs/.codex/hooks" });
    const res = patchCodexConfig({ configPath: cp, hooksToAdd: hooks, dryRun: true });
    assert.equal(res.applied, 5);
    // File untouched
    assert.equal(readFileSync(cp, "utf-8"), seed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: unpatch removes only thrift blocks, preserves user content", () => {
  const dir = tmp();
  const cp = join(dir, "config.toml");
  try {
    const seed = `# user config\nmodel = "gpt-5"\n\n[[hooks.PreToolUse]]\nmatcher = "^Bash$"\n\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = "node user-hook.mjs"\n`;
    writeFileSync(cp, seed);
    const hooks = buildStandardThriftCodexHooks({ hooksDir: "/abs/.codex/hooks" });
    patchCodexConfig({ configPath: cp, hooksToAdd: hooks });
    const res = unpatchCodexConfig({ configPath: cp });
    assert.equal(res.removed, 5);
    const after = readFileSync(cp, "utf-8");
    // No thrift sentinels left
    assert.ok(!after.includes("# thrift:"));
    assert.ok(!after.includes("# end thrift:"));
    // User content preserved
    assert.ok(after.includes(`model = "gpt-5"`));
    assert.ok(after.includes("[[hooks.PreToolUse]]"));
    assert.ok(after.includes("user-hook.mjs"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("settings-patcher: unpatch on missing file is safe no-op", () => {
  const res = unpatchCodexConfig({ configPath: "/tmp/definitely-not-here-thrift-codex-xyz.toml" });
  assert.equal(res.removed, 0);
});

test("buildStandardThriftCodexHooks: snippets carry sentinels + Codex event names", () => {
  const hooks = buildStandardThriftCodexHooks({ hooksDir: "/h" });
  assert.equal(Object.keys(hooks).length, 5);
  const allBodies = Object.values(hooks).join("\n");
  assert.ok(allBodies.includes("[[hooks.PreToolUse]]"));
  assert.ok(allBodies.includes("[[hooks.PreToolUse.hooks]]"));
  assert.ok(allBodies.includes("[[hooks.PostToolUse]]"));
  assert.ok(allBodies.includes("[[hooks.PostToolUse.hooks]]"));
  assert.ok(allBodies.includes("[[hooks.SessionStart]]"));
  assert.ok(allBodies.includes("[[hooks.SessionStart.hooks]]"));
  assert.ok(allBodies.includes("[[hooks.Stop]]"));
  assert.ok(allBodies.includes("[[hooks.Stop.hooks]]"));
  assert.ok(allBodies.includes(`type = "command"`));
  assert.ok(allBodies.includes("timeout = 10"));
  assert.ok(allBodies.includes("timeout = 15"));
  assert.ok(allBodies.includes("timeout = 30"));
  assert.ok(!allBodies.includes("[[hooks.pre_tool_use]]"));
  assert.ok(!allBodies.includes("[[hooks.post_tool_use]]"));
  assert.ok(!allBodies.includes("[[hooks.session_start]]"));
  assert.ok(!allBodies.includes("[[hooks.session_end]]"));
  assert.ok(!allBodies.includes("timeout_seconds"));
});

// ---------- install.mjs script ----------

test("install.mjs: missing target → exit 1 with usage", () => {
  const SCRIPT = resolve("plugins/harness-thrift-codex/bin/install.mjs");
  const res = spawnSync("node", [SCRIPT], { encoding: "utf-8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
});

test("install.mjs: --no-instrument + --force on fresh target seeds .thrift.json and snippets", () => {
  const SCRIPT = resolve("plugins/harness-thrift-codex/bin/install.mjs");
  const target = tmp();
  try {
    const res = spawnSync("node", [SCRIPT, target, "--no-instrument"], { encoding: "utf-8" });
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);
    // .thrift.json seeded
    assert.ok(existsSync(resolve(target, ".thrift.json")));
    const cfg = JSON.parse(readFileSync(resolve(target, ".thrift.json"), "utf-8"));
    assert.equal(cfg.summariser.everyNTurns, 25);
    assert.equal(cfg.summariser.model, "gpt-5-nano");
    // 5 snippet files rendered
    const tomlSnippets = readdirSync(resolve(target, ".codex/hooks"))
      .filter((n) => n.startsWith("thrift-") && n.endsWith(".toml"));
    assert.equal(tomlSnippets.length, 5);
    // hooksDir absolute path interpolated into the rendered snippets
    const sample = readFileSync(resolve(target, ".codex/hooks/thrift-pretool-bash-telemetry.toml"), "utf-8");
    assert.ok(sample.includes("# thrift: thrift-pretool-bash-telemetry"));
    assert.ok(sample.includes(target));
    assert.match(res.stdout, /instrument:\s+no/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install.mjs: --config <path> patches the user-supplied TOML file", () => {
  const SCRIPT = resolve("plugins/harness-thrift-codex/bin/install.mjs");
  const target = tmp();
  const codexConfig = join(target, "config.toml");
  try {
    writeFileSync(codexConfig, `# seeded\n[hooks]\n`);
    const res = spawnSync("node", [SCRIPT, target, "--config", codexConfig], { encoding: "utf-8" });
    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);
    const patched = readFileSync(codexConfig, "utf-8");
    // All 5 sentinels appeared
    const sentinelCount = (patched.match(/^# thrift:/gm) || []).length;
    assert.equal(sentinelCount, 5);
    assert.match(res.stdout, /applied=5/);
    // Original line preserved
    assert.ok(patched.startsWith(`# seeded\n[hooks]\n`));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
