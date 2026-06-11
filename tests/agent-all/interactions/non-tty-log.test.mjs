import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveNonTtyInteraction } from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/non-tty-resolver.mjs";
import {
  appendInteractionLog,
  interactionLogPath,
} from "../../../plugins/harness-floor/skills/agent-all/lib/interactions/interaction-log-writer.mjs";

test("non-TTY resolver selects recommended low-risk option", () => {
  const result = resolveNonTtyInteraction({
    id: "i1",
    title: "Continue?",
    options: [
      { id: "pause", label: "Pause" },
      { id: "continue", label: "Continue", recommended: true },
    ],
  }, { now: new Date("2026-06-11T00:00:00.000Z") });

  assert.equal(result.action, "selected");
  assert.equal(result.selectedOptionId, "continue");
  assert.equal(result.timestamp, "2026-06-11T00:00:00.000Z");
});

test("non-TTY resolver blocks high-risk recommended option", () => {
  const result = resolveNonTtyInteraction({
    id: "i2",
    title: "Apply destructive migration?",
    options: [
      { id: "apply", label: "Apply", recommended: true, risk: "high" },
      { id: "pause", label: "Pause" },
    ],
  });

  assert.equal(result.action, "blocked");
  assert.equal(result.selectedOptionId, null);
  assert.match(result.reason, /high-risk/);
});

test("interaction log writer records compact JSONL audit", () => {
  const cwd = mkdtempSync(join(tmpdir(), "interaction-log-"));
  try {
    const interaction = {
      schemaVersion: "agent-interaction/v1",
      id: "i3",
      kind: "resume",
      title: "Resume task",
      options: [{ id: "resume", label: "Resume", recommended: true }],
      requireUserInput: false,
      nonTtyPolicy: "choose_recommended",
    };
    const result = { action: "selected", selectedOptionId: "resume", reason: "recommended option auto-selected" };
    const path = appendInteractionLog({
      cwd,
      runId: "run/13",
      interaction,
      result,
      source: "test",
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    assert.equal(path, interactionLogPath({ cwd, runId: "run/13" }));
    const entry = JSON.parse(readFileSync(path, "utf-8").trim());
    assert.equal(entry.schemaVersion, "agent-interaction-log/v1");
    assert.equal(entry.interaction.kind, "resume");
    assert.equal(entry.result.selectedOptionId, "resume");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("interaction log writer honors configured artifact root", () => {
  const cwd = mkdtempSync(join(tmpdir(), "interaction-log-root-"));
  try {
    const interaction = {
      schemaVersion: "agent-interaction/v1",
      id: "i4",
      kind: "resume",
      title: "Resume task",
      options: [{ id: "resume", label: "Resume", recommended: true }],
    };
    const path = appendInteractionLog({
      cwd,
      runId: "run/14",
      config: { artifactRoot: ".ops" },
      interaction,
      result: { action: "selected", selectedOptionId: "resume", reason: "recommended option auto-selected" },
      source: "test",
    });

    assert.equal(path, join(cwd, ".ops/runs/run-14/interactions.jsonl"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("interaction log redaction gate blocks high severity result reasons", () => {
  const cwd = mkdtempSync(join(tmpdir(), "interaction-log-redact-"));
  try {
    const interaction = {
      schemaVersion: "agent-interaction/v1",
      id: "i5",
      kind: "resume",
      title: "Resume task",
      options: [{ id: "resume", label: "Resume", recommended: true }],
    };
    assert.throws(
      () => appendInteractionLog({
        cwd,
        runId: "run-secret",
        interaction,
        result: {
          action: "selected",
          selectedOptionId: "resume",
          reason: "header was Bearer abcdefghijklmnopqrstuvwxyz123456",
        },
        source: "test",
      }),
      /redaction gate blocked/,
    );
    const auditText = readFileSync(join(cwd, ".agent-skill/runs/run-secret/redaction-audit.jsonl"), "utf-8");
    assert.match(auditText, /bearer-token/);
    assert.doesNotMatch(auditText, /abcdefghijklmnopqrstuvwxyz123456/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
