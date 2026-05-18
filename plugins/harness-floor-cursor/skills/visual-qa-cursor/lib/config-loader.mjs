// Vendored from plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs.
// Keep BYTE-FOR-BYTE identical to the source-of-truth.
import { readFileSync, existsSync } from "node:fs";

const REQUIRED_TOP = ["baseUrl", "breakpoints", "pages"];

function validate(cfg) {
  const errors = [];
  for (const k of REQUIRED_TOP) {
    if (cfg[k] === undefined) errors.push({ path: k, message: `${k} is required` });
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
