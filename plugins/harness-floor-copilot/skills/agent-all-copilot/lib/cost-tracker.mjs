// cost-tracker — aggregate per-agent USD cost across waves + iters.
//
// Reads `costUSD` from each task payload when present; otherwise
// estimates from `output.length * MODEL_RATE_PER_KCHAR`. The estimate is
// crude — real per-token counting requires the agent's transcript, which
// the host may or may not surface real usage. See the Copilot port notes.
//
// Public API:
//   const tracker = createCostTracker({modelRates?})
//   tracker.recordAgentCost({agentId, waveIndex, payload}) → {agentId, costUSD, source}
//   tracker.waveCost(waveIndex) → number
//   tracker.totalCost() → number
//   tracker.checkBudget(maxCostUSD) → throws BudgetExceededError if over
//   tracker.snapshot() → JSON-safe state (for state.json mirroring)
//   tracker.restore(snapshot) → load prior totals (resume mode)

const DEFAULT_RATE_PER_KCHAR = {
  // USD per 1000 chars of agent output. Coarse proxy for token cost.
  "claude-opus-4-7": 0.0045,
  "claude-sonnet-4-6": 0.0012,
  "claude-haiku-4-5": 0.00038,
  "gpt-5": 0.0025,
  "gpt-4.1": 0.0020,
  default: 0.0015,
};

export class BudgetExceededError extends Error {
  constructor(actual, limit) {
    super(`budget exceeded: $${actual.toFixed(4)} > $${limit.toFixed(4)}`);
    this.name = "BudgetExceededError";
    this.actual = actual;
    this.limit = limit;
  }
}

function estimateCost(payload, modelRates) {
  const output = payload?.output ?? payload?.outputText ?? "";
  const text = typeof output === "string" ? output : JSON.stringify(output ?? "");
  const model = payload?.model ?? payload?.modelId;
  const rate = modelRates[model] ?? modelRates.default;
  const kchars = text.length / 1000;
  return Number((kchars * rate).toFixed(6));
}

export function createCostTracker({ modelRates } = {}) {
  const rates = { ...DEFAULT_RATE_PER_KCHAR, ...(modelRates ?? {}) };
  const perAgent = new Map(); // agentId → {waveIndex, costUSD, source}
  const perWave = new Map();  // waveIndex → number

  function recordAgentCost({ agentId, waveIndex, payload }) {
    if (!agentId) throw new Error("recordAgentCost: agentId required");
    const declared = payload?.costUSD ?? payload?.cost_usd ?? payload?.cost;
    let cost;
    let source;
    if (typeof declared === "number" && Number.isFinite(declared) && declared >= 0) {
      cost = declared;
      source = "declared";
    } else {
      cost = estimateCost(payload ?? {}, rates);
      source = "estimated";
    }
    const entry = { agentId, waveIndex, costUSD: cost, source };
    perAgent.set(agentId, entry);
    if (waveIndex != null) {
      perWave.set(waveIndex, (perWave.get(waveIndex) ?? 0) + cost);
    }
    return entry;
  }

  function waveCost(waveIndex) {
    return perWave.get(waveIndex) ?? 0;
  }

  function totalCost() {
    let sum = 0;
    for (const c of perWave.values()) sum += c;
    return Number(sum.toFixed(6));
  }

  function checkBudget(maxCostUSD) {
    if (typeof maxCostUSD !== "number") return totalCost();
    const t = totalCost();
    if (t > maxCostUSD) {
      throw new BudgetExceededError(t, maxCostUSD);
    }
    return t;
  }

  function snapshot() {
    return {
      perAgent: [...perAgent.values()],
      perWave: [...perWave.entries()].map(([waveIndex, cost]) => ({ waveIndex, cost })),
      totalCost: totalCost(),
    };
  }

  function restore(snap) {
    if (!snap) return;
    perAgent.clear();
    perWave.clear();
    for (const a of snap.perAgent ?? []) perAgent.set(a.agentId, a);
    for (const w of snap.perWave ?? []) perWave.set(w.waveIndex, w.cost);
  }

  return { recordAgentCost, waveCost, totalCost, checkBudget, snapshot, restore };
}

export const __internal = { estimateCost, DEFAULT_RATE_PER_KCHAR };
