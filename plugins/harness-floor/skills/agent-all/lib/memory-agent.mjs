// memory-agent.mjs — Layer1: structured file mirror via makeFileMirror.
//                    Layer2: append-only JSONL at .agent-skill/runs/<runId>/memory-log.jsonl.
// NO git operations anywhere in this module.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  makeFileMirror,
  storeRepoMemory,
  recallRepoMemory,
} from "../../../../harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";
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
