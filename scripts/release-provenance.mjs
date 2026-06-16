#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_MANIFEST_SCHEMA_VERSION = "agent-skill-release-manifest/v1";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MARKETPLACE = ".claude-plugin/marketplace.json";
const AGENTS_MARKETPLACE = ".agents/plugins/marketplace.json";
const DEFAULT_MANIFEST = "release-manifest.json";
const DEFAULT_SHA = "release-manifest.sha256";

export function buildReleaseManifest(options = {}) {
  const root = resolve(options.root || ROOT);
  const marketplacePath = options.marketplacePath || DEFAULT_MARKETPLACE;
  const marketplace = readJson(root, marketplacePath);
  const release = options.release || defaultReleaseId(root);
  const generatedBy = options.generatedBy || "scripts/release-provenance.mjs";
  const gitCommit = git(root, ["rev-parse", "HEAD"], { optional: true }).stdout.trim() || null;
  const plugins = readMarketplacePlugins(root, marketplacePath, marketplace);
  const signedTag = inspectSignedTag(root, gitCommit);
  const vendoredLibFiles = collectGroupFiles(root, ["plugins"], (file) => file.includes("/lib/"));
  const templateSnapshotFiles = collectGroupFiles(root, ["plugins", "tests"], (file) => (
    file.includes("/templates/") || file.includes("/__snapshots__/")
  ));

  const agentsMarketplacePath = AGENTS_MARKETPLACE;
  const agentsMarketplaceChecksum = existsSync(resolve(root, agentsMarketplacePath))
    ? checksumFile(resolve(root, agentsMarketplacePath))
    : null;

  const manifest = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    release,
    gitCommit,
    createdAt: options.createdAt || new Date().toISOString(),
    generatedBy,
    signedTag,
    marketplace: {
      path: marketplacePath,
      checksum: checksumFile(resolve(root, marketplacePath)),
      pluginCount: plugins.length,
    },
    agentsMarketplace: {
      path: agentsMarketplacePath,
      checksum: agentsMarketplaceChecksum,
    },
    plugins,
    checksums: {
      vendoredLibs: checksumFileGroup(root, vendoredLibFiles),
      templateSnapshots: checksumFileGroup(root, templateSnapshotFiles),
    },
    tests: {
      releaseSmoke: options.releaseSmoke || "not-run",
      manifestConsistency: plugins.length === (marketplace.plugins || []).length ? "passed" : "failed",
      vendoredLibSync: options.vendoredLibSync || "not-run",
    },
  };

  return manifest;
}

export function writeReleaseManifest(manifest, options = {}) {
  const root = resolve(options.root || ROOT);
  const outDir = resolve(root, options.outDir || join(".agent-skill/releases", manifest.release));
  mkdirSync(outDir, { recursive: true });
  const manifestPath = resolve(outDir, DEFAULT_MANIFEST);
  const shaPath = resolve(outDir, DEFAULT_SHA);
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(manifestPath, body);
  writeFileSync(shaPath, `${sha256(body)}  ${DEFAULT_MANIFEST}\n`);
  return { outDir, manifestPath, shaPath };
}

export function verifyReleaseManifest(options = {}) {
  const root = resolve(options.root || ROOT);
  const manifestPath = resolve(root, options.manifestPath || DEFAULT_MANIFEST);
  const checks = [];

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      root,
      manifestPath,
      checks: [{ ok: false, severity: "error", name: "release manifest exists", details: `${relative(root, manifestPath)} missing` }],
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  checks.push(checkSchema(manifest));
  checks.push(checkManifestSha(root, manifestPath));
  checks.push(checkGitCommit(root, manifest));
  checks.push(checkMarketplaceConsistency(root, manifest));
  checks.push(checkAgentsMarketplaceChecksum(root, manifest));
  checks.push(checkPluginChecksums(root, manifest));
  checks.push(checkAggregateChecksums(root, manifest));
  checks.push(checkSignedTag(manifest, Boolean(options.requireSignedTag)));

  if (options.checkVendoredLibs !== false) {
    checks.push(checkVendoredLibSync(root));
  }

  return {
    ok: checks.every((check) => check.ok),
    root,
    manifestPath,
    manifest: {
      schemaVersion: manifest.schemaVersion,
      release: manifest.release,
      gitCommit: manifest.gitCommit,
      pluginCount: Array.isArray(manifest.plugins) ? manifest.plugins.length : 0,
      signedTag: manifest.signedTag || { status: "unknown" },
    },
    checks,
  };
}

export function summarizeManifestForAudit(root = ROOT) {
  const manifest = buildReleaseManifest({
    root,
    release: "audit",
    generatedBy: "scripts/release-audit.mjs",
    createdAt: "audit",
  });
  const pluginsWithChecksums = manifest.plugins.filter((plugin) => /^sha256:[0-9a-f]{64}$/.test(plugin.checksum));
  return {
    ok: pluginsWithChecksums.length === manifest.plugins.length && manifest.tests.manifestConsistency === "passed",
    pluginCount: manifest.plugins.length,
    checksumCount: pluginsWithChecksums.length,
    signedTag: manifest.signedTag,
    manifestConsistency: manifest.tests.manifestConsistency,
    marketplaceChecksum: manifest.marketplace.checksum,
    agentsMarketplaceChecksum: manifest.agentsMarketplace?.checksum || null,
    vendoredLibChecksum: manifest.checksums.vendoredLibs.checksum,
    templateSnapshotChecksum: manifest.checksums.templateSnapshots.checksum,
  };
}

function readMarketplacePlugins(root, marketplacePath, marketplace) {
  const marketplaceDir = dirname(resolve(root, marketplacePath));
  return (marketplace.plugins || []).map((entry) => {
    const sourcePath = normalizeMarketplaceSource(root, marketplaceDir, entry.source);
    const relSource = relative(root, sourcePath).replaceAll("\\", "/");
    const manifestPath = findPluginManifest(sourcePath);
    const pluginManifest = manifestPath ? JSON.parse(readFileSync(manifestPath, "utf-8")) : {};
    return {
      name: entry.name,
      version: pluginManifest.version || null,
      path: relSource,
      manifestPath: manifestPath ? relative(root, manifestPath).replaceAll("\\", "/") : null,
      treeSha: readTreeSha(root, relSource),
      checksum: checksumDirectory(sourcePath),
    };
  });
}

function normalizeMarketplaceSource(root, marketplaceDir, source) {
  if (!source) return root;
  if (source.startsWith("./") || source.startsWith("../")) {
    const rootRelative = resolve(root, source);
    if (existsSync(rootRelative)) return rootRelative;
    return resolve(marketplaceDir, source);
  }
  return resolve(root, source);
}

function findPluginManifest(sourcePath) {
  const candidates = [
    resolve(sourcePath, ".claude-plugin/plugin.json"),
    resolve(sourcePath, ".codex-plugin/plugin.json"),
    resolve(sourcePath, "plugin.json"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function checksumDirectory(dir) {
  if (!existsSync(dir)) return null;
  const files = [];
  walkFiles(dir, files);
  return checksumEntries(dir, files);
}

function checksumFileGroup(root, files) {
  return {
    fileCount: files.length,
    checksum: checksumEntries(root, files.map((file) => resolve(root, file))),
  };
}

function checksumEntries(baseDir, files) {
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => relative(baseDir, a).localeCompare(relative(baseDir, b)))) {
    const rel = relative(baseDir, file).replaceAll("\\", "/");
    const stat = statSync(file);
    const mode = (stat.mode & 0o111) ? "100755" : "100644";
    hash.update(rel);
    hash.update("\0");
    hash.update(mode);
    hash.update("\0");
    hash.update(checksumFile(file));
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

function checksumFile(path) {
  return `sha256:${sha256(readFileSync(path))}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function collectGroupFiles(root, dirs, predicate) {
  const out = [];
  for (const dir of dirs) {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) continue;
    const files = [];
    walkFiles(abs, files);
    for (const file of files) {
      const rel = relative(root, file).replaceAll("\\", "/");
      if (predicate(rel)) out.push(rel);
    }
  }
  return out.sort();
}

function walkFiles(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "node_modules" || entry === ".DS_Store") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkFiles(path, out);
    } else if (stat.isFile()) {
      out.push(path);
    }
  }
}

function readTreeSha(root, relPath) {
  const res = git(root, ["ls-tree", "HEAD", "--", relPath], { optional: true });
  const line = res.stdout.trim();
  const match = line.match(/^[0-9]{6}\s+tree\s+([0-9a-f]{40})\s+/);
  return match ? match[1] : null;
}

function inspectSignedTag(root, gitCommit) {
  if (!gitCommit) return { status: "unknown", tag: null, details: "git commit unavailable" };
  const tagList = git(root, ["tag", "--points-at", gitCommit], { optional: true }).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (tagList.length === 0) {
    return { status: "none", tag: null, details: "no tag points at HEAD" };
  }
  for (const tag of tagList) {
    const verify = git(root, ["tag", "-v", tag], { optional: true });
    if (verify.status === 0) {
      return { status: "signed", tag, details: "git tag -v passed" };
    }
  }
  return {
    status: "unsigned",
    tag: tagList[0],
    details: "tag exists, but git tag -v did not verify a signature",
  };
}

function checkSchema(manifest) {
  return {
    ok: manifest.schemaVersion === RELEASE_MANIFEST_SCHEMA_VERSION,
    severity: "error",
    name: "manifest schema",
    details: manifest.schemaVersion || "missing schemaVersion",
  };
}

function checkManifestSha(root, manifestPath) {
  const shaPath = resolve(dirname(manifestPath), DEFAULT_SHA);
  if (!existsSync(shaPath)) {
    return { ok: false, severity: "error", name: "manifest sha256 sidecar", details: `${relative(root, shaPath)} missing` };
  }
  const expected = readFileSync(shaPath, "utf-8").trim().split(/\s+/, 1)[0];
  const actual = sha256(readFileSync(manifestPath));
  return {
    ok: expected === actual,
    severity: "error",
    name: "manifest sha256 sidecar",
    details: expected === actual ? "matched" : `expected ${expected}, got ${actual}`,
  };
}

function checkGitCommit(root, manifest) {
  const current = git(root, ["rev-parse", "HEAD"], { optional: true }).stdout.trim();
  if (!manifest.gitCommit || !current) {
    return { ok: false, severity: "error", name: "manifest git commit", details: "missing manifest or checkout commit" };
  }
  return {
    ok: manifest.gitCommit === current,
    severity: "error",
    name: "manifest git commit",
    details: manifest.gitCommit === current ? current : `manifest ${manifest.gitCommit}, checkout ${current}`,
  };
}

function checkMarketplaceConsistency(root, manifest) {
  const marketplacePath = manifest.marketplace?.path || DEFAULT_MARKETPLACE;
  const marketplace = readJson(root, marketplacePath);
  const manifestNames = new Set((manifest.plugins || []).map((plugin) => plugin.name));
  const marketplaceNames = new Set((marketplace.plugins || []).map((plugin) => plugin.name));
  const missing = [...marketplaceNames].filter((name) => !manifestNames.has(name));
  const extra = [...manifestNames].filter((name) => !marketplaceNames.has(name));
  return {
    ok: missing.length === 0 && extra.length === 0,
    severity: "error",
    name: "marketplace plugin list matches manifest",
    details: missing.length === 0 && extra.length === 0
      ? `${marketplaceNames.size} plugins matched`
      : `missing: ${missing.join(", ")}; extra: ${extra.join(", ")}`,
  };
}

function checkAgentsMarketplaceChecksum(root, manifest) {
  const path = manifest.agentsMarketplace?.path || AGENTS_MARKETPLACE;
  const absPath = resolve(root, path);
  if (!existsSync(absPath)) {
    return {
      ok: false,
      severity: "error",
      name: "agents marketplace checksum",
      details: `${path} missing`,
    };
  }
  const current = checksumFile(absPath);
  const recorded = manifest.agentsMarketplace?.checksum;
  return {
    ok: current === recorded,
    severity: "error",
    name: "agents marketplace checksum",
    details: current === recorded ? `matched (${path})` : `expected ${recorded}, got ${current}`,
  };
}

function checkPluginChecksums(root, manifest) {
  const failures = [];
  for (const plugin of manifest.plugins || []) {
    const current = checksumDirectory(resolve(root, plugin.path));
    if (current !== plugin.checksum) {
      failures.push(`${plugin.name}: expected ${plugin.checksum}, got ${current}`);
    }
  }
  return {
    ok: failures.length === 0,
    severity: "error",
    name: "plugin directory checksums",
    details: failures.length === 0 ? `${(manifest.plugins || []).length} plugin checksums matched` : failures.join("; "),
  };
}

function checkAggregateChecksums(root, manifest) {
  const vendoredFiles = collectGroupFiles(root, ["plugins"], (file) => file.includes("/lib/"));
  const templateFiles = collectGroupFiles(root, ["plugins", "tests"], (file) => (
    file.includes("/templates/") || file.includes("/__snapshots__/")
  ));
  const vendored = checksumFileGroup(root, vendoredFiles);
  const templates = checksumFileGroup(root, templateFiles);
  const failures = [];
  if (manifest.checksums?.vendoredLibs?.checksum !== vendored.checksum) failures.push("vendoredLibs");
  if (manifest.checksums?.templateSnapshots?.checksum !== templates.checksum) failures.push("templateSnapshots");
  return {
    ok: failures.length === 0,
    severity: "error",
    name: "aggregate checksums",
    details: failures.length === 0 ? "vendored libs and template snapshots matched" : `mismatched: ${failures.join(", ")}`,
  };
}

function checkSignedTag(manifest, requireSignedTag) {
  const status = manifest.signedTag?.status || "unknown";
  const ok = requireSignedTag ? status === "signed" : true;
  return {
    ok,
    severity: status === "signed" ? "info" : "warning",
    name: "signed tag status",
    details: `${status}${manifest.signedTag?.tag ? ` (${manifest.signedTag.tag})` : ""}`,
  };
}

function checkVendoredLibSync(root) {
  const res = spawnSync(process.execPath, [resolve(root, "scripts/sync-lib.mjs"), "--check"], {
    cwd: root,
    encoding: "utf-8",
  });
  const output = `${res.stdout}\n${res.stderr}`.trim();
  return {
    ok: res.status === 0,
    severity: "error",
    name: "vendored lib sync",
    details: res.status === 0 ? output : output || `sync-lib exited ${res.status}`,
  };
}

function readJson(root, path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf-8"));
}

function defaultReleaseId(root) {
  const date = new Date().toISOString().slice(0, 10);
  const sha = git(root, ["rev-parse", "--short=7", "HEAD"], { optional: true }).stdout.trim();
  return `rc-${date}-${sha || "unknown"}`;
}

function git(root, args, options = {}) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  if (!options.optional && res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${res.stderr || res.stdout}`);
  }
  return res;
}

function parseArgs(argv) {
  const args = {
    verify: false,
    json: false,
    noWrite: false,
    requireSignedTag: false,
    checkVendoredLibs: true,
    root: ROOT,
    release: null,
    outDir: null,
    manifestPath: null,
    generatedBy: "scripts/release-provenance.mjs",
  };

  for (const arg of argv) {
    if (arg === "--verify") args.verify = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--no-write") args.noWrite = true;
    else if (arg === "--require-signed-tag") args.requireSignedTag = true;
    else if (arg === "--skip-vendored-lib-check") args.checkVendoredLibs = false;
    else if (arg.startsWith("--root=")) args.root = resolve(arg.slice("--root=".length));
    else if (arg.startsWith("--release=")) args.release = arg.slice("--release=".length);
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--manifest=")) args.manifestPath = arg.slice("--manifest=".length);
    else if (arg.startsWith("--generated-by=")) args.generatedBy = arg.slice("--generated-by=".length);
    else if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/release-provenance.mjs --release=<id> [--out-dir=<dir>]
  node scripts/release-provenance.mjs --verify --manifest=<path>

Options:
  --json                         Emit JSON report.
  --no-write                     Build the manifest but do not write files.
  --require-signed-tag           Treat unsigned/missing tags as verification failure.
  --skip-vendored-lib-check      Skip sync-lib.mjs --check during verification.
`);
}

function printHuman(report, mode) {
  if (mode === "verify") {
    console.log(`release provenance verify: ${report.ok ? "ok" : "failed"}`);
    for (const check of report.checks) {
      console.log(`- ${check.ok ? "ok" : "FAIL"} ${check.name}: ${check.details}`);
    }
    return;
  }
  console.log(`release provenance manifest: ${report.ok ? "ok" : "failed"}`);
  console.log(`- release: ${report.manifest.release}`);
  console.log(`- plugins: ${report.manifest.plugins.length}`);
  console.log(`- signed tag: ${report.manifest.signedTag.status}`);
  if (report.output) {
    console.log(`- wrote: ${relative(report.root, report.output.manifestPath)}`);
    console.log(`- wrote: ${relative(report.root, report.output.shaPath)}`);
  } else {
    console.log("- wrote: no files (--no-write)");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.verify) {
      const report = verifyReleaseManifest({
        root: args.root,
        manifestPath: args.manifestPath || DEFAULT_MANIFEST,
        requireSignedTag: args.requireSignedTag,
        checkVendoredLibs: args.checkVendoredLibs,
      });
      if (args.json) console.log(JSON.stringify(report, null, 2));
      else printHuman(report, "verify");
      process.exit(report.ok ? 0 : 1);
    }

    const manifest = buildReleaseManifest({
      root: args.root,
      release: args.release || undefined,
      generatedBy: args.generatedBy,
    });
    const output = args.noWrite ? null : writeReleaseManifest(manifest, {
      root: args.root,
      outDir: args.outDir || undefined,
    });
    const report = { ok: true, root: args.root, manifest, output };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report, "build");
  } catch (error) {
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}
