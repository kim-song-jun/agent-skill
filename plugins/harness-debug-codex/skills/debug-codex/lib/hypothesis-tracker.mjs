// hypothesis-tracker.mjs — pure functions over the `state.hypotheses`
// array of `.debug-state.json`.
//
// Each hypothesis is `{id, text, status, experiment?, result?,
// decidedAt?, parentId?}`. `status` ∈ {"untested", "verified",
// "rejected", "partial"}. `currentCandidate` on the state holds the
// id of the active hypothesis (or null).
//
// All functions mutate `state` in place and return useful values
// (`addHypothesis` returns the new id, etc.) for caller convenience.

export const VALID_STATUSES = ["untested", "verified", "rejected", "partial"];

export function addHypothesis(state, text, { parentId = null } = {}) {
  if (!state.hypotheses) state.hypotheses = [];
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("hypothesis text must be non-empty string");
  }
  const id = (state.hypotheses.reduce((max, h) => Math.max(max, h.id ?? 0), 0)) + 1;
  const entry = {
    id,
    text: text.trim(),
    status: "untested",
    parentId: parentId ?? null,
    createdAt: new Date().toISOString(),
  };
  state.hypotheses.push(entry);
  return id;
}

export function findHypothesis(state, id) {
  if (!state || !Array.isArray(state.hypotheses)) return null;
  return state.hypotheses.find((h) => h.id === id) ?? null;
}

export function decide(state, id, { status, experiment = null, result = null }) {
  if (!VALID_STATUSES.includes(status)) {
    throw new TypeError(`status must be one of ${VALID_STATUSES.join(", ")}`);
  }
  const h = findHypothesis(state, id);
  if (!h) throw new Error(`hypothesis id ${id} not found`);
  h.status = status;
  if (experiment != null) h.experiment = experiment;
  if (result != null) h.result = result;
  h.decidedAt = new Date().toISOString();
  // Side effect: verified candidate becomes the current.
  if (status === "verified") {
    state.currentCandidate = id;
  } else if (state.currentCandidate === id && status === "rejected") {
    // Promote the next untested.
    const next = nextUntested(state);
    state.currentCandidate = next ? next.id : null;
  }
  return h;
}

export function rejectHypothesis(state, id, { experiment, result } = {}) {
  return decide(state, id, { status: "rejected", experiment, result });
}

export function selectCandidate(state, id) {
  const h = findHypothesis(state, id);
  if (!h) throw new Error(`hypothesis id ${id} not found`);
  state.currentCandidate = id;
  return h;
}

export function nextUntested(state) {
  if (!state || !Array.isArray(state.hypotheses)) return null;
  return state.hypotheses.find((h) => h.status === "untested") ?? null;
}

export function summary(state) {
  const hyps = state?.hypotheses ?? [];
  let tested = 0, rejected = 0, verified = 0, partial = 0, pending = 0;
  for (const h of hyps) {
    if (h.status === "untested") pending++;
    else {
      tested++;
      if (h.status === "verified") verified++;
      else if (h.status === "rejected") rejected++;
      else if (h.status === "partial") partial++;
    }
  }
  return { total: hyps.length, tested, rejected, verified, partial, pending };
}

// Promote an untested hypothesis up the list (caller priority hint).
export function promote(state, id) {
  const idx = (state.hypotheses ?? []).findIndex((h) => h.id === id);
  if (idx <= 0) return false;
  const [h] = state.hypotheses.splice(idx, 1);
  state.hypotheses.unshift(h);
  return true;
}

// Demote (move toward the end).
export function demote(state, id) {
  const idx = (state.hypotheses ?? []).findIndex((h) => h.id === id);
  if (idx < 0 || idx === state.hypotheses.length - 1) return false;
  const [h] = state.hypotheses.splice(idx, 1);
  state.hypotheses.push(h);
  return true;
}

// Export to a markdown-ish bullet list for use inside debug-log.md.hbs.
// Pure: no IO, just returns a string.
export function exportToDebugLog(state) {
  const hyps = state?.hypotheses ?? [];
  if (hyps.length === 0) return "_No hypotheses recorded._";
  return hyps.map((h) => {
    const status = h.status ?? "untested";
    const tag = status === "verified" ? "✓"
      : status === "rejected" ? "✗"
      : status === "partial" ? "~"
      : "?";
    const lines = [`- **[${tag} ${status}] H${h.id}.** ${h.text}`];
    if (h.experiment) lines.push(`  - experiment: ${h.experiment}`);
    if (h.result) lines.push(`  - result: ${h.result}`);
    if (h.decidedAt) lines.push(`  - decidedAt: ${h.decidedAt}`);
    return lines.join("\n");
  }).join("\n");
}
