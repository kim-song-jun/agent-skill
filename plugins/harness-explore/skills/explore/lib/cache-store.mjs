// Cache store — read/write `.explore-cache/<sha>.json`.
//
// Invariants:
//   - Cache files are keyed by git rev-parse HEAD output (callers pass
//     the SHA; we never compute it ourselves — that's preflight's job).
//   - Writes are atomic via temp-file + rename.
//   - Loads validate `schemaVersion`. A mismatch is treated as a miss
//     (forces re-scan).
//   - `invalidate(sha)` deletes the file if present; no-op if absent.
//   - `list(cacheDir)` returns sorted SHAs of all valid cache entries
//     (for future GC).
//
// Contract:
//   load(sha, cacheDir) → { ok: true, map } | { ok: false, reason }
//   save(sha, map, cacheDir) → { ok: true, bytes, path } | throws
//   invalidate(sha, cacheDir) → boolean (true if deleted)
//   list(cacheDir) → string[] sorted

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, basename, extname } from "node:path";

export const SCHEMA_VERSION = "1.0.0";

function cachePath(sha, cacheDir) {
  return resolve(cacheDir, `${sha}.json`);
}

export function load(sha, cacheDir) {
  if (!sha) return { ok: false, reason: "no-sha" };
  const path = cachePath(sha, cacheDir);
  if (!existsSync(path)) return { ok: false, reason: "not-found" };
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    return { ok: false, reason: `io-error: ${e.message}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: `malformed-json: ${e.message}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: `schema-mismatch: have=${parsed.schemaVersion} want=${SCHEMA_VERSION}` };
  }
  if (parsed.sha !== sha) {
    return { ok: false, reason: `sha-mismatch: file=${parsed.sha} expected=${sha}` };
  }
  return { ok: true, map: parsed };
}

export function save(sha, map, cacheDir) {
  if (!sha) throw new Error("save: sha required");
  if (!map || typeof map !== "object") throw new Error("save: map must be an object");
  // Stamp / normalise required fields.
  const out = { ...map, schemaVersion: SCHEMA_VERSION, sha };
  if (!out.generatedAt) out.generatedAt = new Date().toISOString();
  const dir = resolve(cacheDir);
  mkdirSync(dir, { recursive: true });
  const finalPath = cachePath(sha, cacheDir);
  const tmpPath = `${finalPath}.tmp`;
  const json = JSON.stringify(out, null, 2);
  writeFileSync(tmpPath, json, "utf-8");
  renameSync(tmpPath, finalPath);
  return { ok: true, bytes: Buffer.byteLength(json, "utf-8"), path: finalPath };
}

export function invalidate(sha, cacheDir) {
  if (!sha) return false;
  const path = cachePath(sha, cacheDir);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function list(cacheDir) {
  const dir = resolve(cacheDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => extname(n) === ".json" && !n.endsWith(".tmp"))
    .map((n) => basename(n, ".json"))
    .sort();
}
