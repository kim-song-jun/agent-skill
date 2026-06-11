import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeRunId } from "../policy/audit-log-writer.mjs";
import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "../security/artifact-redactor.mjs";
import { writeRedactionAudit } from "../security/redact-report-writer.mjs";

export const SPAWN_LOG_SCHEMA_VERSION = "agent-spawn-log/v1";

export function spawnLogPath({ cwd = process.cwd(), runId = "default" } = {}) {
  return join(cwd, ".agent-skill", "runs", sanitizeRunId(runId), "spawn-log.jsonl");
}

function policyForAgent(agent, policyEntries = []) {
  return policyEntries.find((entry) => entry.agent === agent || (
    entry.agent?.role === agent.role &&
    entry.agent?.kind === agent.kind &&
    entry.agent?.wave === agent.wave
  ))?.result ?? null;
}

export function appendSpawnLog({
  cwd = process.cwd(),
  runId = "default",
  config = {},
  wave = 0,
  agents = [],
  policyEntries = [],
  now = new Date(),
} = {}) {
  const path = spawnLogPath({ cwd, runId });
  mkdirSync(dirname(path), { recursive: true });
  const timestamp = now instanceof Date ? now.toISOString() : String(now);

  for (const agent of agents) {
    const policy = policyForAgent(agent, policyEntries);
    const entry = {
      schemaVersion: SPAWN_LOG_SCHEMA_VERSION,
      timestamp,
      runId,
      wave: agent.wave ?? wave,
      role: agent.role,
      kind: agent.kind,
      action: agent.action ?? "spawn",
      reason: agent.reason,
      source: agent.source ?? null,
      costEstimateUSD: agent.costEstimateUSD ?? null,
      policy: policy ? {
        ok: policy.ok,
        action: policy.action,
        severity: policy.severity,
        policyIds: policy.results.map((result) => result.policyId),
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
  }

  return path;
}
