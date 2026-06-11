import { evaluatePolicyEvent } from "../policy/policy-engine.mjs";

function summarizePlanResults(entries) {
  const denied = entries.filter((entry) => !entry.result.ok);
  const stop = entries.find((entry) => entry.result.action === "stop_loop");
  const deny = denied.find((entry) => entry.result.action === "deny") ?? denied[0];
  if (stop) return { ok: false, action: "stop_loop", severity: stop.result.severity };
  if (deny) return { ok: false, action: deny.result.action, severity: deny.result.severity };
  return { ok: true, action: "allow", severity: "info" };
}

function roleHistoryCounts(spawnedAgents = []) {
  const counts = new Map();
  for (const agent of Array.isArray(spawnedAgents) ? spawnedAgents : []) {
    const role = agent?.role;
    if (!role) continue;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return counts;
}

export function evaluateSpawnPlan({
  requiredAgents = [],
  runId = "default",
  taskId = null,
  displayId = null,
  wave = 0,
  platform = "unknown",
  cwd = process.cwd(),
  policy = null,
  writeAudit = false,
  now = new Date(),
  state = {},
} = {}) {
  const spawnCount = requiredAgents.length;
  const priorRoleCounts = roleHistoryCounts(state.spawnedAgents);
  const currentRoleCounts = new Map();
  const entries = requiredAgents.map((agent) => {
    const role = agent.role ?? "";
    const currentRoleCount = (currentRoleCounts.get(role) ?? 0) + 1;
    currentRoleCounts.set(role, currentRoleCount);
    const previousSameRoleSpawnCount = priorRoleCounts.get(role) ?? 0;
    const sameRoleSpawnCount = previousSameRoleSpawnCount + currentRoleCount;
    const result = evaluatePolicyEvent({
      event: "BeforeAgentSpawn",
      platform,
      runId,
      taskId,
      displayId,
      phase: "3-dispatch",
      changedFiles: state.changedFiles ?? [],
      agent: {
        id: agent.id ?? null,
        role: agent.role,
        reason: agent.reason,
        budgetImpactUSD: agent.costEstimateUSD ?? agent.budgetImpactUSD ?? null,
      },
      payload: {
        wave,
        kind: agent.kind,
        action: agent.action ?? "spawn",
        source: agent.source ?? null,
        costEstimateUSD: agent.costEstimateUSD ?? null,
        changedDomains: state.changedDomains ?? [],
        blockedReasons: state.blockedReasons ?? [],
        waveSpawnCount: spawnCount,
        spawnCount,
        dynamicAgentCount: spawnCount,
        previousSameRoleSpawnCount,
        sameRoleSpawnCount,
      },
    }, { cwd, policy, writeAudit, now });
    return { agent, result };
  });

  const summary = summarizePlanResults(entries);
  return {
    ...summary,
    entries,
    deniedAgents: entries.filter((entry) => !entry.result.ok).map((entry) => entry.agent),
  };
}
