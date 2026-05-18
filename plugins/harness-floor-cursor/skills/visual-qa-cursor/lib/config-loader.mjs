import { readFileSync, existsSync } from "node:fs";

const MODES = ["declared", "comprehensive"];

function validate(cfg) {
  const errors = [];
  const mode = cfg.mode ?? "declared";
  if (!MODES.includes(mode)) {
    errors.push({ path: "mode", message: `must be one of ${MODES.join("|")}` });
  }
  // baseUrl + breakpoints are required for either mode. `pages` is only
  // required when mode=declared — comprehensive auto-discovers pages.
  if (cfg.baseUrl === undefined) errors.push({ path: "baseUrl", message: "baseUrl is required" });
  if (cfg.breakpoints === undefined) errors.push({ path: "breakpoints", message: "breakpoints is required" });
  if (mode === "declared" && cfg.pages === undefined) {
    errors.push({ path: "pages", message: "pages is required when mode=declared" });
  }
  if (Array.isArray(cfg.breakpoints)) {
    cfg.breakpoints.forEach((bp, i) => {
      if (typeof bp.name !== "string") errors.push({ path: `breakpoints[${i}].name`, message: "must be string" });
      if (typeof bp.width !== "number") errors.push({ path: `breakpoints[${i}].width`, message: "must be number" });
      if (typeof bp.height !== "number") errors.push({ path: `breakpoints[${i}].height`, message: "must be number" });
    });
  }
  if (Array.isArray(cfg.pages)) {
    cfg.pages.forEach((p, i) => {
      if (typeof p.name !== "string") errors.push({ path: `pages[${i}].name`, message: "must be string" });
      if (typeof p.path !== "string") errors.push({ path: `pages[${i}].path`, message: "must be string" });
    });
  }
  if (mode === "comprehensive") {
    const c = cfg.comprehensive ?? {};
    if (!c.scope || !Array.isArray(c.scope.include) || c.scope.include.length === 0) {
      errors.push({ path: "comprehensive.scope.include", message: "must be a non-empty array when mode=comprehensive" });
    }
  }
  return errors;
}

function resolveEnv(obj, env) {
  const errors = [];
  function walk(node) {
    if (typeof node === "string") {
      return node.replace(/\$\{env:([A-Z0-9_]+)\}/g, (match, name) => {
        if (env[name] === undefined) {
          errors.push({ path: "(env)", message: `env var ${name} not set (referenced as ${match})` });
          return match;
        }
        return env[name];
      });
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  }
  const resolved = walk(obj);
  return { resolved, errors };
}

export function loadConfig(path, env) {
  if (!existsSync(path)) {
    return { ok: false, errors: [{ path, message: "config file not found" }] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return { ok: false, errors: [{ path, message: `invalid JSON: ${e.message}` }] };
  }
  const { resolved, errors: envErrors } = resolveEnv(raw, env);
  const schemaErrors = validate(resolved);
  const errors = [...schemaErrors, ...envErrors];
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: resolved };
}
