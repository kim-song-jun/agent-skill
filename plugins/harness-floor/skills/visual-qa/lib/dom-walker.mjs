// DOM walker — discovers interactive elements on a page.
//
// Pure interpretation of a DOM snapshot. The runtime layer (Playwright
// MCP, jsdom, etc.) is responsible for producing the snapshot; this
// module decides which elements count as interactive and how to derive
// a stable selector for each one.
//
// Snapshot shape (kept minimal on purpose so multiple fetchers can
// produce it):
//   {
//     elements: [
//       { tag, attributes: {id?, class?, role?, "data-testid"?, "data-qa-id"?, href?, type?, name?, ...},
//         path: "html > body > div:nth-of-type(1) > button:nth-of-type(2)",
//         text: "Submit",
//         visible: true }
//     ]
//   }
//
// Returns `[{selector, kind, states[], label}]` in document order.

// Interactive kinds we recognise — order matters for `kind` precedence.
const INTERACTIVE_RULES = [
  { kind: "button", match: (el) => el.tag === "button" || matchesRole(el, "button") },
  { kind: "link",   match: (el) => (el.tag === "a" && hasAttr(el, "href")) || matchesRole(el, "link") },
  { kind: "input",  match: (el) => el.tag === "input" && el.attributes?.type !== "hidden" },
  { kind: "select", match: (el) => el.tag === "select" },
  { kind: "textarea", match: (el) => el.tag === "textarea" },
  { kind: "tab",    match: (el) => matchesRole(el, "tab") },
  { kind: "menuitem", match: (el) => matchesRole(el, "menuitem") },
  { kind: "switch", match: (el) => matchesRole(el, "switch") || matchesRole(el, "checkbox") },
  { kind: "labelled", match: (el) => hasAttr(el, "data-testid") || hasAttr(el, "data-qa-id") },
];

// States to capture per kind. Buttons/links/inputs get hover+focus by default.
const STATES_PER_KIND = {
  button:   ["hover", "focus"],
  link:     ["hover", "focus"],
  input:    ["focus"],
  select:   ["focus"],
  textarea: ["focus"],
  tab:      ["hover", "focus"],
  menuitem: ["hover", "focus"],
  switch:   ["hover", "focus"],
  labelled: ["hover"],
};

function hasAttr(el, name) {
  return el.attributes && el.attributes[name] !== undefined && el.attributes[name] !== null;
}

function matchesRole(el, role) {
  return el.attributes?.role === role;
}

function classifyKind(el) {
  for (const rule of INTERACTIVE_RULES) {
    if (rule.match(el)) return rule.kind;
  }
  return null;
}

// Selector preference: data-testid > data-qa-id > id > stable CSS path.
// We never use class-based selectors because Tailwind / styled-components
// generate non-stable class names.
export function deriveSelector(el) {
  const a = el.attributes || {};
  if (a["data-testid"]) return `[data-testid="${cssEscape(a["data-testid"])}"]`;
  if (a["data-qa-id"]) return `[data-qa-id="${cssEscape(a["data-qa-id"])}"]`;
  if (a.id) return `#${cssEscape(a.id)}`;
  if (typeof el.path === "string" && el.path) return el.path;
  return null;
}

function cssEscape(s) {
  return String(s).replace(/(["\\\n\r])/g, "\\$1");
}

function deriveLabel(el) {
  const text = (el.text || "").trim();
  if (text) return text.slice(0, 80);
  const a = el.attributes || {};
  return a["aria-label"] || a["title"] || a.name || a.id || "(unlabelled)";
}

export function walkDom(snapshot, opts = {}) {
  if (!snapshot || !Array.isArray(snapshot.elements)) return [];
  const includeInvisible = !!opts.includeInvisible;
  const seenSelectors = new Set();
  const out = [];
  for (const el of snapshot.elements) {
    if (!el) continue;
    if (!includeInvisible && el.visible === false) continue;
    const kind = classifyKind(el);
    if (!kind) continue;
    const selector = deriveSelector(el);
    if (!selector) continue;
    if (seenSelectors.has(selector)) continue;
    seenSelectors.add(selector);
    out.push({
      selector,
      kind,
      states: [...(STATES_PER_KIND[kind] || [])],
      label: deriveLabel(el),
    });
  }
  return out;
}

export const __test__ = { classifyKind, deriveSelector, deriveLabel, hasAttr, matchesRole };
