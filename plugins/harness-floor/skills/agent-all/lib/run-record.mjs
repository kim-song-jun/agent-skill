import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const RUN_RECORD_SCHEMA_VERSION = "agent-skill-run-record/v1";

export function buildRunRecord({
  runId,
  ts,
  repoFingerprint = null,
  source,
  taskCategory = null,
  scaffold = {},
  outcome = {},
  telemetryRecords = [],
} = {}) {
  return {
    schemaVersion: RUN_RECORD_SCHEMA_VERSION,
    runId: String(runId ?? "default"),
    ts: ts || new Date().toISOString(),
    repoFingerprint,
    source,
    taskCategory,
    scaffold: {
      size: scaffold.size ?? null,
      profile: scaffold.profile ?? null,
      roster: Array.isArray(scaffold.roster) ? scaffold.roster : [],
      qaPersonas: Array.isArray(scaffold.qaPersonas) ? scaffold.qaPersonas : [],
      costFlags: scaffold.costFlags && typeof scaffold.costFlags === "object" ? scaffold.costFlags : {},
    },
    outcome: {
      passed: Boolean(outcome.passed),
      iterations: Number(outcome.iterations ?? 0),
      manualInterventions: Number(outcome.manualInterventions ?? 0),
      failedReviewerGates: Number(outcome.failedReviewerGates ?? 0),
      qualityDebtFindings: Number(outcome.qualityDebtFindings ?? 0),
      rollbackCount: Number(outcome.rollbackCount ?? 0),
      rolesActuallyInvoked: Array.isArray(outcome.rolesActuallyInvoked) ? outcome.rolesActuallyInvoked : [],
    },
    telemetryRecords: Array.isArray(telemetryRecords) ? telemetryRecords : [],
  };
}

export function validateRunRecord(record, source = "run-record") {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${source} must be an object`);
  if (record.schemaVersion !== RUN_RECORD_SCHEMA_VERSION) throw new Error(`${source} must use schemaVersion ${RUN_RECORD_SCHEMA_VERSION}`);
  if (typeof record.runId !== "string" || !record.runId) throw new Error(`${source}.runId must be a non-empty string`);
  if (record.source !== "agent-all" && record.source !== "eval-live") throw new Error(`${source}.source must be "agent-all" or "eval-live"`);
  if (!record.scaffold || typeof record.scaffold !== "object") throw new Error(`${source}.scaffold must be an object`);
  if (!Array.isArray(record.scaffold.roster)) throw new Error(`${source}.scaffold.roster must be an array`);
  if (!record.outcome || typeof record.outcome !== "object") throw new Error(`${source}.outcome must be an object`);
  if (typeof record.outcome.passed !== "boolean") throw new Error(`${source}.outcome.passed must be boolean`);
  if (!Array.isArray(record.outcome.rolesActuallyInvoked)) throw new Error(`${source}.outcome.rolesActuallyInvoked must be an array`);
  if (!Array.isArray(record.telemetryRecords)) throw new Error(`${source}.telemetryRecords must be an array`);
  return record;
}
