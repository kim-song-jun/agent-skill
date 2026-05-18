// store-memory-bridge — wraps Copilot CLI's `store_memory` MCP tool for
// thrift-copilot's state and summariser mirroring. Falls back to a local
// JSON file when the MCP tool is unreachable.
//
// Contract:
//   await storeMemoryWrite({ key, value, scope, invoker, fallbackRoot, dryRun })
//     → { ok: true, mode: "memory" | "file", path? }
//   await storeMemoryRead({ key, scope, invoker, fallbackRoot })
//     → { ok: true, value, mode: "memory" | "file" | "missing" }
//
// `invoker` is the host-supplied async function that wraps Copilot's
// store_memory MCP tool. Tests pass a mock; production passes a wrapper
// that calls something like:
//
//   await mcp.callTool("store_memory", { action, scope, key, value })
//
// Assumed invoker contract (per Copilot CLI v0.0.380+ tools list):
//
//   invoker({ action: "set" | "get" | "list" | "delete", scope, key, value? })
//     → { ok: true, value? } | { ok: false, error: string }
//
// > TODO: verify Copilot ask_user / store_memory schemas against live
//   CLI. The action/scope/key/value envelope is the working assumption
//   per
//   docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md
//   and the Copilot v0.0.380+ changelog reference therein.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const FALLBACK_SUBDIR = ".thrift/store-memory-fallback";

function sanitizeKey(key) {
  // Filesystem-safe: replace slashes and other special chars with double-underscore.
  return String(key).replace(/[/\\:*?"<>|]/g, "__");
}

function fallbackPath({ fallbackRoot, scope, key }) {
  const safeScope = String(scope || "repository").replace(/[^a-z0-9_-]/gi, "_");
  return resolve(fallbackRoot || ".", FALLBACK_SUBDIR, safeScope, `${sanitizeKey(key)}.json`);
}

function atomicWriteJSON(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

function readFallback(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export async function storeMemoryWrite({ key, value, scope = "repository", invoker = null, fallbackRoot = ".", dryRun = false }) {
  if (!key) throw new Error("storeMemoryWrite: key required");

  // Try the MCP invoker first.
  if (typeof invoker === "function") {
    try {
      const r = await invoker({ action: "set", scope, key, value });
      if (r && r.ok) {
        return { ok: true, mode: "memory" };
      }
      // ok: false → fall through to file fallback.
    } catch {
      // Any throw → fall through to file fallback.
    }
  }

  // File fallback.
  const fp = fallbackPath({ fallbackRoot, scope, key });
  if (dryRun) {
    return { ok: true, mode: "file", path: fp, dryRun: true };
  }
  atomicWriteJSON(fp, { key, scope, value, writtenAt: new Date().toISOString() });
  return { ok: true, mode: "file", path: fp };
}

export async function storeMemoryRead({ key, scope = "repository", invoker = null, fallbackRoot = "." }) {
  if (!key) throw new Error("storeMemoryRead: key required");

  // Try MCP first.
  if (typeof invoker === "function") {
    try {
      const r = await invoker({ action: "get", scope, key });
      if (r && r.ok) {
        if (r.value === undefined || r.value === null) {
          return { ok: true, mode: "memory", value: null, missing: true };
        }
        return { ok: true, mode: "memory", value: r.value };
      }
    } catch {
      // Fall through.
    }
  }

  // File fallback.
  const fp = fallbackPath({ fallbackRoot, scope, key });
  const data = readFallback(fp);
  if (data == null) {
    return { ok: true, mode: "missing", value: null };
  }
  return { ok: true, mode: "file", value: data.value };
}

// Round-trip self-test — useful for Phase 0 preflight to detect whether
// the MCP invoker is responsive.
export async function storeMemoryProbe({ invoker, scope = "repository", fallbackRoot = "." }) {
  const probeKey = `thrift/_probe-${process.pid}-${Date.now()}`;
  const probeValue = { probe: true, at: new Date().toISOString() };
  const wr = await storeMemoryWrite({ key: probeKey, value: probeValue, scope, invoker, fallbackRoot });
  const rd = await storeMemoryRead({ key: probeKey, scope, invoker, fallbackRoot });
  // Try to clean up via the invoker; fall through if it doesn't expose delete.
  if (typeof invoker === "function") {
    try {
      await invoker({ action: "delete", scope, key: probeKey });
    } catch { /* non-fatal */ }
  }
  return {
    writeMode: wr.mode,
    readMode: rd.mode,
    roundTripOk: rd.value && rd.value.probe === true,
  };
}
