import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { buildReleaseCandidateReport } from "../../scripts/release-candidate.mjs";

function writeRel(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function git(root, args) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  assert.equal(res.status, 0, `git ${args.join(" ")}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
}

function makeFixture({ readme, readmeKo }) {
  const root = mkdtempSync(resolve(tmpdir(), "release-candidate-"));
  writeRel(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      plugins: [
        { name: "harness-builder", source: "./plugins/harness-builder" },
        { name: "harness-floor", source: "./plugins/harness-floor" },
      ],
    }),
  );
  writeRel(root, "plugins/harness-builder/plugin.json", JSON.stringify({ name: "harness-builder", version: "0.6.1" }));
  writeRel(root, "plugins/harness-floor/plugin.json", JSON.stringify({ name: "harness-floor", version: "0.6.1" }));
  writeRel(root, "README.md", readme);
  writeRel(root, "README.ko.md", readmeKo);
  writeRel(root, "CHANGELOG.md", "# Changelog\n\nDate-stamped tags exist for each release candidate.\n\n## Unreleased\n");
  writeRel(root, "CHANGELOG.ko.md", "# 변경 로그\n\n각 릴리스 후보에 대한 날짜 스탬프 태그가 존재합니다.\n\n## 미출시\n");
  writeRel(
    root,
    "tests/manual-checklist.md",
    [
      "# Release validation checklist",
      "## Release Candidate Lifecycle",
      "`git rev-parse HEAD`",
      "`node scripts/github-governance-check.mjs`",
      "`node scripts/docs-structure-check.mjs`",
      "`node scripts/release-provenance.mjs --release=rc-YYYY-MM-DD-SHORTSHA --out-dir=.agent-skill/releases/rc-YYYY-MM-DD-SHORTSHA`",
      "`./scripts/release-smoke.sh --fast --with-live-cli`",
      "`node scripts/generate-support-matrix.mjs --check`",
      "Create a date-stamped release-candidate tag.",
      "Roll back only to a previous verified tag/SHA.",
      "",
    ].join("\n"),
  );
  git(root, ["init"]);
  git(root, ["config", "user.email", "release@example.com"]);
  git(root, ["config", "user.name", "Release Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);
  return root;
}

test("release-candidate report validates current checkout evidence", () => {
  const report = buildReleaseCandidateReport({
    root: process.cwd(),
    date: "2026-06-02",
    allowDirty: true,
  });

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
  assert.match(report.git.head, /^[0-9a-f]{40}$/);
  assert.match(report.recommendedTag, /^rc-2026-06-02-[0-9a-f]{7}$/);
  assert.equal(report.plugins.count, 19);
  assert.equal(report.plugins.manifests.find((plugin) => plugin.name === "harness-builder").version, "0.7.18");
  assert.equal(report.plugins.manifests.find((plugin) => plugin.name === "harness-floor").version, "0.7.18");
  assert.ok(report.gateCommands.includes("./scripts/release-smoke.sh --fast --with-live-cli"));
  assert.ok(report.gateCommands.includes("node scripts/github-governance-check.mjs"));
  assert.ok(report.gateCommands.includes("node scripts/docs-structure-check.mjs"));
  assert.ok(
    report.gateCommands.includes(
      `node scripts/release-provenance.mjs --release=${report.recommendedTag} --out-dir=.agent-skill/releases/${report.recommendedTag}`,
    ),
  );
  assert.ok(report.gateCommands.includes("node scripts/skill-eval.mjs --smoke --no-write --json"));
  assert.ok(report.gateCommands.includes("node scripts/release-publish-preflight.mjs --base=origin/main"));
  assert.ok(report.gateCommands.includes("node scripts/generate-support-matrix.mjs --check"));
  assert.ok(
    report.gateCommands.includes("node scripts/target-project-smoke.mjs --target=/path/to/target --platform=claude,codex --lang=ko"),
  );
  assert.ok(
    report.checks.some(
      (check) => check.ok && check.name === "README/README.ko Versioning matches plugin manifests",
    ),
  );
  assert.equal(report.provenance.schemaVersion, "agent-skill-release-manifest/v1");
  assert.equal(report.provenance.pluginCount, 19);
  assert.equal(report.provenance.release, report.recommendedTag);
  assert.match(report.provenance.marketplaceChecksum, /^sha256:[0-9a-f]{64}$/);
  assert.ok(report.rollout.some((command) => command.includes("--verify-provenance --manifest=/path/to/release-manifest.json")));
  assert.ok(report.rollout.some((command) => command.includes("--verify-checksums --manifest=/path/to/release-manifest.json")));
  assert.ok(
    report.checks.some(
      (check) => check.ok && check.name === "release provenance manifest can be generated",
    ),
  );
});

test("release-candidate report fails stale README Versioning wording", () => {
  const root = makeFixture({
    readme:
      "## Status\n\nVersioning: `harness-builder` at `v0.3.0`, `harness-floor` at `v0.5.1`, other Claude Code core plugins at `v0.2.0`.\n",
    readmeKo:
      "## 상태\n\n버전: `harness-builder` `v0.3.0`, `harness-floor` `v0.5.1`, 나머지 Claude Code 코어 플러그인 `v0.2.0`.\n",
  });

  const report = buildReleaseCandidateReport({ root, date: "2026-06-02" });

  assert.equal(report.ok, false);
  const versioning = report.checks.find((check) => check.name === "README/README.ko Versioning matches plugin manifests");
  assert.ok(versioning);
  assert.equal(versioning.ok, false);
  assert.match(versioning.details, /other Claude Code core plugins/);
  const stale = report.checks.find((check) => check.name === "no stale deferred/mock release wording in public release docs");
  assert.ok(stale);
  assert.equal(stale.ok, false);
});

test("release-candidate CLI emits JSON evidence", () => {
  const res = spawnSync(process.execPath, [
    resolve("scripts/release-candidate.mjs"),
    "--json",
    "--allow-dirty",
    "--date=2026-06-02",
  ], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const report = JSON.parse(res.stdout);
  assert.equal(report.ok, true);
  assert.match(report.recommendedTag, /^rc-2026-06-02-[0-9a-f]{7}$/);
  assert.equal(report.checks.find((check) => check.name === "marketplace plugins align with plugin manifests").ok, true);
  assert.equal(report.checks.find((check) => check.name === "release provenance manifest can be generated").ok, true);
  assert.equal(report.provenance.pluginCount, 19);
});
