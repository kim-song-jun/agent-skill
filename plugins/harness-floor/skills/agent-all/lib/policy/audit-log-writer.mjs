import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths } from "../artifact-paths.mjs";
import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "../security/artifact-redactor.mjs";
import { writeRedactionAudit } from "../security/redact-report-writer.mjs";

const SAFE_RUN_ID = /[^A-Za-z0-9._-]/g;

export function sanitizeRunId(runId) {
  const safe = String(runId || "default").replace(SAFE_RUN_ID, "-");
  return safe || "default";
}

export function policyLogPath({ cwd = process.cwd(), runId = "default", config = {} } = {}) {
  return join(cwd, artifactPaths(config).runsDir, sanitizeRunId(runId), "policy-log.jsonl");
}

export function appendPolicyAudit({
  cwd = process.cwd(),
  runId = "default",
  config = {},
  event,
  results = [],
  summary = null,
  now = new Date(),
} = {}) {
  const path = policyLogPath({ cwd, runId, config });
  mkdirSync(dirname(path), { recursive: true });
  const entry = {
    timestamp: now instanceof Date ? now.toISOString() : String(now),
    event: event?.event,
    platform: event?.platform,
    runId: event?.runId ?? runId,
    taskId: event?.taskId ?? null,
    displayId: event?.displayId ?? null,
    iteration: event?.iteration ?? null,
    phase: event?.phase ?? null,
    toolName: event?.toolName ?? null,
    agent: event?.agent ?? null,
    action: summary?.action ?? "allow",
    severity: summary?.severity ?? "info",
    results,
    payloadKeys: Object.keys(event?.payload ?? {}).sort(),
  };
  const checked = redactArtifactContent({
    artifactPath: path,
    content: JSON.stringify(entry),
    config,
    now,
  });
  writeRedactionAudit({
    cwd,
    runId,
    config,
    artifactPath: path,
    findings: checked.findings,
    now,
  });
  assertRedactionAllowed(checked);
  appendFileSync(path, `${checked.content}\n`, "utf-8");
  return path;
}
