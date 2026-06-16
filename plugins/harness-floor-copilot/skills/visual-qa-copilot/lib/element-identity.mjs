// Three-tier element identity resolution.
//   tier 1 — explicit `data-vqa-id` attribute
//   tier 2 — semantic fingerprint: role + accessibleName + nearestHeading + textSnippet
//   tier 3 — selector + DOM-path hash (legacy fallback)
//
// Used by phases/3-capture and lib/diff-runs to give baseline matching a
// chance at surviving common refactors (wrapping, reordering, renaming).
//
// Pure function — accepts a plain `descriptor` object so it can be unit-tested
// without spinning up Playwright. The Playwright glue in shallow-clicker
// builds the descriptor by reading attribute / role / accessible-name /
// nearest-heading / text content from the live element handle.

import { createHash } from "node:crypto";

function sha1(s) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

const IMPLICIT_ROLE = {
  a: "link", button: "button", input: "textbox", textarea: "textbox",
  select: "combobox", h1: "heading", h2: "heading", h3: "heading",
  h4: "heading", h5: "heading", h6: "heading", nav: "navigation",
  main: "main", header: "banner", footer: "contentinfo",
};

export function implicitRole(tagName, type) {
  if (!tagName) return null;
  const t = tagName.toLowerCase();
  if (t === "input" && type) {
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
  }
  return IMPLICIT_ROLE[t] || null;
}

/**
 * @param {object} desc - element descriptor
 * @param {string} [desc.vqaId]            - value of data-vqa-id, if any
 * @param {string} [desc.role]             - explicit role attribute
 * @param {string} [desc.tagName]          - tag name (for implicit role fallback)
 * @param {string} [desc.type]             - input type, if input
 * @param {string} [desc.accessibleName]   - computed accessible name
 * @param {string} [desc.nearestHeading]   - text of nearest ancestor or preceding heading
 * @param {string} [desc.textContent]      - element text content (will be trimmed/sliced)
 * @param {string} [desc.selector]         - the selector that matched this element
 * @param {string} [desc.domPath]          - the DOM path (e.g. `html>body>div:nth-child(2)>...`)
 * @returns {{ id: string, confidence: 'explicit'|'semantic'|'path', source: object }}
 */
export function computeElementIdentity(desc) {
  // Tier 1: explicit instrumentation
  if (desc.vqaId && typeof desc.vqaId === "string" && desc.vqaId.trim()) {
    const trimmed = desc.vqaId.trim();
    return {
      id: `x:${sha1(trimmed)}`,
      confidence: "explicit",
      source: { vqaId: trimmed },
    };
  }

  // Tier 2: semantic fingerprint — need at least a role plus one identifying signal
  const role = desc.role || implicitRole(desc.tagName, desc.type);
  const accName = (desc.accessibleName || "").trim();
  const heading = (desc.nearestHeading || "").trim();
  const text = (desc.textContent || "").trim().slice(0, 60);
  if (role && (accName || text)) {
    const semantic = JSON.stringify({ role, accName, heading, text });
    return {
      id: `s:${sha1(semantic)}`,
      confidence: "semantic",
      source: { role, accName, heading, text },
    };
  }

  // Tier 3: path-hash fallback (preserves existing baselines)
  const selector = desc.selector || "";
  const path = desc.domPath || "";
  return {
    id: `p:${sha1(`${selector}|${path}`)}`,
    confidence: "path",
    source: { selector, path },
  };
}

/**
 * Try to match a current element to a baseline-run capture map.
 * Strategy:
 *   1. exact-ID match (any tier)
 *   2. if current is path-tier, attempt semantic match against baseline's
 *      semantic-tier captures (degraded match — emits a warning to caller).
 *   3. otherwise no match.
 *
 * @param {{ id, confidence, source }} currentIdentity
 * @param {Map<string, object>} baselineById - keyed by capture.elementId
 * @param {Map<string, object>} [baselineBySemanticId] - optional secondary index
 * @returns {{ baseline: object|null, degraded: boolean }}
 */
export function matchBaseline(currentIdentity, baselineById, baselineBySemanticId) {
  if (baselineById.has(currentIdentity.id)) {
    return { baseline: baselineById.get(currentIdentity.id), degraded: false };
  }
  if (currentIdentity.confidence === "path" && baselineBySemanticId) {
    // Recompute the semantic key for the current element (if descriptor preserved
    // in source.path/selector this becomes a no-op — but callers usually pass the
    // full descriptor through). For now we expose the degraded-match flag so the
    // capture orchestrator can decide whether to retry with a semantic descriptor.
    return { baseline: null, degraded: true };
  }
  return { baseline: null, degraded: false };
}
