// memory-bridge — visual-qa-copilot's wrapper around Copilot's
// store_memory / recall_memory tools. Mirrors writes to disk and falls
// back to file on memory miss/eviction.
//
// Used primarily by Phase 1 → Phase 3 to share the matrix across parallel
// page tasks (each task can `recall_memory("visual-qa/matrix")` instead
// of re-parsing the config).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STORE_TOOL = "store_memory";
const RECALL_TOOL = "recall_memory";
const SCOPE = "repository";

function safeKey(key) {
  return key.replace(/[^a-z0-9_.-]+/gi, "_");
}

export function makeFileMirror({ rootDir }) {
  if (!rootDir) throw new Error("makeFileMirror: rootDir required");
  const root = resolve(rootDir);
  return {
    pathFor(key) { return join(root, `${safeKey(key)}.json`); },
    read(key) {
      const p = join(root, `${safeKey(key)}.json`);
      if (!existsSync(p)) return null;
      return readFileSync(p, "utf-8");
    },
    write(key, value) {
      const p = join(root, `${safeKey(key)}.json`);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value, null, 2));
      return p;
    },
  };
}

export async function bridgeToFile({ key, value, fileMirror }) {
  if (!fileMirror) throw new Error("bridgeToFile: fileMirror required");
  return fileMirror.write(key, value);
}

export async function storeRepoMemory({ key, value, toolCaller, fileMirror }) {
  if (typeof key !== "string" || !key) throw new Error("storeRepoMemory: key required");
  let memoryOk = false;
  let lastError;
  if (typeof toolCaller === "function") {
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      await toolCaller({ name: STORE_TOOL, args: { key, value: serialized, scope: SCOPE } });
      memoryOk = true;
    } catch (e) {
      lastError = e?.message ?? String(e);
    }
  }
  let fileOk = false;
  if (fileMirror) {
    try { fileMirror.write(key, value); fileOk = true; }
    catch (e) { lastError = lastError ?? (e?.message ?? String(e)); }
  }
  if (!memoryOk && !fileOk) {
    return { ok: false, source: null, error: lastError ?? "no backing store" };
  }
  return {
    ok: true,
    source: memoryOk && fileOk ? "both" : (memoryOk ? "memory" : "file"),
    ...(lastError ? { warning: lastError } : {}),
  };
}

function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

export async function recallRepoMemory({ key, toolCaller, fileMirror, validateAgainstFile = false }) {
  if (typeof key !== "string" || !key) throw new Error("recallRepoMemory: key required");
  let memoryValue;
  let memoryFound = false;
  let lastError;
  if (typeof toolCaller === "function") {
    try {
      const reply = await toolCaller({ name: RECALL_TOOL, args: { key, scope: SCOPE } });
      if (reply != null) {
        const raw = typeof reply === "string" ? reply : reply.value;
        if (raw != null) { memoryValue = parseMaybeJson(raw); memoryFound = true; }
      }
    } catch (e) {
      lastError = e?.message ?? String(e);
    }
  }
  let fileValue;
  let fileFound = false;
  if (fileMirror) {
    try {
      const raw = fileMirror.read(key);
      if (raw != null) { fileValue = parseMaybeJson(raw); fileFound = true; }
    } catch (e) {
      lastError = lastError ?? (e?.message ?? String(e));
    }
  }
  if (memoryFound) {
    let stale = false;
    if (validateAgainstFile && fileFound) {
      stale = JSON.stringify(fileValue) !== JSON.stringify(memoryValue);
    }
    return { ok: true, value: memoryValue, source: "memory", stale };
  }
  if (fileFound) {
    return {
      ok: true, value: fileValue, source: "file",
      ...(lastError ? { warning: lastError } : {}),
    };
  }
  return { ok: false, value: null, source: null, error: lastError ?? `key not found: ${key}` };
}

export const __internal = { safeKey, parseMaybeJson, STORE_TOOL, RECALL_TOOL, SCOPE };
