#!/usr/bin/env node
// scripts/emit-run-record.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRunRecord, writeRunRecordAtomic, repoFingerprint, safeRunId,
} from "../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";

function flagValue(arg) {
  const eq = arg.indexOf("=");
  return eq === -1 ? "" : arg.slice(eq + 1);
}

export function parseEmitArgs(argv = []) {
  const o = { runId: "default", passed: false, iterations: 0, manualInterventions: 0, failedReviewerGates: 0, qualityDebtFindings: 0, rollbackCount: 0, rolesInvoked: [], category: null };
  for (const arg of argv) {
    if (arg.startsWith("--run-id=")) o.runId = flagValue(arg);
    else if (arg.startsWith("--passed=")) o.passed = flagValue(arg) === "true";
    else if (arg.startsWith("--iterations=")) o.iterations = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--manual-interventions=")) o.manualInterventions = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--failed-reviewer-gates=")) o.failedReviewerGates = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--quality-debt-findings=")) o.qualityDebtFindings = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--rollback-count=")) o.rollbackCount = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--roles-invoked=")) o.rolesInvoked = flagValue(arg).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--category=")) o.category = flagValue(arg) || null;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  return o;
}

export function gatherScaffold({ cwd = process.cwd() } = {}) {
  let discovery = {};
  const statePath = resolve(cwd, ".claude", ".agent-init-state.json");
  try {
    if (existsSync(statePath)) discovery = JSON.parse(readFileSync(statePath, "utf-8")).discovery ?? {};
  } catch { /* no state → empty scaffold */ }
  const agentsDir = resolve(cwd, ".claude", "agents");
  let roster = [];
  try {
    if (existsSync(agentsDir)) roster = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  } catch { /* none */ }
  return {
    size: discovery.size ?? null,
    profile: discovery.operationalProfile === false ? "lite" : (discovery.operationalProfile ? "operational" : null),
    roster,
    qaPersonas: Array.isArray(discovery.qa_personas) ? discovery.qa_personas : [],
  };
}

function readTelemetry({ cwd, runId }) {
  // Best-effort: flatten records from the run's cost-telemetry.jsonl if present.
  const p = resolve(cwd, ".agent-skill", "runs", safeRunId(runId), "cost-telemetry.jsonl");
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (Array.isArray(e.records)) out.push(...e.records); } catch { /* skip */ }
  }
  return out;
}

export function emitRunRecord({ cwd = process.cwd(), runId, passed, iterations, manualInterventions, failedReviewerGates, qualityDebtFindings, rollbackCount, rolesInvoked = [], category = null } = {}) {
  const scaffold = gatherScaffold({ cwd });
  const record = buildRunRecord({
    runId,
    repoFingerprint: repoFingerprint({ cwd }),
    source: "agent-all",
    taskCategory: category,
    scaffold,
    outcome: { passed, iterations, manualInterventions, failedReviewerGates, qualityDebtFindings, rollbackCount, rolesActuallyInvoked: rolesInvoked },
    telemetryRecords: readTelemetry({ cwd, runId }),
  });
  return writeRunRecordAtomic(record, { cwd });
}

function main(argv = process.argv.slice(2)) {
  const o = parseEmitArgs(argv);
  const path = emitRunRecord({ cwd: process.cwd(), ...o });
  console.log(`run-record written: ${path}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error(e?.message || String(e)); process.exitCode = 1; }
}
