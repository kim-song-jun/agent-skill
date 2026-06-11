import { buildWaves } from "../wave-builder.mjs";
import { planRequiredAgents } from "./agent-planner.mjs";
import { evaluateSpawnPlan } from "./spawn-policy.mjs";
import { appendSpawnLog } from "./spawn-log-writer.mjs";

function filesForWave(waveTasks = []) {
  return [...new Set(waveTasks.flatMap((task) => task.files ?? []).filter(Boolean))].sort();
}

function policyAllowedAgents(policyResult) {
  const denied = new Set(policyResult.deniedAgents.map((agent) => `${agent.kind}:${agent.role}`));
  return policyResult.entries
    .filter((entry) => !denied.has(`${entry.agent.kind}:${entry.agent.role}`))
    .map((entry) => entry.agent);
}

export function buildOrchestrationState({
  runId = "default",
  wave = 0,
  changedFiles = [],
  plannerResult,
  spawnedAgents = [],
  extraBlockedReasons = [],
} = {}) {
  return {
    runId,
    wave,
    changedFiles,
    changedDomains: plannerResult.changedDomains,
    requiredAgents: plannerResult.requiredAgents,
    spawnedAgents,
    failureSignatures: plannerResult.failureSignatures,
    blockedReasons: [...new Set([...(plannerResult.blockedReasons ?? []), ...extraBlockedReasons])],
    budget: plannerResult.budget,
  };
}

export function planDynamicWave({
  tasks = [],
  waveConfig = { maxParallel: Number.MAX_SAFE_INTEGER, rolesAllowed: ["*"] },
  runId = "default",
  wave = 0,
  changedFiles = null,
  failures = [],
  failureSignatures = {},
  visualQa = null,
  ambiguity = null,
  costUSD = 0,
  maxCostUSD = null,
  repeatedFailureThreshold = 3,
  costEstimates = {},
  previousSpawnedAgents = [],
  cwd = process.cwd(),
  platform = "unknown",
  policy = null,
  writePolicyAudit = true,
  writeSpawnLog = false,
  now = new Date(),
} = {}) {
  const waves = buildWaves(tasks, waveConfig);
  const waveTasks = waves[wave] ?? [];
  const resolvedFiles = changedFiles ? [...new Set(changedFiles)].sort() : filesForWave(waveTasks);
  const plannerResult = planRequiredAgents({
    changedFiles: resolvedFiles,
    failures,
    failureSignatures,
    visualQa,
    ambiguity,
    costUSD,
    maxCostUSD,
    repeatedFailureThreshold,
    costEstimates,
    wave,
  });

  const policyResult = evaluateSpawnPlan({
    requiredAgents: plannerResult.requiredAgents,
    runId,
    wave,
    platform,
    cwd,
    policy,
    writeAudit: writePolicyAudit,
    now,
    state: {
      ...plannerResult,
      spawnedAgents: previousSpawnedAgents,
    },
  });

  const policyBlockedReasons = policyResult.entries
    .filter((entry) => !entry.result.ok)
    .flatMap((entry) => entry.result.results.filter((result) => result.action !== "allow").map((result) => result.reason));
  const allowedAgents = policyAllowedAgents(policyResult);
  const spawnedAgents = [...previousSpawnedAgents, ...allowedAgents];
  const orchestration = buildOrchestrationState({
    runId,
    wave,
    changedFiles: resolvedFiles,
    plannerResult,
    spawnedAgents,
    extraBlockedReasons: policyBlockedReasons,
  });

  let spawnLogPath = null;
  if (writeSpawnLog) {
    spawnLogPath = appendSpawnLog({
      cwd,
      runId,
      wave,
      agents: plannerResult.requiredAgents,
      policyEntries: policyResult.entries,
      now,
    });
  }

  return {
    waves,
    waveTasks,
    orchestration,
    spawnPolicy: policyResult,
    spawnLogPath,
  };
}
