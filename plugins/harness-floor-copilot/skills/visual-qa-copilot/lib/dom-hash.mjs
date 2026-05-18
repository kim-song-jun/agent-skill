// DOM subtree hashing + cross-run cache for the comprehensive-mode
// visual-qa. When a component's serialised DOM + visual style hasn't
// changed since the prior accepted run, we re-use the prior LLM verdict
// instead of re-analysing the screenshot. Saves the dominant cost.
//
// Pure functions; the runtime layer reads the .png + DOM and produces
// a string we hash. Cache I/O is provided via a tiny readCache /
// writeCache pair so callers can persist to disk however they like.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RELEVANT_STYLES = ["background", "color", "font-size", "font-weight", "border", "display", "visibility"];

// Normalise a DOM serialisation into something stable across runs.
// Removes whitespace noise, normalises attribute order, drops
// auto-generated class names (Tailwind hashed, CSS Modules suffix).
export function normaliseDomString(raw) {
  if (typeof raw !== "string") return "";
  return raw
    // collapse whitespace runs
    .replace(/\s+/g, " ")
    // strip space adjacent to angle brackets (text content whitespace)
    .replace(/>\s+/g, ">")
    .replace(/\s+</g, "<")
    .trim()
    // strip data-reactid / data-react-helmet noise
    .replace(/\s+data-reactid="[^"]*"/g, "")
    .replace(/\s+data-react-helmet="[^"]*"/g, "")
    // CSS Modules class suffix (e.g. _hash123)
    .replace(/_[a-z0-9]{5,8}\b/g, "_HASHED")
    // Tailwind arbitrary value hashes
    .replace(/\[[a-z0-9_-]{6,}\]/g, "[HASHED]");
}

// Build the canonical hash input from { dom, computedStyles? }.
function canonicalInput({ dom, computedStyles }) {
  const norm = normaliseDomString(dom);
  if (!computedStyles || typeof computedStyles !== "object") return norm;
  const styles = RELEVANT_STYLES
    .map((k) => `${k}=${computedStyles[k] ?? ""}`)
    .join("|");
  return `${norm}#${styles}`;
}

export function hashComponent({ dom, computedStyles }) {
  const input = canonicalInput({ dom, computedStyles });
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// Cache file shape:
//   {
//     "version": 1,
//     "entries": {
//       "<hash>": { priorAnalysis: {...}, lastSeen: "<iso>" }
//     }
//   }

export function emptyCache() {
  return { version: 1, entries: {} };
}

export function readCache(path) {
  if (!path || !existsSync(path)) return emptyCache();
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (raw && raw.version === 1 && raw.entries && typeof raw.entries === "object") {
      return raw;
    }
  } catch {
    /* fall through to empty */
  }
  return emptyCache();
}

export function writeCache(path, cache) {
  if (!path) throw new TypeError("writeCache requires a path");
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function lookup(cache, hash) {
  if (!cache?.entries) return null;
  return cache.entries[hash] ?? null;
}

// Insert or overwrite an entry. Bumps lastSeen ISO timestamp.
export function recordHit(cache, hash, priorAnalysis, now = new Date()) {
  const out = cache && cache.entries ? cache : emptyCache();
  out.entries[hash] = {
    priorAnalysis,
    lastSeen: now.toISOString(),
  };
  return out;
}

// Drop entries not seen in >ttlDays days. Keeps cache from growing
// unbounded on long-lived projects.
export function evictStale(cache, ttlDays = 30, now = new Date()) {
  if (!cache?.entries) return emptyCache();
  const cutoff = now.getTime() - ttlDays * 24 * 60 * 60 * 1000;
  const out = { version: 1, entries: {} };
  for (const [hash, entry] of Object.entries(cache.entries)) {
    const ts = Date.parse(entry.lastSeen ?? "");
    if (Number.isFinite(ts) && ts >= cutoff) out.entries[hash] = entry;
  }
  return out;
}
