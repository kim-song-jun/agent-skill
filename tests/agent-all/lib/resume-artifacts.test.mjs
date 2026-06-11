import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverResumeArtifacts,
  handoffPathsForTask,
  parseEmbeddedMetadata,
} from "../../../plugins/harness-floor/skills/agent-all/lib/resume-artifacts.mjs";

test("derives sibling handoff and session paths from task path", () => {
  assert.deepEqual(handoffPathsForTask(".agent-skill/tasks/12-x.md"), {
    handoffPath: ".agent-skill/handoff/12-x.handoff.md",
    sessionPath: ".agent-skill/handoff/12-x.session.md",
  });
  assert.deepEqual(handoffPathsForTask("docs/tasks/12-x.md", { legacySibling: true }), {
    handoffPath: "docs/tasks/12-x.handoff.md",
    sessionPath: "docs/tasks/12-x.session.md",
  });
  assert.deepEqual(handoffPathsForTask(".ops/tasks/12-x.md", { config: { artifactRoot: ".ops" } }), {
    handoffPath: ".ops/handoff/12-x.handoff.md",
    sessionPath: ".ops/handoff/12-x.session.md",
  });
});

test("discovers sibling artifacts and parses embedded metadata", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-skill-resume-"));
  mkdirSync(join(cwd, ".agent-skill/handoff"), { recursive: true });
  writeFileSync(join(cwd, ".agent-skill/handoff/12-x.handoff.md"), [
    "# Handoff",
    "<!-- agent-handoff-metadata",
    JSON.stringify({ schema: "agent-skill/handoff@1", selectedNextActionId: "resume-agent-all" }),
    "-->",
    "",
  ].join("\n"));
  writeFileSync(join(cwd, ".agent-skill/handoff/12-x.session.md"), "# Session\n");

  const result = discoverResumeArtifacts({ cwd, taskPath: ".agent-skill/tasks/12-x.md" });
  assert.equal(result.found, true);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.type), ["handoff", "session"]);
  assert.equal(result.metadata.schema, "agent-skill/handoff@1");
  assert.equal(result.metadata.selectedNextActionId, "resume-agent-all");
});

test("discovers legacy docs/tasks sibling handoff artifacts", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-skill-resume-legacy-"));
  mkdirSync(join(cwd, "docs/tasks"), { recursive: true });
  writeFileSync(join(cwd, "docs/tasks/12-x.handoff.md"), "# Handoff\n");
  writeFileSync(join(cwd, "docs/tasks/12-x.session.md"), "# Session\n");

  const result = discoverResumeArtifacts({ cwd, taskPath: "docs/tasks/12-x.md" });
  assert.equal(result.found, true);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.path), [
    "docs/tasks/12-x.handoff.md",
    "docs/tasks/12-x.session.md",
  ]);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.legacy), [true, true]);
});

test("discovers configured artifact-root handoff artifacts", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-skill-resume-custom-"));
  mkdirSync(join(cwd, ".ops/handoff"), { recursive: true });
  writeFileSync(join(cwd, ".ops/handoff/12-x.handoff.md"), "# Handoff\n");
  writeFileSync(join(cwd, ".ops/handoff/12-x.session.md"), "# Session\n");

  const result = discoverResumeArtifacts({
    cwd,
    taskPath: ".ops/tasks/12-x.md",
    config: { artifactRoot: ".ops" },
  });
  assert.equal(result.found, true);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.path), [
    ".ops/handoff/12-x.handoff.md",
    ".ops/handoff/12-x.session.md",
  ]);
});

test("metadata parser returns null for invalid JSON", () => {
  assert.equal(parseEmbeddedMetadata("<!-- marker\nnot-json\n-->", "marker"), null);
});
