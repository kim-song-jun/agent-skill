import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanFoundationState } from "./foundation-check.mjs";
import { analyzeInstructionLeanness } from "./instruction-leanness.mjs";

export const CONTRACTS = {
  claude: {
    label: "Claude",
    liteRequired: [
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/settings.local.json",
      ".claude/hooks/context-mode-router.mjs",
      ".claude/hooks/session-summary.mjs",
      ".claude/hooks/cache-heal.mjs",
      ".claude/agents/planner.md",
      ".claude/agents/dev.md",
      ".claude/agents/reviewer.md",
    ],
    builderRequired: [
      ".claude/hooks/agent-policy-hook.mjs",
      ".claude/agents/orchestrator.md",
      ".claude/agents/frontend-dev.md",
      ".claude/agents/backend-dev.md",
      ".claude/agents/integration-dev.md",
      ".claude/agents/quality-debt-reviewer.md",
      ".claude/agents/verification-reviewer.md",
      ".claude/agents/qa-reviewer.md",
      ".claude/agents/design-reviewer.md",
      ".claude/agents/security-reviewer.md",
      ".claude/agents/data-reviewer.md",
      ".agent-skill/tasks/index.md",
      ".agent-skill/tasks/_template.md",
      ".agent-skill/tasks/_handoff-template.md",
      "scripts/agent-task-ledger-check.mjs",
    ],
    operationalRequired: [
      ".visual-qa.json",
      ".agent-all.json",
    ],
    jsonFiles: [
      ".claude/settings.local.json",
      ".visual-qa.json",
      ".agent-all.json",
    ],
    operationalMarkers: [
      ".agent-all.json",
      ".visual-qa.json",
    ],
    builderMarkers: [
      ".claude/hooks/agent-policy-hook.mjs",
      ".claude/agents/orchestrator.md",
      ".agent-skill/tasks/index.md",
    ],
    textChecks: [
      {
        profiles: ["builder", "operational"],
        path: "CLAUDE.md",
        patterns: [/Orchestration Contract/, /Implementation Routing Matrix/, /Role Gate Matrix/],
      },
      {
        profiles: ["builder", "operational"],
        path: "AGENTS.md",
        patterns: [/Orchestration Contract/, /Implementation Routing Matrix/, /Role Gate Matrix/],
      },
      {
        profiles: ["builder", "operational"],
        path: ".claude/agents/orchestrator.md",
        patterns: [/Implementation Routing Matrix/, /frontend-dev/, /backend-dev/, /integration-dev/],
      },
      {
        profiles: ["builder", "operational"],
        path: ".claude/agents/quality-debt-reviewer.md",
        patterns: [/Quality Debt Policy/, /VERIFICATION_AUDIT: passed/, /Quality Debt Exceptions/],
      },
      {
        profiles: ["builder", "operational"],
        path: ".claude/agents/qa-reviewer.md",
        patterns: [/QA_AUDIT: passed/, /QA_AUDIT: failed/, /QA_AUDIT: skipped/],
      },
    ],
    qaPersonaPropagation: {
      rootPath: "CLAUDE.md",
      reviewerPath: ".claude/agents/qa-reviewer.md",
      rootHeader: /^## Configured QA Personas$/i,
      reviewerHeader: /^## Configured QA Personas$/i,
    },
  },
  codex: {
    label: "Codex",
    liteRequired: [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/dev/SKILL.md",
      ".codex/skills/reviewer/SKILL.md",
    ],
    builderRequired: [
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/skills/frontend-dev/SKILL.md",
      ".codex/skills/backend-dev/SKILL.md",
      ".codex/skills/integration-dev/SKILL.md",
      ".codex/skills/quality-debt-reviewer/SKILL.md",
      ".codex/skills/verification-reviewer/SKILL.md",
      ".codex/skills/qa-reviewer/SKILL.md",
      ".codex/skills/design-reviewer/SKILL.md",
      ".codex/skills/security-reviewer/SKILL.md",
      ".codex/skills/data-reviewer/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      ".agent-skill/tasks/index.md",
      ".agent-skill/tasks/_template.md",
      ".agent-skill/tasks/_handoff-template.md",
      "scripts/agent-task-ledger-check.mjs",
    ],
    operationalRequired: [
      ".codex/skills/agent-all/SKILL.md",
      ".codex/skills/agent-all/lib/sequential-dispatch.mjs",
      ".codex/skills/visual-qa/SKILL.md",
      ".codex/skills/visual-qa/lib/sequential-dispatch.mjs",
      ".codex/skills/visual-qa-page/SKILL.md",
      ".codex/skills/thrift/SKILL.md",
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
    ],
    debugRequired: [
      ".codex/skills/debug/SKILL.md",
      ".codex/skills/debug/lib/debug-artifacts.mjs",
      ".codex/skills/debug/lib/error-parser.mjs",
      ".codex/skills/debug/lib/state-checkpoint.mjs",
      ".codex/skills/debug/phases/1-reproduce.md",
      ".debug-artifacts",
      ".agent-skill/reports/debug/index.md",
    ],
    jsonFiles: [
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
    ],
    operationalMarkers: [
      ".codex/skills/agent-all/SKILL.md",
      ".codex/skills/thrift/SKILL.md",
      ".agent-all.json",
      ".visual-qa.json",
      ".thrift.json",
    ],
    debugMarkers: [
      ".codex/skills/debug/SKILL.md",
      ".agent-skill/reports/debug/index.md",
    ],
    builderMarkers: [
      ".codex/hooks/agent-policy-hook.mjs",
      ".codex/skills/orchestrator/SKILL.md",
      ".agent-skill/tasks/index.md",
    ],
    textChecks: [
      {
        profiles: ["builder", "operational"],
        path: "AGENTS.md",
        patterns: [/Orchestration Contract/, /Implementation Routing Matrix/, /Role Gate Matrix/, /frontend-dev[\s\S]{0,160}backend-dev/],
      },
      {
        profiles: ["builder", "operational"],
        path: ".codex/skills/orchestrator/SKILL.md",
        patterns: [/Implementation Routing Matrix/, /frontend-dev/, /backend-dev/, /integration-dev/],
      },
      {
        profiles: ["builder", "operational"],
        path: ".codex/skills/quality-debt-reviewer/SKILL.md",
        patterns: [/Quality Debt Policy/, /VERIFICATION_AUDIT: passed/, /Quality Debt Exceptions/],
      },
      {
        profiles: ["builder", "operational"],
        path: ".codex/skills/qa-reviewer/SKILL.md",
        patterns: [/QA_AUDIT: passed/, /QA_AUDIT: failed/, /QA_AUDIT: skipped/],
      },
      {
        profiles: ["debug", "operational"],
        path: ".codex/skills/debug/SKILL.md",
        patterns: [/^---\nname: debug\n/m, /run \/debug/, /Debug complete/],
      },
      {
        profiles: ["operational"],
        path: ".codex/skills/thrift/SKILL.md",
        patterns: [/^---\nname: thrift\n/m, /run \/thrift/, /Append-only hook patches/],
      },
    ],
    qaPersonaPropagation: {
      rootPath: "AGENTS.md",
      reviewerPath: ".codex/skills/qa-reviewer/SKILL.md",
      rootHeader: /^## QA Personas$/i,
      reviewerHeader: /^## Configured QA Personas$/i,
    },
  },
  copilot: {
    label: "Copilot",
    liteRequired: [
      ".github/copilot-instructions.md",
      "AGENTS.md",
    ],
    builderRequired: [
      ".github/instructions/dev.instructions.md",
      ".github/instructions/planner.instructions.md",
      ".github/instructions/reviewer.instructions.md",
    ],
    operationalRequired: [
      ".agent-all.json",
      ".visual-qa.json",
      ".copilot/agent-all/lib/config-loader.mjs",
      ".copilot/agent-all/lib/hooks/pre-tool-use-policy.mjs",
      ".copilot/agent-all/lib/hooks/git-safety.mjs",
      ".github/hooks/preToolUse.json",
    ],
    jsonFiles: [
      ".agent-all.json",
      ".visual-qa.json",
      ".github/hooks/preToolUse.json",
    ],
    operationalMarkers: [
      ".copilot/agent-all/lib",
      ".agent-all.json",
    ],
    builderMarkers: [
      ".github/copilot-instructions.md",
      ".github/instructions/dev.instructions.md",
    ],
    textChecks: [
      {
        // The v0.7.16-fixed contract: the project-local preToolUse hook MUST be
        // wired to the real git-safety handler, not a `printf '{}'` allow-all stub
        // (the install-but-not-activated defect doctor exists to catch).
        profiles: ["operational"],
        path: ".github/hooks/preToolUse.json",
        patterns: [/pre-tool-use-policy\.mjs/],
      },
    ],
  },
};

export const USAGE = `Usage: doctor.mjs [--target=<dir>] [--platform=auto|claude|codex|copilot] [--profile=auto|operational|builder|lite|debug] [--json] [--strict-foundations]

Checks a project-local agent-skill scaffold after install.

Examples:
  node plugins/harness-builder/bin/doctor.mjs --target=. --platform=claude
  node plugins/harness-builder-codex/bin/doctor.mjs --target=. --platform=codex --profile=builder
  node plugins/harness-builder-codex/bin/doctor.mjs --target=. --platform=codex --profile=debug
  node scripts/doctor.mjs --target=. --json`;

function recoveryInstallCommand(platform, profile) {
  const flags = [`--platform=${platform}`, "--target=<project>"];
  if (profile === "lite") flags.push("--lite");
  else if (profile === "builder") flags.push("--theme=builder");
  else if (profile === "debug") flags.push("--theme=debug");
  flags.push("--force");
  return `./scripts/install-platform.sh ${flags.join(" ")}`;
}

function missingArtifactFix(platform, profile, path) {
  return `${recoveryInstallCommand(platform, profile)} # restores ${path}`;
}

function generatedGuidanceFix(platform, profile, path) {
  return `${recoveryInstallCommand(platform, profile)} # refreshes generated guidance for ${path}`;
}

export function runDoctor({
  target = process.cwd(),
  platform = "auto",
  profile = "auto",
  homeDir = process.env.HOME || process.env.USERPROFILE || "",
  strictFoundations = false,
} = {}) {
  const targetAbs = resolve(target);
  const failures = [];
  const warnings = [];
  const checks = [];

  if (!existsSync(targetAbs)) {
    failures.push({
      type: "target",
      path: targetAbs,
      message: `target directory does not exist: ${targetAbs}`,
      fix: "create the target directory or pass --target=<existing-project>",
    });
    return buildResult({ targetAbs, platform, profile, failures, warnings, checks, foundationState: null });
  }

  const resolvedPlatform = resolvePlatform(targetAbs, platform, failures);
  if (!resolvedPlatform) {
    return buildResult({ targetAbs, platform, profile, failures, warnings, checks, foundationState: null });
  }

  const contract = CONTRACTS[resolvedPlatform];
  const resolvedProfile = resolveProfile(targetAbs, contract, profile, failures);
  if (!resolvedProfile) {
    return buildResult({
      targetAbs,
      platform: resolvedPlatform,
      profile,
      failures,
      warnings,
      checks,
      foundationState: null,
    });
  }

  const requiredFiles = [
    ...(resolvedProfile === "debug" ? [] : contract.liteRequired),
    ...(["builder", "operational"].includes(resolvedProfile) ? contract.builderRequired : []),
    ...(resolvedProfile === "operational" ? contract.operationalRequired : []),
    ...(["debug", "operational"].includes(resolvedProfile) ? (contract.debugRequired ?? []) : []),
  ];

  for (const rel of requiredFiles) {
    const ok = existsSync(resolve(targetAbs, rel));
    const check = {
      ok,
      type: "file",
      path: rel,
      message: ok ? "present" : `missing required file: ${rel}`,
      fix: ok ? undefined : missingArtifactFix(resolvedPlatform, resolvedProfile, rel),
    };
    checks.push(check);
    if (!ok) failures.push(check);
  }

  for (const rel of contract.jsonFiles.filter((file) => requiredFiles.includes(file))) {
    const abs = resolve(targetAbs, rel);
    if (!existsSync(abs)) continue;
    const parse = parseJson(abs, rel);
    checks.push(parse);
    if (!parse.ok) {
      parse.fix = `repair JSON syntax in ${rel}, then re-run doctor`;
      failures.push(parse);
    }
  }

  for (const check of contract.textChecks ?? []) {
    if (!check.profiles.includes(resolvedProfile)) continue;
    const result = checkTextPatterns(targetAbs, check);
    checks.push(result);
    if (!result.ok) {
      result.fix = generatedGuidanceFix(resolvedPlatform, resolvedProfile, result.path);
      failures.push(result);
    }
  }

  if (["builder", "operational"].includes(resolvedProfile) && contract.qaPersonaPropagation) {
    const result = checkQaPersonaPropagation(targetAbs, contract.qaPersonaPropagation);
    if (result) {
      checks.push(result);
      if (!result.ok) {
        result.fix = generatedGuidanceFix(resolvedPlatform, resolvedProfile, result.path);
        failures.push(result);
      }
    }
  }

  const foundationState = scanFoundationState({
    installedPluginIds: loadInstalledPluginIds(homeDir),
  });
  if (foundationState.degraded) {
    const warning = {
      type: "foundations",
      message: `foundations missing: ${foundationState.missing.join(", ")}`,
      fix: foundationState.updateCommand,
      instructions: foundationState.instructions,
    };
    warnings.push(warning);
    if (strictFoundations) {
      failures.push({
        type: "foundations",
        path: "~/.claude/plugins/installed_plugins.json",
        message: warning.message,
        fix: warning.fix,
        instructions: warning.instructions,
      });
    }
  }

  // Advisory instruction-file leanness (budget / cross-layer duplication / orphaned
  // folder guides). Warnings only — never a failure, so doctor's exit code is unchanged.
  for (const lean of analyzeInstructionLeanness({ targetAbs, homeDir }).warnings) {
    warnings.push({ type: "leanness", path: lean.path, message: lean.message });
  }

  return buildResult({
    targetAbs,
    platform: resolvedPlatform,
    profile: resolvedProfile,
    failures,
    warnings,
    checks,
    foundationState,
  });
}

function buildResult({ targetAbs, platform, profile, failures, warnings, checks, foundationState }) {
  const passed = checks.filter((check) => check.ok).length;
  const result = {
    ok: failures.length === 0,
    target: targetAbs,
    platform,
    profile,
    summary: {
      passed,
      total: checks.length,
    },
    failures,
    warnings,
    foundationState,
    checks,
  };
  return result;
}

function resolvePlatform(targetAbs, platform, failures) {
  if (platform !== "auto") {
    if (!CONTRACTS[platform]) {
      failures.push({
        type: "usage",
        path: "--platform",
        message: `unknown platform: ${platform}`,
        fix: "run doctor --help and choose a supported --platform",
      });
      return null;
    }
    return platform;
  }

  if (existsSync(resolve(targetAbs, ".codex")) || existsSync(resolve(targetAbs, ".codex/skills"))) {
    return "codex";
  }
  if (existsSync(resolve(targetAbs, ".claude")) || existsSync(resolve(targetAbs, "CLAUDE.md"))) {
    return "claude";
  }
  if (existsSync(resolve(targetAbs, ".copilot/agent-all")) || existsSync(resolve(targetAbs, ".github/copilot-instructions.md"))) {
    return "copilot";
  }
  failures.push({
    type: "detect",
    path: targetAbs,
    message: "unable to auto-detect platform; pass --platform=claude|codex|copilot",
    fix: "re-run doctor with --platform=claude, --platform=codex, or --platform=copilot",
  });
  return null;
}

function resolveProfile(targetAbs, contract, profile, failures) {
  if (profile !== "auto") {
    const allowed = new Set(["operational", "builder", "lite"]);
    if ((contract.debugRequired ?? []).length > 0) allowed.add("debug");
    if (allowed.has(profile)) return profile;
    failures.push({
      type: "usage",
      path: "--profile",
      message: `unknown profile: ${profile}`,
      fix: "run doctor --help and choose a supported --profile for this platform",
    });
    return null;
  }
  if (contract.operationalMarkers.some((rel) => existsSync(resolve(targetAbs, rel)))) {
    return "operational";
  }
  if (contract.builderMarkers.some((rel) => existsSync(resolve(targetAbs, rel)))) {
    return "builder";
  }
  if ((contract.debugMarkers ?? []).some((rel) => existsSync(resolve(targetAbs, rel)))) {
    return "debug";
  }
  return "lite";
}

function parseJson(abs, rel) {
  try {
    JSON.parse(readFileSync(abs, "utf-8"));
    return {
      ok: true,
      type: "json",
      path: rel,
      message: "valid JSON",
    };
  } catch (error) {
    return {
      ok: false,
      type: "json",
      path: rel,
      message: `${rel} is not valid JSON: ${error.message}`,
    };
  }
}

function checkTextPatterns(targetAbs, { path, patterns }) {
  const abs = resolve(targetAbs, path);
  if (!existsSync(abs)) {
    return {
      ok: false,
      type: "text",
      path,
      message: `missing required text file: ${path}`,
    };
  }
  const text = readFileSync(abs, "utf-8");
  const missing = patterns.filter((pattern) => !pattern.test(text)).map(String);
  return {
    ok: missing.length === 0,
    type: "text",
    path,
    message: missing.length === 0
      ? "required operational guidance present"
      : `${path} missing required operational guidance: ${missing.join(", ")}`,
  };
}

function checkQaPersonaPropagation(targetAbs, { rootPath, reviewerPath, rootHeader, reviewerHeader }) {
  const rootAbs = resolve(targetAbs, rootPath);
  const reviewerAbs = resolve(targetAbs, reviewerPath);
  if (!existsSync(rootAbs) || !existsSync(reviewerAbs)) return null;

  const rootPersonas = extractSectionBullets(readFileSync(rootAbs, "utf-8"), rootHeader);
  if (rootPersonas.length === 0) return null;

  const reviewerPersonas = new Set(extractSectionBullets(readFileSync(reviewerAbs, "utf-8"), reviewerHeader));
  const missing = rootPersonas.filter((persona) => !reviewerPersonas.has(persona));
  const path = `${rootPath} -> ${reviewerPath}`;
  return {
    ok: missing.length === 0,
    type: "persona",
    path,
    message: missing.length === 0
      ? "configured QA personas propagated to QA reviewer"
      : `configured QA personas missing from QA reviewer: ${missing.join(", ")}`,
  };
}

function extractSectionBullets(text, headerPattern) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headerPattern.test(line.trim()));
  if (start === -1) return [];
  const personas = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^##\s+/.test(line)) break;
    const match = /^-\s+(.+?)\s*$/.exec(line);
    if (match) personas.push(match[1]);
  }
  return personas;
}

function loadInstalledPluginIds(homeDir) {
  if (!homeDir) return [];
  const installedPath = resolve(homeDir, ".claude/plugins/installed_plugins.json");
  if (!existsSync(installedPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(installedPath, "utf-8"));
    const plugins = parsed && typeof parsed.plugins === "object" ? parsed.plugins : parsed;
    return plugins && typeof plugins === "object" ? Object.keys(plugins) : [];
  } catch {
    return [];
  }
}

export function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    platform: "auto",
    profile: "auto",
    json: false,
    strictFoundations: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--strict-foundations") args.strictFoundations = true;
    else if (arg.startsWith("--target=")) args.target = arg.slice("--target=".length);
    else if (arg === "--target") args.target = argv[++i];
    else if (arg.startsWith("--platform=")) args.platform = arg.slice("--platform=".length);
    else if (arg === "--platform") args.platform = argv[++i];
    else if (arg.startsWith("--profile=")) args.profile = arg.slice("--profile=".length);
    else if (arg === "--profile") args.profile = argv[++i];
    else if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`);
    } else {
      args.target = arg;
    }
  }
  return args;
}

export function printHuman(result) {
  const label = CONTRACTS[result.platform]?.label || result.platform;
  const printInstructions = (instructions) => {
    if (!Array.isArray(instructions) || instructions.length === 0) return;
    for (const instruction of instructions) {
      console.log(`    next: ${instruction}`);
    }
  };

  console.log(`harness doctor: ${result.ok ? "ok" : "failed"}`);
  console.log(`target: ${result.target}`);
  console.log(`platform: ${label}`);
  console.log(`profile: ${result.profile}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  if (result.failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const failure of result.failures) {
      console.log(`  - ${failure.message}`);
      if (failure.fix) console.log(`    fix: ${failure.fix}`);
      printInstructions(failure.instructions);
    }
  }
  if (result.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`  - ${warning.message}`);
      if (warning.fix) console.log(`    fix: ${warning.fix}`);
      printInstructions(warning.instructions);
    }
  }
}

export function runDoctorCli(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exitCode = 2;
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const result = runDoctor({
    target: args.target,
    platform: args.platform,
    profile: args.profile,
    strictFoundations: args.strictFoundations,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  process.exitCode = result.ok ? 0 : 1;
  return process.exitCode;
}
