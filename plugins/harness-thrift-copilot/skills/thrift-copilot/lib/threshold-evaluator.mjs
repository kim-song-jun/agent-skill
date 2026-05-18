// Decide when to fire the summariser based on accumulated turns + tokens.
// Vendored from the CC harness-thrift port — pure-function module, no
// Copilot-specific differences.
//
// Contract:
//   shouldFireSummariser({turnsSinceLastSummary, tokensSinceLastSummary, config})
//     → { fire: boolean, reason?: "turns" | "tokens" | null }

export function shouldFireSummariser({
  turnsSinceLastSummary,
  tokensSinceLastSummary,
  config,
}) {
  const s = config?.summariser;
  if (!s) return { fire: false, reason: null };
  if (turnsSinceLastSummary >= s.everyNTurns) {
    return { fire: true, reason: "turns" };
  }
  if (tokensSinceLastSummary >= s.everyMTokensOutput) {
    return { fire: true, reason: "tokens" };
  }
  return { fire: false, reason: null };
}

// Convenience: byte-count → token estimate.
// English text: ~4 bytes/token. Source code: ~2.5 bytes/token.
// Mixed default: 3 bytes/token.
export function estimateTokensFromBytes(bytes, contentType = "mixed") {
  const ratios = {
    english: 4.0,
    code: 2.5,
    mixed: 3.0,
  };
  const r = ratios[contentType] ?? ratios.mixed;
  return Math.ceil(bytes / r);
}
