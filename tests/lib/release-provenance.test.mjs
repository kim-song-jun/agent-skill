import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  RELEASE_MANIFEST_SCHEMA_VERSION,
  buildReleaseManifest,
  verifyReleaseManifest,
  writeReleaseManifest,
} from "../../scripts/release-provenance.mjs";

function writeRel(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function git(root, args) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  assert.equal(res.status, 0, `git ${args.join(" ")}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
}

test("release provenance manifest includes every marketplace plugin checksum", () => {
  const manifest = buildReleaseManifest({
    root: process.cwd(),
    release: "test-release",
    generatedBy: "tests",
    createdAt: "2026-06-11T00:00:00Z",
  });

  assert.equal(manifest.schemaVersion, RELEASE_MANIFEST_SCHEMA_VERSION);
  assert.equal(manifest.release, "test-release");
  assert.equal(manifest.plugins.length, 19);
  assert.equal(manifest.tests.manifestConsistency, "passed");
  assert.match(manifest.marketplace.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.ok(manifest.checksums.vendoredLibs.fileCount > 0);
  assert.ok(manifest.checksums.templateSnapshots.fileCount > 0);
  for (const plugin of manifest.plugins) {
    assert.match(plugin.checksum, /^sha256:[0-9a-f]{64}$/);
    assert.match(plugin.path, /^plugins\//);
  }
  assert.match(["signed", "unsigned", "none", "unknown"].join(","), new RegExp(manifest.signedTag.status));
});

test("release provenance writes manifest and verifies checksum sidecar", () => {
  const outRoot = mkdtempSync(resolve(tmpdir(), "agent-skill-provenance-current-"));
  try {
    const manifest = buildReleaseManifest({
      root: process.cwd(),
      release: "test-current",
      generatedBy: "tests",
      createdAt: "2026-06-11T00:00:00Z",
    });
    const output = writeReleaseManifest(manifest, {
      root: process.cwd(),
      outDir: outRoot,
    });

    assert.match(readFileSync(output.shaPath, "utf-8"), /^[0-9a-f]{64}\s+release-manifest\.json/);
    const report = verifyReleaseManifest({
      root: process.cwd(),
      manifestPath: output.manifestPath,
      checkVendoredLibs: true,
    });

    assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    assert.ok(report.checks.some((check) => check.name === "vendored lib sync"));
    assert.ok(report.checks.some((check) => check.name === "signed tag status" && check.severity === "warning"));
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});

test("release provenance verification fails when a plugin checksum drifts", () => {
  const root = mkdtempSync(resolve(tmpdir(), "agent-skill-provenance-drift-"));
  try {
    writeRel(root, ".claude-plugin/marketplace.json", JSON.stringify({
      plugins: [{ name: "demo-plugin", source: "./plugins/demo-plugin" }],
    }));
    writeRel(root, "plugins/demo-plugin/.claude-plugin/plugin.json", JSON.stringify({
      name: "demo-plugin",
      version: "1.0.0",
    }));
    writeRel(root, "plugins/demo-plugin/SKILL.md", "# Demo\n");
    git(root, ["init"]);
    git(root, ["config", "user.email", "provenance@example.com"]);
    git(root, ["config", "user.name", "Provenance Test"]);
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "fixture"]);

    const manifest = buildReleaseManifest({ root, release: "fixture", generatedBy: "tests" });
    const output = writeReleaseManifest(manifest, { root, outDir: "dist" });
    writeRel(root, "plugins/demo-plugin/SKILL.md", "# Demo changed\n");

    const report = verifyReleaseManifest({
      root,
      manifestPath: output.manifestPath,
      checkVendoredLibs: false,
    });

    assert.equal(report.ok, false);
    const checksum = report.checks.find((check) => check.name === "plugin directory checksums");
    assert.ok(checksum);
    assert.equal(checksum.ok, false);
    assert.match(checksum.details, /demo-plugin/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release provenance CLI builds no-write JSON for CI smoke", () => {
  const res = spawnSync(process.execPath, [
    resolve("scripts/release-provenance.mjs"),
    "--release=cli-smoke",
    "--no-write",
    "--json",
  ], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const report = JSON.parse(res.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.output, null);
  assert.equal(report.manifest.release, "cli-smoke");
  assert.equal(report.manifest.plugins.length, 19);
});

test("release provenance CLI verifies a generated manifest", () => {
  const outRoot = mkdtempSync(resolve(tmpdir(), "agent-skill-provenance-cli-"));
  try {
    const build = spawnSync(process.execPath, [
      resolve("scripts/release-provenance.mjs"),
      "--release=cli-verify",
      `--out-dir=${outRoot}`,
      "--json",
    ], {
      encoding: "utf-8",
    });
    assert.equal(build.status, 0, `stdout:\n${build.stdout}\nstderr:\n${build.stderr}`);
    const built = JSON.parse(build.stdout);

    const verify = spawnSync(process.execPath, [
      resolve("scripts/release-provenance.mjs"),
      "--verify",
      `--manifest=${built.output.manifestPath}`,
      "--skip-vendored-lib-check",
      "--json",
    ], {
      encoding: "utf-8",
    });

    assert.equal(verify.status, 0, `stdout:\n${verify.stdout}\nstderr:\n${verify.stderr}`);
    const report = JSON.parse(verify.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.manifest.release, "cli-verify");
    assert.ok(report.checks.some((check) => check.name === "manifest sha256 sidecar" && check.ok));
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});

