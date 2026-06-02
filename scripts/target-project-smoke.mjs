#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PLATFORMS = ["claude", "codex"];

export function buildTargetProjectSmokeReport(options = {}) {
  const root = resolve(options.root || ROOT);
  const target = resolveRequiredTarget(options.target);
  const platforms = normalizePlatforms(options.platforms || DEFAULT_PLATFORMS);
  const lang = options.lang || "auto";
  const runner = options.runner || runCommand;

  const targetGit = readTargetGitState(target, runner);
  const platformReports = platforms.map((platform) => smokePlatform({ root, target, platform, lang, runner }));
  const ok = platformReports.every((report) => report.dryRun.ok && report.doctor.ok);

  return {
    ok,
    root,
    target,
    generatedAt: new Date().toISOString(),
    targetGit,
    platforms: platformReports,
  };
}

function smokePlatform({ root, target, platform, lang, runner }) {
  const dryRunArgs = [
    resolve(root, "scripts/install-platform.sh"),
    `--platform=${platform}`,
    `--target=${target}`,
    "--dry-run",
    "--no-update-foundations",
    `--lang=${lang}`,
  ];
  const dryRun = normalizeCommandResult(
    runner({
      command: "bash",
      args: dryRunArgs,
      cwd: root,
      label: `${platform} install-platform dry-run`,
      platform,
    }),
  );

  const doctorArgs = [
    resolve(root, "scripts/doctor.mjs"),
    `--target=${target}`,
    `--platform=${platform}`,
    "--profile=operational",
    "--json",
  ];
  const doctorCommand = normalizeCommandResult(
    runner({
      command: process.execPath,
      args: doctorArgs,
      cwd: root,
      label: `${platform} operational doctor`,
      platform,
    }),
  );
  const doctorJson = parseJsonObject(doctorCommand.stdout);

  return {
    platform,
    dryRun: {
      ok: dryRun.status === 0,
      status: dryRun.status,
      command: printableCommand("bash", dryRunArgs),
      stdout: dryRun.stdout,
      stderr: dryRun.stderr,
    },
    doctor: {
      ok: Boolean(doctorJson?.ok),
      status: doctorCommand.status,
      command: printableCommand(process.execPath, doctorArgs),
      summary: doctorJson?.summary || null,
      failures: Array.isArray(doctorJson?.failures) ? doctorJson.failures : [],
      warnings: Array.isArray(doctorJson?.warnings) ? doctorJson.warnings : [],
      stdout: doctorJson ? undefined : doctorCommand.stdout,
      stderr: doctorCommand.stderr,
    },
    recommendation: buildRecommendation({ root, target, platform, lang, doctorJson }),
  };
}

function buildRecommendation({ root, target, platform, lang, doctorJson }) {
  if (doctorJson?.ok) {
    return "Target already satisfies the operational doctor for this platform.";
  }
  return [
    "Refresh project-local harness artifacts, then rerun doctor:",
    printableCommand("bash", [
      resolve(root, "scripts/install-platform.sh"),
      `--platform=${platform}`,
      `--target=${target}`,
      "--force",
      "--no-update-foundations",
      `--lang=${lang}`,
    ]),
  ].join(" ");
}

function readTargetGitState(target, runner) {
  const inside = normalizeCommandResult(
    runner({
      command: "git",
      args: ["-C", target, "rev-parse", "--is-inside-work-tree"],
      cwd: target,
      label: "target git probe",
      platform: null,
    }),
  );
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return { insideWorkTree: false, branch: null, dirtyEntries: null };
  }

  const status = normalizeCommandResult(
    runner({
      command: "git",
      args: ["-C", target, "status", "--short", "--branch"],
      cwd: target,
      label: "target git status",
      platform: null,
    }),
  );
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  return {
    insideWorkTree: true,
    branch: lines[0] || null,
    dirtyEntries: Math.max(0, lines.length - 1),
  };
}

function runCommand({ command, args, cwd }) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function normalizeCommandResult(result) {
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveRequiredTarget(target) {
  if (!target) {
    throw new Error("missing required --target=<dir>");
  }
  const abs = resolve(target);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(`target is not a directory: ${abs}`);
  }
  return abs;
}

function normalizePlatforms(value) {
  const platforms = Array.isArray(value) ? value : String(value).split(",");
  const normalized = platforms.map((item) => String(item).trim()).filter(Boolean);
  const invalid = normalized.filter((platform) => !DEFAULT_PLATFORMS.includes(platform));
  if (invalid.length > 0) {
    throw new Error(`unsupported platform(s): ${invalid.join(", ")}; expected claude,codex`);
  }
  return normalized.length > 0 ? normalized : DEFAULT_PLATFORMS;
}

function printableCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function parseArgs(argv) {
  const args = {
    target: null,
    platforms: DEFAULT_PLATFORMS,
    lang: "auto",
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg.startsWith("--target=")) {
      args.target = arg.slice("--target=".length);
    } else if (arg.startsWith("--platform=")) {
      args.platforms = arg.slice("--platform=".length).split(",");
    } else if (arg.startsWith("--lang=")) {
      args.lang = arg.slice("--lang=".length);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHuman(report) {
  console.log(`target project smoke: ${report.ok ? "ok" : "failed"}`);
  console.log(`target: ${report.target}`);
  console.log("safety: No files were written; this runs dry-run install rehearsals and doctors only.");
  if (report.targetGit.insideWorkTree) {
    console.log(`git: ${report.targetGit.branch || "unknown"} (${report.targetGit.dirtyEntries} changed entries)`);
  } else {
    console.log("git: not a worktree");
  }
  for (const platform of report.platforms) {
    const summary = platform.doctor.summary
      ? `${platform.doctor.summary.passed}/${platform.doctor.summary.total}`
      : "no doctor JSON";
    console.log(
      `${platform.platform}: dry-run ${platform.dryRun.ok ? "ok" : "failed"}; doctor ${
        platform.doctor.ok ? "ok" : "failed"
      } (${summary})`,
    );
    if (!platform.doctor.ok) {
      const topFailures = platform.doctor.failures.slice(0, 5).map((failure) => failure.path || failure.message);
      for (const failure of topFailures) {
        console.log(`  - ${failure}`);
      }
      if (platform.doctor.failures.length > topFailures.length) {
        console.log(`  - ... ${platform.doctor.failures.length - topFailures.length} more`);
      }
      console.log(`  next: ${platform.recommendation}`);
    }
  }
}

function printUsage() {
  console.log(`Usage: node scripts/target-project-smoke.mjs --target=<dir> [--platform=claude,codex] [--lang=en|ko|auto] [--json]

Runs a no-write deployment rehearsal against a real target project:
  - install-platform.sh --dry-run --no-update-foundations
  - doctor.mjs --profile=operational --json

No files were written by this command; refresh commands are printed as next-step
recommendations when the target scaffold is stale.

The command exits non-zero when any selected platform cannot be dry-run or does
not satisfy the operational doctor.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = buildTargetProjectSmokeReport(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exit(2);
  }
}
