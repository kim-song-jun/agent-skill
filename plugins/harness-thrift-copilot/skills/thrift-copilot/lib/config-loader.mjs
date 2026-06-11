// Load .thrift.json with schema validation + DEFAULTS fallback.
// Copilot variant: adds `storeMemory` section + `cache.intermediationWarning`.
//
// Contract:
//   loadConfig(path) → { ok: true, config, warning? } | { ok: false, errors: [{field, message}] }
//
// When path missing: returns { ok: true, config: DEFAULTS, warning: "..." }.
//
// > TODO: verify Copilot ask_user / store_memory schemas against live CLI.
//   Default storeMemory.scope = "repository" matches the assumption in
//   docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md.

import { readFileSync, existsSync } from "node:fs";

export const DEFAULTS = {
  version: "0.1.0",
  platform: "copilot",
  summariser: {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    preserveLastTurns: 6,
    preserveSpecPaths: true,
    model: "gpt-5-nano",
  },
  cache: {
    primingStrategy: "intermediated",
    warmInterval: 240,
    shareCohortAcross: ["session"],
    enabled: false,
    intermediationWarning: true,
  },
  storeMemory: {
    enabled: true,
    scope: "repository",
    keyPrefix: "thrift/",
  },
  contextMode: {
    coerceBashWhenOutputExceeds: 20,
    coerceReadWhenOutputExceeds: 200,
    blockedTools: [],
  },
  audit: {
    estimateBaseline: "naive-copilot",
    outputPath: ".agent-skill/reports/thrift/audit-<date>.md",
    mirrorToStoreMemory: true,
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
    if (!["tools-only", "system-and-tools", "intermediated"].includes(c.primingStrategy)) {
      errors.push({ field: "cache.primingStrategy", message: "must be 'tools-only', 'system-and-tools', or 'intermediated'" });
    }
    if (!isPosInt(c.warmInterval) || c.warmInterval > 290) {
      errors.push({ field: "cache.warmInterval", message: "must be positive integer ≤290 (assumed cache TTL)" });
    }
    if (!Array.isArray(c.shareCohortAcross)) {
      errors.push({ field: "cache.shareCohortAcross", message: "must be array" });
    }
    if (typeof c.enabled !== "boolean") errors.push({ field: "cache.enabled", message: "must be boolean" });
    if (typeof c.intermediationWarning !== "boolean") errors.push({ field: "cache.intermediationWarning", message: "must be boolean (set false to opt in past the warning)" });
  } else {
    errors.push({ field: "cache", message: "required" });
  }

  // storeMemory
  const sm = config.storeMemory;
  if (sm) {
    if (typeof sm.enabled !== "boolean") errors.push({ field: "storeMemory.enabled", message: "must be boolean" });
    if (!["repository", "session", "global"].includes(sm.scope)) {
      errors.push({ field: "storeMemory.scope", message: "must be 'repository', 'session', or 'global'" });
    }
    if (typeof sm.keyPrefix !== "string" || sm.keyPrefix.length === 0) {
      errors.push({ field: "storeMemory.keyPrefix", message: "must be non-empty string" });
    }
  } else {
    errors.push({ field: "storeMemory", message: "required" });
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
    if (a.mirrorToStoreMemory !== undefined && typeof a.mirrorToStoreMemory !== "boolean") {
      errors.push({ field: "audit.mirrorToStoreMemory", message: "must be boolean (optional)" });
    }
  } else {
    errors.push({ field: "audit", message: "required" });
  }

  return errors;
}

export function loadConfig(path) {
  if (!path || !existsSync(path)) {
    return { ok: true, config: structuredClone(DEFAULTS), warning: ".thrift.json not found; using built-ins. Run /thrift-copilot to seed." };
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
