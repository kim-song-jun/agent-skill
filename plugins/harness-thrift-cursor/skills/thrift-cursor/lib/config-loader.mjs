// Load .thrift.json (Cursor variant) with schema validation + DEFAULTS fallback.
//
// Contract:
//   loadConfig(path) → { ok: true, config, warning? } | { ok: false, errors: [{field, message}] }
//
// When path missing: returns { ok: true, config: DEFAULTS, warning: "..." }.
//
// Differences vs the Claude Code version (plugins/harness-thrift):
//   - The `cache` section is OMITTED entirely. Cursor exposes no prompt-cache
//     surface, so cache fields are meaningless. If present in user config
//     they are tolerated as ignored extra keys.
//   - All other sections (summariser, contextMode, audit) match the Claude
//     Code shape so users can copy .thrift.json across platforms with at
//     most stripping the unused `cache` block.

import { readFileSync, existsSync } from "node:fs";

export const DEFAULTS = {
  version: "0.1.0",
  summariser: {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    preserveLastTurns: 6,
    preserveSpecPaths: true,
    model: "claude-haiku-4-5-20251001",
  },
  contextMode: {
    coerceBashWhenOutputExceeds: 20,
    coerceReadWhenOutputExceeds: 200,
    blockedTools: [],
  },
  audit: {
    estimateBaseline: "naive-cursor",
    outputPath: ".agent-skill/reports/thrift/cursor-recap-<date>.md",
  },
};

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function validate(config) {
  const errors = [];
  if (!config || typeof config !== "object") {
    return [{ field: "(root)", message: "config must be an object" }];
  }
  // summariser
  const s = config.summariser;
  if (s) {
    if (!isPosInt(s.everyNTurns)) errors.push({ field: "summariser.everyNTurns", message: "must be positive integer" });
    if (!isPosInt(s.everyMTokensOutput)) errors.push({ field: "summariser.everyMTokensOutput", message: "must be positive integer" });
    if (!isNonNegInt(s.preserveLastTurns)) errors.push({ field: "summariser.preserveLastTurns", message: "must be non-negative integer" });
    if (typeof s.preserveSpecPaths !== "boolean") errors.push({ field: "summariser.preserveSpecPaths", message: "must be boolean" });
    if (typeof s.model !== "string" || s.model.length === 0) errors.push({ field: "summariser.model", message: "must be non-empty string" });
  } else {
    errors.push({ field: "summariser", message: "required" });
  }
  // NOTE: `cache` section intentionally NOT validated. Cursor has no
  // cache surface. Extra `cache` keys in user config are tolerated and
  // ignored.
  // contextMode
  const cm = config.contextMode;
  if (cm) {
    if (!isPosInt(cm.coerceBashWhenOutputExceeds)) errors.push({ field: "contextMode.coerceBashWhenOutputExceeds", message: "must be positive integer" });
    if (!isPosInt(cm.coerceReadWhenOutputExceeds)) errors.push({ field: "contextMode.coerceReadWhenOutputExceeds", message: "must be positive integer" });
    if (!Array.isArray(cm.blockedTools)) errors.push({ field: "contextMode.blockedTools", message: "must be array" });
  } else {
    errors.push({ field: "contextMode", message: "required" });
  }
  // audit
  const a = config.audit;
  if (a) {
    if (typeof a.estimateBaseline !== "string") errors.push({ field: "audit.estimateBaseline", message: "must be string" });
    if (typeof a.outputPath !== "string") errors.push({ field: "audit.outputPath", message: "must be string" });
  } else {
    errors.push({ field: "audit", message: "required" });
  }
  return errors;
}

export function loadConfig(path) {
  if (!path || !existsSync(path)) {
    return { ok: true, config: structuredClone(DEFAULTS), warning: ".thrift.json not found; using built-ins. Run the thrift-cursor installer to seed." };
  }
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    return { ok: false, errors: [{ field: "(io)", message: `cannot read ${path}: ${e.message}` }] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, errors: [{ field: "(parse)", message: `invalid JSON: ${e.message}` }] };
  }
  const errors = validate(parsed);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: parsed };
}
