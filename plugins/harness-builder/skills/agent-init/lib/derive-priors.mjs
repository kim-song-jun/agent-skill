// plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Shared contract with plugins/harness-floor/skills/agent-all/lib/run-record.mjs.
// Re-declared (not imported) so agent-init has no hard dependency on harness-floor.
const RUN_RECORD_SCHEMA_VERSION = "agent-skill-run-record/v1";

function readRecords(recordsDir) {
  if (!existsSync(recordsDir)) return [];
  const out = [];
  for (const file of readdirSync(recordsDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(readFileSync(join(recordsDir, file), "utf-8"));
      if (rec?.schemaVersion === RUN_RECORD_SCHEMA_VERSION) out.push(rec);
    } catch { /* skip torn/invalid */ }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

export function derivePriors({ cwd = process.cwd(), recordsDir, recentN = 5, threshold = 0.6 } = {}) {
  const dir = recordsDir || resolve(cwd, ".agent-skill", "runs", "records");
  const recent = readRecords(dir).slice(-recentN);
  if (recent.length === 0) {
    return { priorRunCount: 0, rosterAdditions: [], suggestedProfile: null, suggestedMaxCostUSD: null };
  }

  // roster additions and priorRunCount read the full recent window (both agent-all and
  // eval-live), per project decision: "actuator reads both".
  const addCounts = {};
  for (const r of recent) {
    const scaffolded = new Set(r.scaffold?.roster ?? []);
    for (const role of new Set(r.outcome?.rolesActuallyInvoked ?? [])) {
      if (!scaffolded.has(role)) addCounts[role] = (addCounts[role] ?? 0) + 1;
    }
  }
  const rosterAdditions = Object.entries(addCounts)
    .filter(([, n]) => n / recent.length >= threshold)
    .map(([role]) => role)
    .sort();

  // Profile and cost priors are derived only from real agent-all runs — synthetic eval-live
  // records (written by recordCanonicalRun) use profiles like "lite"/"operational" and tiny
  // costs that reflect eval mechanics, not production scaffold usage. Including them would
  // skew suggestedProfile and suggestedMaxCostUSD toward eval mechanics and produce
  // misleading recommendations.
  const agentAllRecent = recent.filter((r) => r.source === "agent-all");

  const profileCounts = {};
  for (const r of agentAllRecent) {
    const p = r.scaffold?.profile;
    if (p) profileCounts[p] = (profileCounts[p] ?? 0) + 1;
  }
  const suggestedProfile = Object.entries(profileCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const costs = agentAllRecent
    .map((r) => (r.telemetryRecords ?? []).reduce((s, t) => s + (Number(t.costUSD) || 0), 0))
    .filter((c) => c > 0);
  const suggestedMaxCostUSD = costs.length ? Number((Math.max(...costs) * 1.5).toFixed(2)) : null;

  return { priorRunCount: recent.length, rosterAdditions, suggestedProfile, suggestedMaxCostUSD };
}
