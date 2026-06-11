import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  artifactPaths,
  handoffPathsForTaskPath,
} from "./artifact-paths.mjs";

export function handoffPathsForTask(taskPath, options = {}) {
  return handoffPathsForTaskPath(taskPath, {
    handoffDir: options.handoffDir ?? artifactPaths(options.config).handoffDir,
    legacySibling: Boolean(options.legacySibling),
  });
}

function readIfExists(path, reader) {
  try {
    return reader(path, "utf8");
  } catch {
    return null;
  }
}

export function parseEmbeddedMetadata(text, marker) {
  const escaped = String(marker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`<!--\\s*${escaped}\\s*\\n([\\s\\S]*?)\\n-->`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function discoverResumeArtifacts({
  cwd = process.cwd(),
  taskPath,
  config = {},
  exists = existsSync,
  read = readFileSync,
} = {}) {
  if (!taskPath) {
    return { found: false, artifacts: [], handoffPath: null, sessionPath: null, metadata: null };
  }

  const { handoffPath, sessionPath } = handoffPathsForTask(taskPath, { config });
  const legacy = handoffPathsForTask(taskPath, { legacySibling: true });
  const artifacts = [];
  let metadata = null;

  for (const candidate of [
    { type: "handoff", path: handoffPath, marker: "agent-handoff-metadata" },
    { type: "session", path: sessionPath, marker: "agent-session-metadata" },
    { type: "handoff", path: legacy.handoffPath, marker: "agent-handoff-metadata", legacy: true },
    { type: "session", path: legacy.sessionPath, marker: "agent-session-metadata", legacy: true },
  ]) {
    if (artifacts.some((artifact) => artifact.type === candidate.type && artifact.path === candidate.path)) continue;
    const abs = resolve(cwd, candidate.path);
    if (!exists(abs)) continue;
    const text = readIfExists(abs, read);
    artifacts.push({ type: candidate.type, path: candidate.path, legacy: Boolean(candidate.legacy) });
    metadata = metadata || parseEmbeddedMetadata(text, candidate.marker);
  }

  return {
    found: artifacts.length > 0,
    artifacts,
    handoffPath,
    sessionPath,
    artifactDir: dirname(handoffPath),
    metadata,
  };
}
