// Load .thrift.json with schema validation + DEFAULTS fallback.
//
// Codex port of harness-thrift's config-loader. Schema is the same as
// the CC version (`.thrift.json` is platform-agnostic); only the
// DEFAULTS differ (Codex summariser model + "naive-codex" audit baseline).
//
// Contract:
//   loadConfig(path) → { ok: true, config, warning? } | { ok: false, errors: [{field, message}] }
//
// When path missing: returns { ok: true, config: DEFAULTS, warning: "..." }.

import { readFileSync, existsSync } from "node:fs";

export const DEFAULTS = {
  version: "0.1.0",
  summariser: {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    preserveLastTurns: 6,
    preserveSpecPaths: true,
    // Packaged summariser default. Override via .thrift.json when a
    // local Codex install requires a different allowed model.
    model: "gpt-5-nano",
  },
  cache: {
    primingStrategy: "tools-only",
    warmInterval: 240,
    shareCohortAcross: ["session"],
    enabled: false,
  },
  contextMode: {
    coerceBashWhenOutputExceeds: 20,
    coerceReadWhenOutputExceeds: 200,
    blockedTools: [],
  },
  audit: {
    estimateBaseline: "naive-codex",
    outputPath: "docs/thrift/audit-<date>.md",
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
  // cache
  const c = config.cache;
  if (c) {
    if (!["tools-only", "system-and-tools"].includes(c.primingStrategy)) {
      errors.push({ field: "cache.primingStrategy", message: "must be 'tools-only' or 'system-and-tools'" });
    }
    if (!isPosInt(c.warmInterval) || c.warmInterval > 290) {
      errors.push({ field: "cache.warmInterval", message: "must be positive integer ≤290 (conservative OpenAI cache TTL window)" });
    }
    if (!Array.isArray(c.shareCohortAcross)) {
      errors.push({ field: "cache.shareCohortAcross", message: "must be array" });
    }
    if (typeof c.enabled !== "boolean") errors.push({ field: "cache.enabled", message: "must be boolean" });
  } else {
    errors.push({ field: "cache", message: "required" });
  }
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
    return { ok: true, config: structuredClone(DEFAULTS), warning: ".thrift.json not found; using built-ins. Run /thrift to seed." };
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
