// cost-tracker — aggregate per-page USD cost for visual-qa Copilot runs.
//
// Same logic as agent-all-copilot's cost-tracker but indexed by `pageName`
// instead of `waveIndex`. Reads `costUSD` from each task payload
// when present; estimates from output length otherwise.

const DEFAULT_RATE_PER_KCHAR = {
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
  const perAgent = new Map(); // agentId → entry
  const perPage = new Map();  // pageName → cost

  function recordAgentCost({ agentId, pageName, payload }) {
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
    const entry = { agentId, pageName, costUSD: cost, source };
    perAgent.set(agentId, entry);
    if (pageName != null) {
      perPage.set(pageName, (perPage.get(pageName) ?? 0) + cost);
    }
    return entry;
  }

  function pageCost(pageName) {
    return perPage.get(pageName) ?? 0;
  }

  function totalCost() {
    let sum = 0;
    for (const c of perPage.values()) sum += c;
    return Number(sum.toFixed(6));
  }

  function checkBudget(maxCostUSD) {
    if (typeof maxCostUSD !== "number") return totalCost();
    const t = totalCost();
    if (t > maxCostUSD) throw new BudgetExceededError(t, maxCostUSD);
    return t;
  }

  function snapshot() {
    return {
      perAgent: [...perAgent.values()],
      perPage: [...perPage.entries()].map(([pageName, cost]) => ({ pageName, cost })),
      totalCost: totalCost(),
    };
  }

  function restore(snap) {
    if (!snap) return;
    perAgent.clear();
    perPage.clear();
    for (const a of snap.perAgent ?? []) perAgent.set(a.agentId, a);
    for (const p of snap.perPage ?? []) perPage.set(p.pageName, p.cost);
  }

  return { recordAgentCost, pageCost, totalCost, checkBudget, snapshot, restore };
}

export const __internal = { estimateCost, DEFAULT_RATE_PER_KCHAR };
