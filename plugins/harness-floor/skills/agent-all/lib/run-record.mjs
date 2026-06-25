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

export function safeRunId(runId) {
  const raw = typeof runId === "string" && runId.trim() ? runId.trim() : "default";
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function runRecordPath({ cwd = process.cwd(), runId = "default" } = {}) {
  return resolve(cwd, ".agent-skill", "runs", "records", `${safeRunId(runId)}.json`);
}

// Stable per-repo id: sha256 of the git origin URL when present, else of the repo root path.
// v1 actuator reads the local per-repo dir directly, so this is stored for FUTURE cross-repo
// aggregation, not used for filtering yet.
export function repoFingerprint({ cwd = process.cwd() } = {}) {
  let basis = resolve(cwd);
  try {
    const url = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (url) basis = url;
  } catch { /* not a git repo or no origin — fall back to path */ }
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export function writeRunRecordAtomic(record, { cwd = process.cwd() } = {}) {
  validateRunRecord(record);
  const path = runRecordPath({ cwd, runId: record.runId });
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  try { const fd = openSync(tmp, "r+"); fsyncSync(fd); closeSync(fd); } catch {}
  renameSync(tmp, path);
  return path;
}

export function readRunRecords({ cwd = process.cwd() } = {}) {
  const dir = resolve(cwd, ".agent-skill", "runs", "records");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue; // excludes <name>.json.tmp in-progress writes
    try {
      const rec = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      if (rec?.schemaVersion === RUN_RECORD_SCHEMA_VERSION) out.push(rec);
    } catch { /* torn/in-progress/invalid → skip (documented contract), never crash */ }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
