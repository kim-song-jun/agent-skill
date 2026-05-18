// Decide when to fire the summariser based on accumulated turns + tokens.
//
// Contract:
//   shouldFireSummariser({turnsSinceLastSummary, tokensSinceLastSummary, config})
//     → { fire: boolean, reason?: "turns" | "tokens" | null }
//
// Fires when EITHER threshold is exceeded. Caller is expected to reset
// counters after a successful summariser fire.

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
// We default to a mixed heuristic of 3 unless caller specifies content type.
export function estimateTokensFromBytes(bytes, contentType = "mixed") {
  const ratios = {
    english: 4.0,
    code: 2.5,
    mixed: 3.0,
  };
  const r = ratios[contentType] ?? ratios.mixed;
  return Math.ceil(bytes / r);
}
