#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PLATFORMS = ["claude", "codex"];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PLATFORM_CONTRACTS = {
  claude: {
    label: "Claude",
    marketplacePlugins: ["harness-builder", "harness-floor", "harness-thrift", "harness-explore", "harness-debug"],
    requiredFiles: [
      "plugins/harness-builder/plugin.json",
      "plugins/harness-builder/skills/agent-init/SKILL.md",
      "plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/AGENTS.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs",
      "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
      "plugins/harness-floor/skills/agent-all/SKILL.md",
      "plugins/harness-floor/skills/visual-qa/SKILL.md",
      "plugins/harness-thrift/skills/thrift/SKILL.md",
    ],
    textChecks: [
      {
        file: "plugins/harness-builder/skills/agent-init/SKILL.md",
        patterns: [
          /^---\nname: agent-init\n/m,
          /^# \/agent-init$/m,
          /Default \(no theme flag\) is operational\/heavy/,
          /--lite/,
          /--dry-run/,
          /--resume/,
          /--platform=claude,codex,gemini/,
          /--lang=ko\|en\|auto/,
          /When done[\s\S]{0,180}(phases completed|files written)/i,
        ],
      },
      {
        file: "plugins/harness-floor/skills/agent-all/SKILL.md",
        patterns: [
          /^---\nname: agent-all\n/m,
          /^# \/agent-all$/m,
          /--loop/,
          /--qa/,
          /--resume/,
          /superpowers:subagent-driven-development/,
          /When done/i,
        ],
      },
      {
        file: "plugins/harness-floor/skills/visual-qa/SKILL.md",
        patterns: [
          /^---\nname: visual-qa\n/m,
          /^# \/visual-qa$/m,
          /comprehensive/,
          /--budget=<USD>/,
          /--resume/,
          /Playwright MCP/,
          /When done/i,
        ],
      },
      {
        file: "plugins/harness-thrift/skills/thrift/SKILL.md",
        patterns: [
          /^---\nname: thrift\n/m,
          /^# \/thrift$/m,
          /\/thrift summarise/,
          /\/thrift audit/,
          /--dry-run/,
          /Append-only hook patches/,
          /When done/i,
        ],
      },
      {
        file: "plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs",
        patterns: [/Role Routing/i, /orchestrator[\s\S]{0,240}HOT-file/i, /verification-reviewer/i],
      },
      {
        file: "plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs",
        patterns: [/agent-policy-hook\.mjs/, /context-mode-router\.mjs/, /session-summary\.mjs/],
      },
      {
        file: "plugins/harness-floor/skills/agent-all/phases/4-gate.md",
        patterns: [/classifyChangedFiles\(files\)/, /QA_AUDIT/, /VERIFICATION_AUDIT/, /3 retry cycles/],
      },
    ],
  },
  codex: {
    label: "Codex",
    marketplacePlugins: ["harness-builder-codex", "harness-floor-codex", "harness-thrift-codex"],
    requiredFiles: [
      "plugins/harness-builder-codex/.claude-plugin/plugin.json",
      "plugins/harness-builder-codex/bin/init.mjs",
      "plugins/harness-builder-codex/skills/codex-init/SKILL.md",
      "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
      "plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md",
      "plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md",
      "plugins/harness-thrift-codex/skills/thrift-codex/SKILL.md",
    ],
    textChecks: [
      {
        file: "plugins/harness-builder-codex/skills/codex-init/SKILL.md",
        patterns: [
          /^---\nname: codex-init\n/m,
          /^# \/codex-init$/m,
          /default[\s\S]{0,140}operational and heavy/i,
          /--lite/,
          /--theme=lite/,
          /--dry-run/,
          /--lang=en\|ko\|auto/,
          /When done[\s\S]{0,220}Codex config snippet/i,
        ],
      },
      {
        file: "plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md",
        patterns: [
          /^---\nname: agent-all-codex\n/m,
          /^# \/agent-all-codex$/m,
          /--loop/,
          /--qa/,
          /--dispatch=sequential/,
          /--resume/,
          /run \/agent-all for/,
          /sequential skill/i,
          /When done[\s\S]{0,180}dispatch strategy/i,
        ],
        forbidden: [/codex skill run/i, /codex exec\s+["'][^"']+["']/i],
      },
      {
        file: "plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md",
        patterns: [
          /^---\nname: visual-qa-codex\n/m,
          /^# \/visual-qa-codex$/m,
          /comprehensive/,
          /--budget=<USD>/,
          /--dispatch=sequential/,
          /--resume/,
          /Playwright MCP/,
          /When done[\s\S]{0,220}dispatch strategy/i,
        ],
      },
      {
        file: "plugins/harness-thrift-codex/skills/thrift-codex/SKILL.md",
        patterns: [
          /^---\nname: thrift-codex\n/m,
          /^# \/thrift-codex$/m,
          /\/thrift-codex summarise/,
          /\/thrift-codex audit/,
          /--dry-run/,
          /--no-instrument/,
          /Append-only hook patches/,
          /When done/i,
        ],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs",
        patterns: [/Role Routing/i, /orchestrator[\s\S]{0,240}HOT-file/i, /verification-reviewer/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
        patterns: [/\[\[hooks\.PreToolUse\]\]/, /agent-skill:codex-config:start/],
        forbidden: [/\[\[hooks\.agent\]\]/],
      },
      {
        file: "plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md",
        patterns: [/classifyChangedFiles\(files\)/, /QA_AUDIT/, /VERIFICATION_AUDIT/, /unsupported legacy agent hook/],
      },
    ],
  },
};

export function runReleaseAudit({ root = ROOT, platforms = DEFAULT_PLATFORMS } = {}) {
  const selected = normalizePlatforms(platforms);
  const marketplace = readJson(root, ".claude-plugin/marketplace.json");
  const result = {
    ok: true,
    root,
    platforms: {},
  };

  for (const platform of selected) {
    const contract = PLATFORM_CONTRACTS[platform];
    const checks = [];

    checks.push(checkMarketplace(marketplace, contract.marketplacePlugins));
    for (const file of contract.requiredFiles) {
      checks.push(checkExists(root, file));
    }
    for (const check of contract.textChecks) {
      checks.push(checkText(root, check));
    }

    const ok = checks.every((check) => check.ok);
    result.ok = result.ok && ok;
    result.platforms[platform] = {
      ok,
      label: contract.label,
      summary: `${contract.label}: ${ok ? "ok" : "failed"} (${checks.filter((check) => check.ok).length}/${checks.length} checks)`,
      checks,
    };
  }

  return result;
}

function normalizePlatforms(platforms) {
  const values = Array.isArray(platforms) ? platforms : String(platforms).split(",");
  const selected = values.map((value) => String(value).trim()).filter(Boolean);
  for (const platform of selected) {
    if (!PLATFORM_CONTRACTS[platform]) {
      throw new Error(`Unknown platform: ${platform}`);
    }
  }
  return selected.length > 0 ? selected : DEFAULT_PLATFORMS;
}

function checkMarketplace(marketplace, expectedPlugins) {
  const names = new Set((marketplace.plugins || []).map((plugin) => plugin.name));
  const missing = expectedPlugins.filter((plugin) => !names.has(plugin));
  return {
    ok: missing.length === 0,
    name: `marketplace lists ${expectedPlugins.join(", ")}`,
    details: missing.length === 0 ? "all present" : `missing: ${missing.join(", ")}`,
  };
}

function checkExists(root, file) {
  const ok = existsSync(resolve(root, file));
  return {
    ok,
    name: `${file} exists`,
    details: ok ? "present" : "missing",
  };
}

function checkText(root, { file, patterns = [], forbidden = [] }) {
  if (!existsSync(resolve(root, file))) {
    return {
      ok: false,
      name: `${file} matches release contract`,
      details: "missing",
    };
  }
  const text = readText(root, file);
  const missing = patterns.filter((pattern) => !pattern.test(text)).map(String);
  const foundForbidden = forbidden.filter((pattern) => pattern.test(text)).map(String);
  return {
    ok: missing.length === 0 && foundForbidden.length === 0,
    name: `${file} matches release contract`,
    details: [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      foundForbidden.length > 0 ? `forbidden: ${foundForbidden.join(", ")}` : null,
    ].filter(Boolean).join("; ") || "matched",
  };
}

function readJson(root, file) {
  return JSON.parse(readText(root, file));
}

function readText(root, file) {
  return readFileSync(resolve(root, file), "utf-8");
}

function parseArgs(argv) {
  const args = { json: false, platforms: DEFAULT_PLATFORMS };
  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg.startsWith("--platform=")) {
      args.platforms = arg.slice("--platform=".length).split(",");
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function printHuman(result) {
  console.log(`release readiness audit: ${result.ok ? "ok" : "failed"}`);
  for (const platform of Object.values(result.platforms)) {
    console.log(platform.summary);
    for (const check of platform.checks) {
      console.log(`  ${check.ok ? "ok" : "fail"} - ${check.name}`);
    }
  }
}

function printHelp() {
  console.log("Usage: node scripts/release-audit.mjs [--json] [--platform=claude,codex]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const result = runReleaseAudit({ platforms: args.platforms });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(result);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
