// Element-scope filter: applies `comprehensive.targets` configuration to a
// candidate element. Decides whether to capture it and which action to run.
//
// Precedence:
//   1. excludeSelectors win — match anywhere, skip immediately.
//   2. If includeSelectors is non-empty, the element must match at least one.
//   3. actionsPerElement lookup: first key (in declaration order) whose
//      selector matches; if no match, the `default` action runs (`click`).

/**
 * Pure CSS-selector match check. Caller is responsible for already having
 * resolved the element with a Playwright handle; this function takes a
 * boolean predicate (`isMatch`) so the lib stays pure-node testable.
 *
 * @param {{selector: string, isMatch: (selector: string) => boolean}} elementCheck
 * @param {object} targets - the comprehensive.targets config block
 * @returns {{capture: boolean, action: string|null, reason: string}}
 */
export function resolveTarget(elementCheck, targets) {
  const t = targets || {};
  const isMatch = elementCheck.isMatch;

  // 1. exclude wins
  const excludes = t.excludeSelectors || [];
  for (const sel of excludes) {
    if (isMatch(sel)) {
      return { capture: false, action: null, reason: `excluded by ${sel}` };
    }
  }

  // 2. if includes is set + non-empty, require a match
  const includes = t.includeSelectors || [];
  if (includes.length > 0) {
    const matchedInclude = includes.find(isMatch);
    if (!matchedInclude) {
      return { capture: false, action: null, reason: "no include match" };
    }
  }

  // 3. action lookup — preserve key order; fall back to `default`
  const actionsMap = t.actionsPerElement || {};
  for (const [key, action] of Object.entries(actionsMap)) {
    if (key === "default") continue;
    if (isMatch(key)) {
      return { capture: true, action: Array.isArray(action) ? action[0] : action, reason: `action via ${key}` };
    }
  }
  const fallback = actionsMap.default;
  if (fallback !== undefined) {
    return { capture: true, action: Array.isArray(fallback) ? fallback[0] : fallback, reason: "default action" };
  }
  return { capture: true, action: "click", reason: "no actionsPerElement configured — built-in default" };
}

/**
 * Parse an action string like "fill:vqa-sample" → { kind: 'fill', arg: 'vqa-sample' }.
 * No-arg forms ("click", "blur", "hover") return arg === null.
 *
 * @param {string} action
 */
export function parseAction(action) {
  if (!action || typeof action !== "string") return { kind: "click", arg: null };
  const colon = action.indexOf(":");
  if (colon < 0) return { kind: action.trim(), arg: null };
  return { kind: action.slice(0, colon).trim(), arg: action.slice(colon + 1) };
}
