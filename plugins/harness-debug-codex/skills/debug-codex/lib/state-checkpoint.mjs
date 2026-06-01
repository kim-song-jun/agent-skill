// state-checkpoint.mjs — read/write `.debug-state.json` + tree-hash
// helpers for Phase 4's "restore working tree" guarantee.
//
// Public API:
//   loadState(path)                            → {ok, state, warning?} | {ok: false, errors}
//   saveState(path, state)                     — atomic write (tmp + rename)
//   skeleton({command?, description?})         → new state object
//   computeTreeHash({cwd?, spawnSync?})        → "sha256:<hex>" of working tree
//   pushCheckpoint(state, {phase, actionsTaken, hash?, cwd?, spawnSync?})
//   restoreTo(state, hash, {cwd?, spawnSync?}) → {ok, matched, currentHash}
//
// Tree hash: sha256 of `git ls-files -z` joined with each file's
// `git hash-object` digest. Cheap, deterministic, doesn't require a
// commit, and tolerates unstaged uncommitted edits.

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync as nodeSpawnSync } from "node:child_process";

export const STATE_VERSION = "0.1.0";

export function skeleton({ command = null, description = null } = {}) {
  return {
    version: STATE_VERSION,
    createdAt: new Date().toISOString(),
    failure: {
      description: description ?? null,
      command: command ?? null,
      lastExitCode: null,
      lastRunAt: null,
      rawOutputRef: null,
      errorParsed: null,
    },
    hypotheses: [],
    checkpoints: [],
    currentCandidate: null,
    supervisor: null,
    resolution: null,
  };
}

function validate(state) {
  const errors = [];
  if (!state || typeof state !== "object") {
    return [{ field: "(root)", message: "state must be an object" }];
  }
  if (typeof state.version !== "string") errors.push({ field: "version", message: "must be string" });
  if (typeof state.createdAt !== "string") errors.push({ field: "createdAt", message: "must be ISO string" });
  if (!state.failure || typeof state.failure !== "object") errors.push({ field: "failure", message: "required object" });
  if (!Array.isArray(state.hypotheses)) errors.push({ field: "hypotheses", message: "must be array" });
  if (!Array.isArray(state.checkpoints)) errors.push({ field: "checkpoints", message: "must be array" });
  return errors;
}

export function loadState(path) {
  if (!path || !existsSync(path)) {
    return {
      ok: true,
      state: skeleton(),
      warning: ".debug-state.json not found; using skeleton. Phase 0 will seed it.",
    };
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
  return { ok: true, state: parsed };
}

export function saveState(path, state) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, path);
  return path;
}

// Compute a deterministic content hash of the working tree using git.
// spawnSync is injectable so tests can stub it without touching the
// real filesystem.
export function computeTreeHash({ cwd = process.cwd(), spawnSync = nodeSpawnSync } = {}) {
  const ls = spawnSync("git", ["ls-files", "-z"], { cwd, encoding: "buffer" });
  if (ls.status !== 0) {
    throw new Error(`git ls-files failed (status ${ls.status}): ${ls.stderr?.toString() ?? ""}`);
  }
  // git ls-files -z separates entries with NUL bytes.
  const files = ls.stdout.toString("utf-8").split("\0").filter(Boolean);
  if (files.length === 0) {
    return "sha256:" + createHash("sha256").update("").digest("hex");
  }
  const h = createHash("sha256");
  // Process files in chunks to stay under the OS argv cap on huge repos.
  const CHUNK = 200;
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const r = spawnSync("git", ["hash-object", "--", ...chunk], { cwd, encoding: "utf-8" });
    if (r.status !== 0) {
      throw new Error(`git hash-object failed (status ${r.status}): ${r.stderr ?? ""}`);
    }
    const digests = r.stdout.split("\n").filter(Boolean);
    for (let j = 0; j < chunk.length; j++) {
      h.update(chunk[j]).update("\0").update(digests[j] ?? "").update("\n");
    }
  }
  return "sha256:" + h.digest("hex");
}

export function pushCheckpoint(state, { phase, actionsTaken = [], hash = null, cwd, spawnSync } = {}) {
  if (!state || typeof state !== "object") {
    throw new Error("pushCheckpoint: state required");
  }
  if (!Array.isArray(state.checkpoints)) state.checkpoints = [];
  const stateHashBefore = hash ?? (() => {
    try {
      return computeTreeHash({ cwd, spawnSync });
    } catch {
      return null;
    }
  })();
  const entry = {
    at: new Date().toISOString(),
    phase,
    stateHashBefore,
    actionsTaken: Array.isArray(actionsTaken) ? actionsTaken : [],
  };
  state.checkpoints.push(entry);
  return entry;
}

// Best-effort: does NOT discard uncommitted work. Recomputes the
// current tree hash and reports whether it matches the requested hash.
// Phase 4 uses this to detect when an experiment failed to clean up.
export function restoreTo(_state, hash, { cwd, spawnSync } = {}) {
  if (typeof hash !== "string") {
    return { ok: false, matched: false, currentHash: null, reason: "hash must be string" };
  }
  let currentHash = null;
  try {
    currentHash = computeTreeHash({ cwd, spawnSync });
  } catch (e) {
    return { ok: false, matched: false, currentHash: null, reason: e.message };
  }
  return {
    ok: true,
    matched: currentHash === hash,
    currentHash,
    reason: currentHash === hash ? "match" : "working tree differs from checkpoint",
  };
}

// Tree-hash-based rehydration helper for --resume.
// Returns a digest of the state suitable for a 200-token preamble.
export function summariseForResume(state) {
  if (!state) return "no prior state";
  const hypCount = (state.hypotheses ?? []).length;
  const tested = (state.hypotheses ?? []).filter((h) => h.status && h.status !== "untested").length;
  const cp = (state.checkpoints ?? []).length;
  const cmd = state.failure?.command ?? "<none>";
  const desc = state.failure?.description ?? "<no description>";
  const cand = state.currentCandidate;
  return [
    `failure: ${desc}`,
    `command: ${cmd}`,
    `hypotheses: ${hypCount} total / ${tested} tested`,
    `checkpoints: ${cp}`,
    `currentCandidate: ${cand ?? "none"}`,
  ].join("\n");
}
