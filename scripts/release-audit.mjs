#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PLATFORMS = ["claude", "codex"];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PUBLIC_CLI_SCRIPTS = [
  "scripts/doctor.mjs",
  "scripts/harness-clean.mjs",
  "scripts/install-all.sh",
  "scripts/install-platform.sh",
  "scripts/release-audit.mjs",
  "scripts/release-fixture-smoke.mjs",
  "scripts/release-smoke.sh",
  "scripts/sync-lib.mjs",
  "scripts/update.sh",
];

const RELEASE_SMOKE_CONTRACT = {
  file: "scripts/release-smoke.sh",
  patterns: [
    /release gate for the Claude Code native plugins[\s\S]{0,160}Claude\/Codex project renderers/,
    /--fast --with-live-cli/,
    /probe_codex_exec_surface/,
    /release-audit\.mjs/,
    /release-fixture-smoke\.mjs/,
    /install-all\.sh" --dry-run --claude-code/,
    /install-all\.sh" --dry-run --cli=codex/,
    /node --test[\s\S]{0,900}tests\/lib\/release-audit\.test\.mjs[\s\S]{0,900}tests\/lib\/release-install-scripts\.test\.mjs/,
    /scripts\/sync-lib\.mjs --check/,
    /full test suite/,
  ],
};

const PLATFORM_CONTRACTS = {
  claude: {
    label: "Claude",
    marketplacePlugins: ["harness-builder", "harness-floor", "harness-thrift", "harness-explore", "harness-debug"],
    requiredFiles: [
      "scripts/install-platform.sh",
      "plugins/harness-builder/plugin.json",
      "plugins/harness-builder/bin/clean.mjs",
      "plugins/harness-builder/bin/doctor.mjs",
      "plugins/harness-builder/bin/init.mjs",
      "plugins/harness-builder/skills/agent-init/SKILL.md",
      "plugins/harness-builder/skills/agent-init/lib/doctor-core.mjs",
      "plugins/harness-builder/skills/agent-init/lib/harness-cleaner.mjs",
      "plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/AGENTS.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/agents/frontend-dev.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/agents/backend-dev.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/agents/orchestrator.md.hbs",
      "plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs",
      "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
      "plugins/harness-floor/bin/install-floor-policy.mjs",
      "plugins/harness-floor/bin/floor-policy-hook.mjs",
      "plugins/harness-floor/skills/agent-all/SKILL.md",
      "plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs",
      "plugins/harness-floor/skills/agent-all/lib/policy/coordinator-audit-validator.mjs",
      "plugins/harness-floor/skills/visual-qa/SKILL.md",
      "plugins/harness-thrift/skills/thrift/SKILL.md",
    ],
    textChecks: [
      RELEASE_SMOKE_CONTRACT,
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
        patterns: [
          /Role Routing/i,
          /orchestrator[\s\S]{0,240}HOT-file/i,
          /Implementation Routing Matrix/i,
          /frontend-dev[\s\S]{0,240}backend-dev/i,
          /verification-reviewer/i,
          /Orchestration Contract/i,
          /Role Gate Matrix/i,
          /Configured QA Personas/i,
        ],
      },
      {
        file: "plugins/harness-builder/skills/agent-init/templates/agents/orchestrator.md.hbs",
        patterns: [
          /Implementation Routing Matrix/i,
          /UI, routes, client state, browser behavior[\s\S]{0,120}frontend-dev/i,
          /API, services, jobs, persistence[\s\S]{0,120}backend-dev/i,
          /Role Gate Matrix/i,
          /UI or user-visible flow[\s\S]{0,120}design-reviewer[\s\S]{0,80}qa-reviewer/i,
          /Auth, permissions, secrets, destructive actions[\s\S]{0,120}security-reviewer/i,
          /Frontend \+ backend\/API contract[\s\S]{0,120}integration-dev[\s\S]{0,80}verification-reviewer/i,
        ],
      },
      {
        file: "plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs",
        patterns: [
          /agent-policy-hook\.mjs/,
          /context-mode-router\.mjs/,
          /session-summary\.mjs/,
          /PostToolUse/,
          /"matcher": "Task"/,
          /agent-policy-hook\.mjs\\?" PreToolUse/,
          /agent-policy-hook\.mjs\\?" PostToolUse/,
        ],
      },
      {
        file: "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
        patterns: [
          /Decision-Surfacing Protocol/,
          /verification_passed/,
          /ORCHESTRATION_AUDIT/,
          /QA_AUDIT/,
          /VERIFICATION_AUDIT/,
          /git commit requires explicit pathspec/,
        ],
      },
      {
        file: "plugins/harness-floor/bin/install-floor-policy.mjs",
        patterns: [
          /matcher: "Task"/,
          /hooks: \[\{ type: "command", command \}\]/,
          /node "\$\{hookScriptAbsPath\}" PreToolUse/,
          /node "\$\{hookScriptAbsPath\}" PostToolUse/,
          /cannot parse .*refusing to patch/,
          /floor-policy-\(\?:hook\|pre\|post\)/,
        ],
        forbidden: [/floor-policy-pre node/, /floor-policy-post node/],
      },
      {
        file: "plugins/harness-floor/skills/agent-all/phases/4-gate.md",
        patterns: [/buildGatePlan/, /classifyChangedFiles\(files\)/, /dispatch\.gateReason/, /dispatch\.passCriteria/, /ORCHESTRATION_AUDIT/, /QA_AUDIT/, /VERIFICATION_AUDIT/, /3 retry cycles/],
      },
      {
        file: "plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs",
        patterns: [
          /gateReason/,
          /passCriteriaForDispatch/,
          /Changed-file classifier selected/,
          /ORCHESTRATION_AUDIT/,
          /QA_AUDIT/,
          /VERIFICATION_AUDIT/,
        ],
      },
      {
        file: "scripts/install-platform.sh",
        patterns: [
          /claude[\s\S]{0,140}Claude Code project files/,
          /--update-foundations\|--no-update-foundations/,
          /FOUNDATION_MODE="auto"/,
          /foundation auto-update skipped/,
          /foundation auto-update failed/,
          /should_run_foundation_update/,
          /--update-foundations[\s\S]{0,260}--platform=claude or --platform=codex/,
          /--uninstall[\s\S]{0,220}--platform=claude or --platform=codex/,
          /Claude project bootstrap supports --theme=all, --theme=builder, or --lite/,
          /run_init "harness-builder" "init\.mjs"/,
          /args\+=\(--no-doctor\)/,
        ],
      },
      {
        file: "scripts/release-fixture-smoke.mjs",
        patterns: [
          /checkClaudePlatformInstall/,
          /checkClaudePlatformLiteInstall/,
          /checkClaudePlatformUninstall/,
          /--platform=\$\{platform\}/,
          /reports Claude platform install/,
          /reports Claude platform lite install/,
          /profile:\\s\+operational/,
          /profile:\\s\+lite/,
          /harness doctor: ok/,
          /implementationRoutingChecks/,
          /routes UI work to frontend-dev/,
          /routes API work to backend-dev/,
          /\.claude platform orchestrator/,
          /\.claude platform frontend-dev embeds frontend discipline/,
          /\.claude platform backend-dev embeds backend discipline/,
          /\.claude frontend-dev embeds frontend discipline/,
          /\.claude backend-dev embeds backend discipline/,
          /executableScriptErrors/,
          /CLAUDE_EXECUTABLE_GENERATED/,
          /CLAUDE_LITE_EXECUTABLE_GENERATED/,
          /executable generated hooks and task checker/,
          /executable non-policy hooks/,
          /post-install Claude platform doctor coverage/,
          /post-install Claude platform lite doctor coverage/,
          /only lite scaffold files/,
          /no HOME patching/,
          /uninstall roundtrip removed generated agents, hooks, task ledger, and floor configs/,
          /preserving root guidance/,
        ],
      },
    ],
  },
  codex: {
    label: "Codex",
    marketplacePlugins: ["harness-builder-codex", "harness-floor-codex", "harness-thrift-codex", "harness-debug-codex"],
    requiredFiles: [
      "scripts/install-platform.sh",
      "plugins/harness-builder-codex/.claude-plugin/plugin.json",
      "plugins/harness-builder-codex/bin/clean.mjs",
      "plugins/harness-builder-codex/bin/doctor.mjs",
      "plugins/harness-builder-codex/bin/init.mjs",
      "plugins/harness-builder-codex/skills/codex-init/SKILL.md",
      "plugins/harness-builder-codex/skills/codex-init/lib/doctor-core.mjs",
      "plugins/harness-builder-codex/skills/codex-init/lib/harness-cleaner.mjs",
      "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/reviewer/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/frontend-dev/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/backend-dev/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/integration-dev/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/orchestrator/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/verification-reviewer/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/design-reviewer/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/security-reviewer/SKILL.md.hbs",
      "plugins/harness-builder-codex/skills/codex-init/templates/skills/data-reviewer/SKILL.md.hbs",
      "plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md",
      "plugins/harness-floor-codex/skills/agent-all-codex/lib/gate-plan.mjs",
      "plugins/harness-floor-codex/skills/agent-all-codex/lib/policy/coordinator-audit-validator.mjs",
      "plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md",
      "plugins/harness-thrift-codex/skills/thrift-codex/SKILL.md",
      "plugins/harness-debug-codex/.claude-plugin/plugin.json",
      "plugins/harness-debug-codex/README.md",
      "plugins/harness-debug-codex/bin/install.mjs",
      "plugins/harness-debug-codex/skills/debug-codex/SKILL.md",
      "plugins/harness-debug-codex/skills/debug-codex/lib/debug-artifacts.mjs",
      "plugins/harness-debug-codex/skills/debug-codex/lib/error-parser.mjs",
      "plugins/harness-debug-codex/skills/debug-codex/lib/state-checkpoint.mjs",
      "plugins/harness-debug-codex/skills/debug-codex/phases/1-reproduce.md",
      "plugins/harness-debug-codex/skills/debug-codex/phases/3-hypothesize.md",
    ],
    textChecks: [
      RELEASE_SMOKE_CONTRACT,
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
          /run \/visual-qa/,
          /Playwright MCP/,
          /When done[\s\S]{0,220}dispatch strategy/i,
        ],
        forbidden: [/codex skill run/i, /codex exec\s+["'][^"']+["']/i],
      },
      {
        file: "plugins/harness-thrift-codex/skills/thrift-codex/SKILL.md",
        patterns: [
          /^---\nname: thrift-codex\n/m,
          /^# \/thrift-codex$/m,
          /^run \/thrift(?:\s+#.*)?$/m,
          /run \/thrift summarise/,
          /run \/thrift audit/,
          /--dry-run/,
          /--no-instrument/,
          /Append-only hook patches/,
          /When done/i,
        ],
        forbidden: [/codex skill run/i, /codex exec\s+["'][^"']+["']/i],
      },
      {
        file: "plugins/harness-debug-codex/skills/debug-codex/SKILL.md",
        patterns: [
          /^---\nname: debug-codex\n/m,
          /^# \/debug-codex$/m,
          /^run \/debug "(?:<failing command>|[^"]+)"$/m,
          /run \/debug --resume/,
          /\.debug-state\.json/,
          /structured error parsing/i,
          /debug-artifacts\.mjs/,
          /superpowers:systematic-debugging/,
          /context-mode[\s\S]{0,220}shell_command/,
          /Codex primitive map/,
          /When done[\s\S]{0,220}Debug complete/i,
        ],
        forbidden: [
          /codex skill run/i,
          /codex exec\s+["'][^"']+["']/i,
          /ToolSearch/i,
          /call the `Skill` tool/i,
          /Otherwise use `Bash`/i,
        ],
      },
      {
        file: "plugins/harness-debug-codex/README.md",
        patterns: [
          /^# harness-debug-codex$/m,
          /Codex CLI/i,
          /run \/debug/,
          /debug-codex/,
          /install-platform\.sh --platform=codex --target=\/path\/to\/project --theme=debug/,
          /\.codex\/skills\/debug-codex/,
          /Release surface/,
          /structured error parsing/i,
          /\.debug-state\.json/,
        ],
        forbidden: [/Claude Code debug surface/i, /codex plugins install/i, /scaffold-only|TBD|placeholder/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs",
        patterns: [
          /Role Routing/i,
          /orchestrator[\s\S]{0,240}HOT-file/i,
          /Implementation Routing Matrix/i,
          /frontend-dev[\s\S]{0,240}backend-dev/i,
          /verification-reviewer/i,
          /Orchestration Contract/i,
          /Role Gate Matrix/i,
          /QA Personas/i,
        ],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/orchestrator/SKILL.md.hbs",
        patterns: [
          /Implementation Routing Matrix/i,
          /UI, routes, client state, browser behavior[\s\S]{0,120}frontend-dev/i,
          /API, services, jobs, persistence[\s\S]{0,120}backend-dev/i,
          /Role Gate Matrix/i,
          /sequential dispatch/i,
          /UI or user-visible flow[\s\S]{0,120}design-reviewer[\s\S]{0,80}qa-reviewer/i,
          /Auth, permissions, secrets, destructive actions[\s\S]{0,120}security-reviewer/i,
          /Frontend \+ backend\/API contract[\s\S]{0,120}integration-dev[\s\S]{0,80}verification-reviewer/i,
        ],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/reviewer/SKILL.md.hbs",
        patterns: [/Review Task/, /Spec Review Task/, /VERIFICATION_AUDIT: passed/, /VERIFICATION_AUDIT: failed/, /VERIFICATION_AUDIT: skipped/, /literal line at the END/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/verification-reviewer/SKILL.md.hbs",
        patterns: [/Verification Review Task/, /VERIFICATION_AUDIT: passed/, /VERIFICATION_AUDIT: failed/, /VERIFICATION_AUDIT: skipped/, /literal line at the END/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/integration-dev/SKILL.md.hbs",
        patterns: [/Integration-dev Review Task/, /VERIFICATION_AUDIT: passed/, /VERIFICATION_AUDIT: failed/, /VERIFICATION_AUDIT: skipped/, /literal line at the END/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/design-reviewer/SKILL.md.hbs",
        patterns: [/Design Review Task/, /VERIFICATION_AUDIT: passed/, /VERIFICATION_AUDIT: failed/, /VERIFICATION_AUDIT: skipped/, /literal line at the END/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/security-reviewer/SKILL.md.hbs",
        patterns: [/Security Review Task/, /VERIFICATION_AUDIT: passed/, /VERIFICATION_AUDIT: failed/, /VERIFICATION_AUDIT: skipped/, /literal line at the END/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/skills/data-reviewer/SKILL.md.hbs",
        patterns: [/Data Review Task/, /VERIFICATION_AUDIT: passed/, /VERIFICATION_AUDIT: failed/, /VERIFICATION_AUDIT: skipped/, /literal line at the END/i],
      },
      {
        file: "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
        patterns: [/\[\[hooks\.PreToolUse\]\]/, /agent-skill:codex-config:start/],
        forbidden: [/\[\[hooks\.agent\]\]/],
      },
      {
        file: "plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md",
        patterns: [/buildGatePlan/, /classifyChangedFiles\(files\)/, /dispatch\.gateReason/, /dispatch\.passCriteria/, /ORCHESTRATION_AUDIT/, /QA_AUDIT/, /VERIFICATION_AUDIT/, /unsupported legacy agent hook/],
      },
      {
        file: "plugins/harness-floor-codex/skills/agent-all-codex/lib/gate-plan.mjs",
        patterns: [
          /gateReason/,
          /passCriteriaForDispatch/,
          /Changed-file classifier selected/,
          /ORCHESTRATION_AUDIT/,
          /QA_AUDIT/,
          /VERIFICATION_AUDIT/,
        ],
      },
      {
        file: "plugins/harness-floor-codex/skills/agent-all-codex/lib/sequential-dispatch.mjs",
        patterns: [
          /requiredAuditForReview/,
          /Gate reason/,
          /Gate Pass Criteria/,
          /ORCHESTRATION_AUDIT: passed\|failed\|skipped/,
          /QA_AUDIT: passed\|failed\|skipped/,
          /VERIFICATION_AUDIT: passed\|failed\|skipped/,
        ],
      },
      {
        file: "scripts/install-platform.sh",
        patterns: [
          /codex[\s\S]{0,140}OpenAI Codex CLI/,
          /codex-init so it writes AGENTS\.md \+ base skills only/,
          /run_init "harness-builder-\$EMIT_PLATFORM" "init\.mjs" --lite/,
          /run_init "harness-thrift-\$EMIT_PLATFORM" "install\.mjs" --no-instrument/,
          /run_init "harness-debug-\$EMIT_PLATFORM" "install\.mjs"/,
          /--platform=codex[\s\S]{0,220}--theme=debug/,
          /run_post_install_doctor/,
          /"--platform=codex" "--profile=\$profile"/,
          /--update-foundations\|--no-update-foundations/,
          /FOUNDATION_MODE="auto"/,
          /foundation auto-update skipped/,
          /foundation auto-update failed/,
          /should_run_foundation_update/,
          /--update-foundations[\s\S]{0,260}--platform=claude or --platform=codex/,
          /--uninstall[\s\S]{0,220}--platform=claude or --platform=codex/,
        ],
      },
      {
        file: "scripts/release-fixture-smoke.mjs",
        patterns: [
          /checkCodexBuilder/,
          /checkCodexFloor/,
          /checkCodexThrift/,
          /checkCodexPlatformUninstall/,
          /runs operational-profile doctor/,
          /runs builder-profile doctor/,
          /profile:\\s\+operational/,
          /reports lite profile/,
          /profile: lite/,
          /post-install doctor passes/,
          /harness doctor: ok/,
          /post-install operational doctor coverage/,
          /post-install builder doctor coverage/,
          /post-install lite doctor coverage/,
          /implementationRoutingChecks/,
          /routes UI work to frontend-dev/,
          /routes API work to backend-dev/,
          /expectStackRoles/,
          /dispatchSequential/,
          /frontend-dev sequential command/,
          /backend-dev sequential command/,
          /inlines frontend-dev\/backend-dev role skills/,
          /CODEX_EXECUTABLE_GENERATED/,
          /executable hooks\/task checker/,
          /no hook\/task checker side effects/,
          /base\/specialized reviewer audit tokens/,
          /codexVerificationAuditTokenChecks/,
          /stack-specific frontend\/backend role dispatch/,
          /\.codex frontend-dev skill embeds frontend responsibilities/,
          /\.codex backend-dev skill embeds backend responsibilities/,
          /only Codex builder artifacts/,
          /only Codex floor artifacts/,
          /only Codex thrift artifacts/,
          /no-instrument command-hook snippets/,
          /post-install debug doctor coverage/,
          /uninstall roundtrip removed generated skills, hooks, task ledger, and floor\/thrift configs/,
          /preserving root guidance, debug evidence, and global config/,
        ],
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
    checks.push(checkExecutableScripts(root, PUBLIC_CLI_SCRIPTS));
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

function checkExecutableScripts(root, files) {
  const missing = [];
  const nonExecutable = [];
  const missingShebang = [];

  for (const file of files) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      missing.push(file);
      continue;
    }
    const stat = statSync(path);
    if ((stat.mode & 0o111) === 0) {
      nonExecutable.push(file);
    }
    const firstLine = readFileSync(path, "utf-8").split(/\r?\n/, 1)[0];
    if (!firstLine.startsWith("#!")) {
      missingShebang.push(file);
    }
  }

  return {
    ok: missing.length === 0 && nonExecutable.length === 0 && missingShebang.length === 0,
    name: "public CLI scripts are executable with shebangs",
    details: [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      nonExecutable.length > 0 ? `non-executable: ${nonExecutable.join(", ")}` : null,
      missingShebang.length > 0 ? `missing shebang: ${missingShebang.join(", ")}` : null,
    ].filter(Boolean).join("; ") || "matched",
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
