// Vendored from plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs.
// Keep BYTE-FOR-BYTE identical to the source-of-truth.
// Rough per-capture USD cost: input image tokens (~1500 for 1024x768) + output (~500 tokens) at model rate.
// These are coarse estimates for budget guard-rails; not authoritative.
export const MODEL_PRICES = {
  "claude-opus-4-7": 0.045,
  "claude-sonnet-4-6": 0.012,
  "claude-haiku-4-5": 0.004,
};

const DEFAULT_PRICE = 0.012;

export function estimateCost(matrix, model) {
  const perCapture = MODEL_PRICES[model] ?? DEFAULT_PRICE;
  return matrix.length * perCapture;
}
