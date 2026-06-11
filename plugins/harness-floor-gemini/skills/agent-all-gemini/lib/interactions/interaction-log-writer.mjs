import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths } from "../artifact-paths.mjs";
import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "../security/artifact-redactor.mjs";
import { writeRedactionAudit } from "../security/redact-report-writer.mjs";

export const INTERACTION_LOG_SCHEMA_VERSION = "agent-interaction-log/v1";
const SAFE_RUN_ID = /[^A-Za-z0-9._-]/g;

export function sanitizeInteractionRunId(runId) {
  const safe = String(runId || "default").replace(SAFE_RUN_ID, "-");
  return safe || "default";
}

export function interactionLogPath({ cwd = process.cwd(), runId = "default", config = {} } = {}) {
  return join(cwd, artifactPaths(config).runsDir, sanitizeInteractionRunId(runId), "interactions.jsonl");
}

export function appendInteractionLog({
  cwd = process.cwd(),
  runId = "default",
  config = {},
  interaction,
  result,
  source = null,
  now = new Date(),
} = {}) {
  const path = interactionLogPath({ cwd, runId, config });
  mkdirSync(dirname(path), { recursive: true });
  const entry = {
    schemaVersion: INTERACTION_LOG_SCHEMA_VERSION,
    timestamp: now instanceof Date ? now.toISOString() : String(now),
    runId,
    source,
    interaction: {
      schemaVersion: interaction?.schemaVersion ?? null,
      id: interaction?.id ?? null,
      kind: interaction?.kind ?? null,
      title: interaction?.title ?? null,
      requireUserInput: interaction?.requireUserInput ?? null,
      nonTtyPolicy: interaction?.nonTtyPolicy ?? null,
      optionCount: interaction?.options?.length ?? 0,
    },
    result: result ? {
      action: result.action,
      selectedOptionId: result.selectedOptionId ?? null,
      reason: result.reason ?? null,
    } : null,
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
