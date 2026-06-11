import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactPaths,
  docsExportPathForArtifact,
  handoffPathsForTaskPath,
  mirrorArtifactToDocs,
  normalizeTaskPath,
  resolveArtifactRoot,
  shouldExportDocs,
} from "../../../plugins/harness-floor/skills/agent-all/lib/artifact-paths.mjs";

test("artifact paths default control-plane output to .agent-skill", () => {
  assert.equal(resolveArtifactRoot({}), ".agent-skill");
  assert.deepEqual(artifactPaths({}), {
    root: ".agent-skill",
    tasksDir: ".agent-skill/tasks",
    specsDir: ".agent-skill/specs",
    plansDir: ".agent-skill/plans",
    decisionsDir: ".agent-skill/decisions",
    handoffDir: ".agent-skill/handoff",
    runsDir: ".agent-skill/runs",
    registryDir: ".agent-skill/registry",
    taskRegistryPath: ".agent-skill/registry/tasks.json",
    reportsDir: ".agent-skill/reports",
    visualQaDir: ".agent-skill/reports/visual-qa",
    debugReportsDir: ".agent-skill/reports/debug",
    thriftReportsDir: ".agent-skill/reports/thrift",
    baselinesDir: ".agent-skill/baselines",
    legacyTasksDir: "docs/tasks",
  });
});

test("artifact root can be configured with legacy alias or artifact.root", () => {
  assert.equal(resolveArtifactRoot({ artifactRoot: ".custom-agent" }), ".custom-agent");
  assert.equal(resolveArtifactRoot({ artifact: { root: ".ops" } }), ".ops");
  assert.equal(artifactPaths({ artifact: { root: ".ops" } }).tasksDir, ".ops/tasks");
  assert.deepEqual(handoffPathsForTaskPath(".ops/tasks/12-x.md", { handoffDir: artifactPaths({ artifactRoot: ".ops" }).handoffDir }), {
    handoffPath: ".ops/handoff/12-x.handoff.md",
    sessionPath: ".ops/handoff/12-x.session.md",
  });
});

test("task path normalization prefers new tasks dir while accepting legacy docs tasks", () => {
  assert.equal(normalizeTaskPath("1-demo.md"), ".agent-skill/tasks/1-demo.md");
  assert.equal(normalizeTaskPath("./2-demo.md"), ".agent-skill/tasks/2-demo.md");
  assert.equal(normalizeTaskPath(".agent-skill/tasks/3-demo.md"), ".agent-skill/tasks/3-demo.md");
  assert.equal(normalizeTaskPath(".agent-skill/tasks/T-20260611-001-demo.md"), ".agent-skill/tasks/T-20260611-001-demo.md");
  assert.equal(normalizeTaskPath("docs/tasks/4-demo.md"), "docs/tasks/4-demo.md");
  assert.equal(normalizeTaskPath("src/readme.md"), null);
});

test("handoff paths default to .agent-skill/handoff and retain legacy sibling mode", () => {
  assert.deepEqual(handoffPathsForTaskPath("docs/tasks/12-x.md"), {
    handoffPath: ".agent-skill/handoff/12-x.handoff.md",
    sessionPath: ".agent-skill/handoff/12-x.session.md",
  });
  assert.deepEqual(handoffPathsForTaskPath("docs/tasks/12-x.md", { legacySibling: true }), {
    handoffPath: "docs/tasks/12-x.handoff.md",
    sessionPath: "docs/tasks/12-x.session.md",
  });
});

test("docs export only mirrors explicit publication-safe artifact classes", () => {
  const config = { artifact: { root: ".ops", exportDocs: true } };
  assert.equal(shouldExportDocs(config), true);
  assert.equal(
    docsExportPathForArtifact(".ops/reports/visual-qa/run/report.md", { config }),
    "docs/reports/visual-qa/run/report.md",
  );
  assert.equal(
    docsExportPathForArtifact(".ops/specs/2026-06-11-feature.md", { config }),
    "docs/superpowers/specs/2026-06-11-feature.md",
  );
  assert.equal(
    docsExportPathForArtifact(".ops/plans/2026-06-11-feature.md", { config }),
    "docs/superpowers/plans/2026-06-11-feature.md",
  );
  assert.equal(
    docsExportPathForArtifact(".ops/tasks/T-20260611-001-demo.md", { config }),
    "docs/tasks/T-20260611-001-demo.md",
  );
  assert.equal(docsExportPathForArtifact(".ops/runs/run-1/policy-log.jsonl", { config }), null);
  assert.equal(docsExportPathForArtifact(".ops/registry/tasks.json", { config }), null);
});

test("mirrorArtifactToDocs requires explicit exportDocs opt-in", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-skill-export-docs-"));
  try {
    const disabled = mirrorArtifactToDocs({
      cwd,
      artifactPath: ".agent-skill/reports/visual-qa/run/report.md",
      content: "# Report\n",
      config: { artifact: { root: ".agent-skill", exportDocs: false } },
    });
    assert.deepEqual(disabled, { exported: false, path: null });
    assert.equal(existsSync(join(cwd, "docs/reports/visual-qa/run/report.md")), false);

    const enabled = mirrorArtifactToDocs({
      cwd,
      artifactPath: ".agent-skill/reports/visual-qa/run/report.md",
      content: "# Report\n",
      config: { artifact: { root: ".agent-skill", exportDocs: true } },
    });
    assert.deepEqual(enabled, { exported: true, path: "docs/reports/visual-qa/run/report.md" });
    assert.equal(readFileSync(join(cwd, enabled.path), "utf8"), "# Report\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
