export function evaluateLoop(state, limits, runner) {
  if (state.iter >= limits.maxIter || state.costUSD > limits.maxCostUSD) {
    return { action: "exhausted", exitCode: 3 };
  }
  const { exitCode } = runner();
  if (exitCode === 0) {
    const consecutivePass = state.consecutivePass + 1;
    if (consecutivePass >= limits.stableIters) {
      return { action: "break", consecutivePass, exitCode: 0 };
    }
    return { action: "continue", consecutivePass };
  }
  return { action: "continue", consecutivePass: 0 };
}
