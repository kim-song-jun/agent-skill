// memory-agent.mjs — Layer1: structured file mirror via makeFileMirror (RECOVERY SSOT).
//                    Layer2: append-only JSONL at .agent-skill/runs/<runId>/memory-log.jsonl
//                            — AUDIT/FORENSIC TRAIL ONLY, never read back;
//                              recovery reads Layer-1 file mirror exclusively.
// NO git operations anywhere in this module.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  makeFileMirror,
  storeRepoMemory,
  recallRepoMemory,
} from "./memory-bridge.mjs";
import { artifactPaths } from "./artifact-paths.mjs";

export const MEMORY_LOG_SCHEMA_VERSION = "memory-log/v1";

const SAFE_RUN_ID = /[^A-Za-z0-9._-]/g;

export function sanitizeRunId(runId) {
  const safe = String(runId || "default").replace(SAFE_RUN_ID, "-");
  return safe || "default";
}

export function memoryLogPath({ cwd, runId, config = {} }) {
  return join(resolve(cwd), artifactPaths(config).runsDir, sanitizeRunId(runId), "memory-log.jsonl");
}

function appendMemoryLog({ cwd, runId, key, value, config = {}, now = new Date() }) {
  const path = memoryLogPath({ cwd, runId, config });
  mkdirSync(dirname(path), { recursive: true });
  const entry = {
    schemaVersion: MEMORY_LOG_SCHEMA_VERSION,
    timestamp: now instanceof Date ? now.toISOString() : String(now),
    runId: sanitizeRunId(runId),
    key,
    value,
  };
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
  return path;
}

export function makeMemoryAgent({ rootDir, runId = "default", cwd = process.cwd(), config = {} }) {
  if (!rootDir) throw new Error("makeMemoryAgent: rootDir required");
  const fileMirror = makeFileMirror({ rootDir });
  const resolvedCwd = resolve(cwd);
  const resolvedRunId = sanitizeRunId(runId);

  async function store(key, payload, toolCaller = null) {
    const result = await storeRepoMemory({
      key, value: payload,
      toolCaller: typeof toolCaller === "function" ? toolCaller : undefined,
      fileMirror,
    });
    appendMemoryLog({ cwd: resolvedCwd, runId: resolvedRunId, key, value: payload, config });
    return result;
  }

  async function recall(key, toolCaller = null) {
    return recallRepoMemory({
      key,
      toolCaller: typeof toolCaller === "function" ? toolCaller : undefined,
      fileMirror,
    });
  }

  function logPath() {
    return memoryLogPath({ cwd: resolvedCwd, runId: resolvedRunId, config });
  }

  return { store, recall, logPath };
}

// --- G4 addition: flushCheckpoint — auto-flush trigger for wave/phase boundaries ---
//
// Writes TWO keys to the Layer-1 file mirror:
//   1. history key: checkpoint/wave-<wave>-iter-<iter>  (append-style audit, kept for history)
//   2. fixed pointer: checkpoint/LATEST                 (overwritten each flush)
//
// checkpoint/LATEST carries { pointerTo, wave, iter, phase, inFlight, ... full payload }
// so a dead session can find the latest checkpoint WITHOUT knowing wave/iter coordinates.
//
// Layer-2 JSONL is AUDIT/FORENSIC TRAIL ONLY — never read back. ok:true is gated on
// Layer-1 success. fileMirror is REQUIRED; a missing mirror returns ok:false/recoverable:false.
//
// Reuses G3's MEMORY_LOG_SCHEMA_VERSION, sanitizeRunId, memoryLogPath,
// and the already-imported appendFileSync/mkdirSync/dirname helpers.
export async function flushCheckpoint({
  cwd = process.cwd(),
  runId = "default",
  wave,
  iter,
  phase = "3a",
  inFlight = true,
  miniPlans = [],
  taskIds = [],
  requiredAgents = [],
  decisionsSoFar = {},
  fileMirror,
  config = {},
  now = new Date(),
} = {}) {
  // fileMirror is REQUIRED for recoverability.
  // Layer-2 JSONL alone is audit-only and cannot be recalled by recallRepoMemory.
  if (!fileMirror) {
    return {
      ok: false,
      recoverable: false,
      error: "flushCheckpoint: fileMirror required — Layer-2 JSONL alone is audit-only and cannot be recalled",
      logPath: null,
    };
  }

  const flushedAt = now instanceof Date ? now.toISOString() : String(now);
  const historyKey = `checkpoint/wave-${wave}-iter-${iter}`;
  const latestKey = "checkpoint/LATEST";

  // Layer 1 — file mirror (durable, synchronous, the recovery SSOT).
  // Write the history key (kept for audit/history).
  const historyPayload = {
    wave,
    iter,
    phase,
    inFlight,
    taskIds,
    miniPlans,
    requiredAgents,
    decisionsSoFar,
    flushedAt,
  };
  fileMirror.write(historyKey, historyPayload);

  // Write the fixed LATEST pointer (overwritten each flush).
  // Carries the full payload + pointerTo so a fresh post-death session
  // needs zero lost coordinates.
  const latestPayload = {
    ...historyPayload,
    pointerTo: historyKey,
    runId: sanitizeRunId(runId),
    flushedAt,
  };
  fileMirror.write(latestKey, latestPayload);

  // Layer 2 — append-only JSONL (memory-log/v1); AUDIT/FORENSIC TRAIL ONLY.
  // Reuse G3's memoryLogPath helper.
  const logPath = memoryLogPath({ cwd, runId, config });
  mkdirSync(dirname(logPath), { recursive: true });
  const entry = {
    schemaVersion: MEMORY_LOG_SCHEMA_VERSION,
    timestamp: flushedAt,
    runId: sanitizeRunId(runId),
    wave,
    iter,
    phase,
    inFlight,
    event: "checkpoint",
    taskIds,
    miniPlans,
    requiredAgents,
  };
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");

  return {
    ok: true,
    recoverable: true,
    logPath,
    latestKey,
    historyKey,
  };
}

// --- G4 addition: recallLatestCheckpoint — discovery helper for post-death resume ---
//
// Reads checkpoint/LATEST from the Layer-1 file mirror (via reused recallRepoMemory).
// A fresh post-death session needs ONLY cwd + disk — no lost wave/iter coordinates.
// This is the SAME function Phase 0 step 5b calls on --resume.
//
// Returns: { found: boolean, checkpoint: object|null, key: string|null, source: "file"|"memory"|null }
// A usable checkpoint is a parsed object carrying wave coordinates — NOT a raw
// string (parseMaybeJson returns the raw text on malformed JSON, so a truncated
// LATEST surfaces here as a string we must reject and fall back from).
function isUsableCheckpoint(v) {
  return v != null && typeof v === "object" && typeof v.wave === "number";
}

// Fallback when checkpoint/LATEST is missing or corrupt: scan the per-wave
// history checkpoints (`checkpoint/wave-<w>-iter-<i>`) and return the newest
// usable one, so a corrupt fixed pointer never loses recoverable coordinates.
async function recallNewestWaveCheckpoint({ fileMirror, toolCaller = null }) {
  const none = { found: false, checkpoint: null, key: null, source: null };
  if (!fileMirror || typeof fileMirror.listKeys !== "function") return none;
  // safeKey turns "checkpoint/wave-0-iter-1" into "checkpoint_wave-0-iter-1".
  const re = /^checkpoint[_/]wave-(\d+)-iter-(\d+)$/;
  let best = null;
  for (const key of fileMirror.listKeys()) {
    const m = key.match(re);
    if (!m) continue;
    const wave = Number(m[1]);
    const iter = Number(m[2]);
    if (!best || wave > best.wave || (wave === best.wave && iter > best.iter)) {
      best = { key, wave, iter };
    }
  }
  if (!best) return none;
  const r = await recallRepoMemory({
    key: best.key,
    toolCaller: typeof toolCaller === "function" ? toolCaller : null,
    fileMirror,
  });
  if (!r.ok || !isUsableCheckpoint(r.value)) return none;
  return { found: true, checkpoint: r.value, key: best.key, source: r.source, recoveredFrom: "wave-history" };
}

export async function recallLatestCheckpoint({ fileMirror, toolCaller = null }) {
  const r = await recallRepoMemory({
    key: "checkpoint/LATEST",
    toolCaller: typeof toolCaller === "function" ? toolCaller : null,
    fileMirror,
  });
  if (r.ok && isUsableCheckpoint(r.value)) {
    return {
      found: true,
      checkpoint: r.value,
      key: r.value?.pointerTo ?? "checkpoint/LATEST",
      source: r.source,
    };
  }
  // LATEST absent or corrupt (e.g. truncated mid-write before the atomic-write
  // fix, or external corruption) → recover from the newest per-wave checkpoint.
  return recallNewestWaveCheckpoint({ fileMirror, toolCaller });
}
