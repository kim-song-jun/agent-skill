#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleaseManifest } from "./release-provenance.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GATE_COMMANDS = [
  "node scripts/release-audit.mjs",
  "node scripts/github-governance-check.mjs",
  "node scripts/docs-structure-check.mjs",
  "node scripts/release-provenance.mjs --release=<recommendedTag> --out-dir=.agent-skill/releases/<recommendedTag>",
  "node scripts/release-fixture-smoke.mjs",
  "node scripts/skill-eval.mjs --smoke --no-write --json",
  "./scripts/release-smoke.sh --fast --with-live-cli",
  "node scripts/release-publish-preflight.mjs --base=origin/main",
  "node scripts/target-project-smoke.mjs --target=/path/to/target --platform=claude,codex --lang=ko",
  "node --test",
  "node scripts/sync-lib.mjs --check",
  "node scripts/generate-support-matrix.mjs --check",
];

const STALE_RELEASE_WORDING = [
  /other Claude Code core plugins at `v0\.2\.0`/i,
  /나머지 Claude Code 코어 플러그인 `v0\.2\.0`/i,
  /Real Anthropic\/OpenAI\/Vertex SDK hookups \(replace mock toolCallers\)/i,
  /실제 Anthropic\/OpenAI\/Vertex SDK 연결 \(mock toolCaller 대체\)/i,
  /Currently mock toolCallers|현재 mock toolCaller/i,
  /stable--cli--verification--pending|CLI verification pending|CLI 검증 대기/i,
];

export function buildReleaseCandidateReport(options = {}) {
  const root = resolve(options.root || ROOT);
  const date = options.date || new Date().toISOString().slice(0, 10);
  const allowDirty = Boolean(options.allowDirty);
  const marketplace = readJson(root, ".claude-plugin/marketplace.json");
  const marketplacePlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const marketplaceManifests = readMarketplaceManifests(root, marketplacePlugins);
  const allManifestFiles = findPluginManifestFiles(resolve(root, "plugins"));
  const allManifests = allManifestFiles.map((file) => ({
    file: relative(root, file),
    manifest: JSON.parse(readFileSync(file, "utf-8")),
  }));
  const git = readGitState(root);
  const shortSha = git.head ? git.head.slice(0, 7) : "unknown";
  const recommendedTag = `rc-${date}-${shortSha}`;
  const gateCommands = GATE_COMMANDS.map((command) => command.replaceAll("<recommendedTag>", recommendedTag));
  const provenanceManifest = buildReleaseManifest({
    root,
    release: recommendedTag,
    generatedBy: "scripts/release-candidate.mjs",
    createdAt: "release-candidate-preview",
  });

  const checks = [
    checkGitHead(git),
    checkCleanWorktree(git, allowDirty),
    checkMarketplaceManifestAlignment(marketplacePlugins, marketplaceManifests, allManifests),
    checkReleaseProvenance(provenanceManifest, marketplacePlugins),
    checkReadmeVersioning(root, marketplaceManifests),
    checkChangelog(root),
    checkManualLifecycle(root),
    checkNoStaleReleaseWording(root, ["README.md", "README.ko.md", "CHANGELOG.md", "CHANGELOG.ko.md"]),
  ];

  return {
    ok: checks.every((check) => check.ok),
    root,
    generatedAt: new Date().toISOString(),
    date,
    git,
    recommendedTag,
    gateCommands,
    provenance: {
      schemaVersion: provenanceManifest.schemaVersion,
      release: provenanceManifest.release,
      pluginCount: provenanceManifest.plugins.length,
      marketplaceChecksum: provenanceManifest.marketplace.checksum,
      signedTag: provenanceManifest.signedTag,
      manifestCommand: gateCommands.find((command) => command.includes("release-provenance.mjs")),
    },
    checks,
    plugins: {
      count: marketplacePlugins.length,
      manifests: marketplaceManifests.map(({ marketplaceEntry, file, manifest }) => ({
        name: manifest.name,
        version: manifest.version,
        source: marketplaceEntry.source,
        manifest: file,
      })),
    },
    rollout: [
      "/plugin marketplace update agent-skill",
      "scripts/update.sh --verify-provenance --manifest=/path/to/release-manifest.json",
      "scripts/update.sh --cli=codex --verify-provenance --manifest=/path/to/release-manifest.json",
      "scripts/install-platform.sh --platform=claude|codex --target=/path/to/project --verify-checksums --manifest=/path/to/release-manifest.json",
    ],
    rollback: [
      "checkout the previous verified tag/SHA",
      "rerun the documented update/install path",
      "run the project-local doctor after rollback",
    ],
  };
}

function readGitState(root) {
  return {
    head: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
    branch: git(root, ["branch", "--show-current"]).stdout.trim(),
    status: git(root, ["status", "--porcelain"]).stdout.trim(),
    latestTag: git(root, ["describe", "--tags", "--abbrev=0"], { optional: true }).stdout.trim(),
  };
}

function checkGitHead(gitState) {
  return {
    ok: /^[0-9a-f]{40}$/i.test(gitState.head),
    name: "git rev-parse HEAD records a verified commit",
    details: /^[0-9a-f]{40}$/i.test(gitState.head) ? gitState.head : "missing HEAD SHA",
  };
}

function checkCleanWorktree(gitState, allowDirty) {
  const ok = allowDirty || gitState.status.length === 0;
  return {
    ok,
    name: "clean worktree before release-candidate tagging",
    details: ok ? (allowDirty && gitState.status ? "allowed dirty worktree for inspection" : "clean") : gitState.status,
  };
}

function checkMarketplaceManifestAlignment(marketplacePlugins, marketplaceManifests, allManifests) {
  const marketplaceNames = new Set(marketplacePlugins.map((plugin) => plugin.name));
  const sourceProblems = marketplaceManifests
    .filter(({ ok }) => !ok)
    .map(({ marketplaceEntry, reason }) => `${marketplaceEntry.name}: ${reason}`);
  const nameProblems = marketplaceManifests
    .filter(({ ok, manifest, marketplaceEntry }) => ok && manifest.name !== marketplaceEntry.name)
    .map(({ marketplaceEntry, manifest }) => `${marketplaceEntry.name}: manifest name is ${manifest.name}`);
  const unlisted = allManifests
    .filter(({ manifest }) => manifest.name && !marketplaceNames.has(manifest.name))
    .map(({ manifest }) => manifest.name);
  const missingVersions = marketplaceManifests
    .filter(({ ok, manifest }) => ok && !semverish(manifest.version))
    .map(({ marketplaceEntry }) => marketplaceEntry.name);
  const problems = [...sourceProblems, ...nameProblems];

  return {
    ok: problems.length === 0 && unlisted.length === 0 && missingVersions.length === 0,
    name: "marketplace plugins align with plugin manifests",
    details: [
      problems.length > 0 ? `source/name problems: ${problems.join(", ")}` : null,
      unlisted.length > 0 ? `manifest not listed in marketplace: ${unlisted.join(", ")}` : null,
      missingVersions.length > 0 ? `missing/invalid versions: ${missingVersions.join(", ")}` : null,
      problems.length === 0 && unlisted.length === 0 && missingVersions.length === 0
        ? `${marketplacePlugins.length} marketplace plugins matched`
        : null,
    ].filter(Boolean).join("; "),
  };
}

function checkReleaseProvenance(manifest, marketplacePlugins) {
  const pluginNames = new Set(manifest.plugins.map((plugin) => plugin.name));
  const missing = marketplacePlugins.map((plugin) => plugin.name).filter((name) => !pluginNames.has(name));
  const missingChecksums = manifest.plugins
    .filter((plugin) => !/^sha256:[0-9a-f]{64}$/.test(plugin.checksum || ""))
    .map((plugin) => plugin.name);
  return {
    ok: missing.length === 0 && missingChecksums.length === 0 && manifest.tests.manifestConsistency === "passed",
    name: "release provenance manifest can be generated",
    details:
      missing.length === 0 && missingChecksums.length === 0
        ? `${manifest.plugins.length} plugin checksums; signed tag: ${manifest.signedTag.status}`
        : `missing plugins: ${missing.join(", ")}; missing checksums: ${missingChecksums.join(", ")}`,
  };
}

function checkReadmeVersioning(root, marketplaceManifests) {
  const manifests = marketplaceManifests.filter(({ ok }) => ok).map(({ manifest }) => manifest);
  const distinctVersions = [...new Set(manifests.map((manifest) => `v${manifest.version}`))].sort();
  const namedRequirements = ["harness-builder", "harness-floor"]
    .map((name) => manifests.find((manifest) => manifest.name === name))
    .filter(Boolean)
    .map((manifest) => ({
      name: manifest.name,
      version: `v${manifest.version}`,
      pattern: new RegExp(`${escapeRegex(manifest.name)}[\\s\\S]{0,140}${escapeRegex(`v${manifest.version}`)}`),
    }));

  const failures = [];
  for (const file of ["README.md", "README.ko.md"]) {
    const text = readText(root, file);
    if (!/Versioning|버전/.test(text)) {
      failures.push(`${file}: missing Versioning section`);
    }
    for (const version of distinctVersions) {
      if (!text.includes(version)) failures.push(`${file}: missing ${version}`);
    }
    for (const requirement of namedRequirements) {
      if (!requirement.pattern.test(text)) {
        failures.push(`${file}: ${requirement.name} not paired with ${requirement.version}`);
      }
    }
    for (const stale of STALE_RELEASE_WORDING) {
      if (stale.test(text)) failures.push(`${file}: stale release wording ${stale}`);
    }
  }

  return {
    ok: failures.length === 0,
    name: "README/README.ko Versioning matches plugin manifests",
    details: failures.length === 0 ? `versions documented: ${distinctVersions.join(", ")}` : failures.join("; "),
  };
}

function checkChangelog(root) {
  const failures = [];
  for (const file of ["CHANGELOG.md", "CHANGELOG.ko.md"]) {
    const text = readText(root, file);
    if (!/Date-stamped tags|날짜 스탬프 태그/.test(text)) {
      failures.push(`${file}: missing date-stamped tag policy`);
    }
    if (!/^## (Unreleased|미출시)$/m.test(text)) {
      failures.push(`${file}: missing canonical Unreleased heading`);
    }
    if (/^## \[(Unreleased|미출시)\]$/m.test(text)) {
      failures.push(`${file}: stale bracketed Unreleased heading`);
    }
  }
  return {
    ok: failures.length === 0,
    name: "CHANGELOG files are release-candidate ready",
    details: failures.length === 0 ? "matched" : failures.join("; "),
  };
}

function checkManualLifecycle(root) {
  const text = readText(root, "tests/manual-checklist.md");
  const missing = [
    /Release Candidate Lifecycle/,
    /git rev-parse HEAD/,
    /github-governance-check\.mjs/,
    /docs-structure-check\.mjs/,
    /release-provenance\.mjs --release=/,
    /release-smoke\.sh --fast --with-live-cli/,
    /generate-support-matrix\.mjs --check/,
    /date-stamped release-candidate tag/,
    /Roll back only to a previous verified tag\/SHA/,
  ].filter((pattern) => !pattern.test(text));
  return {
    ok: missing.length === 0,
    name: "manual release map includes release-candidate lifecycle",
    details: missing.length === 0 ? "matched" : `missing: ${missing.map(String).join(", ")}`,
  };
}

function checkNoStaleReleaseWording(root, files) {
  const failures = [];
  for (const file of files) {
    const text = readText(root, file);
    for (const pattern of STALE_RELEASE_WORDING) {
      if (pattern.test(text)) failures.push(`${file}: ${pattern}`);
    }
  }
  return {
    ok: failures.length === 0,
    name: "no stale deferred/mock release wording in public release docs",
    details: failures.length === 0 ? "matched" : failures.join("; "),
  };
}

function readMarketplaceManifests(root, marketplacePlugins) {
  return marketplacePlugins.map((marketplaceEntry) => {
    const candidates = [
      resolve(root, marketplaceEntry.source || "", "plugin.json"),
      resolve(root, marketplaceEntry.source || "", ".claude-plugin/plugin.json"),
    ];
    const file = candidates.find((candidate) => existsSync(candidate));
    if (!file) {
      return { ok: false, marketplaceEntry, reason: "missing plugin.json or .claude-plugin/plugin.json" };
    }
    return {
      ok: true,
      marketplaceEntry,
      file: relative(root, file),
      manifest: JSON.parse(readFileSync(file, "utf-8")),
    };
  });
}

function findPluginManifestFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  walk(root, out);
  return out.filter((file) => file.endsWith("plugin.json"));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, out);
    } else if (stat.isFile()) {
      out.push(path);
    }
  }
}

function readJson(root, file) {
  return JSON.parse(readText(root, file));
}

function readText(root, file) {
  return readFileSync(resolve(root, file), "utf-8");
}

function git(root, args, options = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  if (!options.optional && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.status === 0 ? result : { stdout: "", stderr: result.stderr || result.stdout };
}

function semverish(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || ""));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const args = { json: false, allowDirty: false };
  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--allow-dirty") {
      args.allowDirty = true;
    } else if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--root=")) {
      args.root = arg.slice("--root=".length);
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function printHuman(report) {
  console.log(`release candidate evidence: ${report.ok ? "ok" : "failed"}`);
  console.log(`head: ${report.git.head || "unknown"}`);
  console.log(`branch: ${report.git.branch || "(detached)"}`);
  console.log(`latest tag: ${report.git.latestTag || "(none)"}`);
  console.log(`recommended tag: ${report.recommendedTag}`);
  for (const check of report.checks) {
    console.log(`  ${check.ok ? "ok" : "fail"} - ${check.name}: ${check.details}`);
  }
  console.log("gate commands:");
  for (const command of report.gateCommands) {
    console.log(`  ${command}`);
  }
}

function printHelp() {
  console.log("Usage: node scripts/release-candidate.mjs [--json] [--allow-dirty] [--date=YYYY-MM-DD] [--root=PATH]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const report = buildReleaseCandidateReport(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
