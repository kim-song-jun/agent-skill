import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, posix as pathPosix } from "node:path";
import { artifactPaths, normalizeRelPath } from "./artifact-paths.mjs";
import { isCanonicalTaskId, isDisplayTaskId } from "./task-id-allocator.mjs";

export const TASK_REGISTRY_VERSION = 1;

export function emptyTaskRegistry() {
  return { version: TASK_REGISTRY_VERSION, tasks: [] };
}

export function taskRegistryPath(config = {}) {
  return artifactPaths(config).taskRegistryPath;
}

function rejectsUnsafeRelPath(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  return /^(?:\/|[A-Za-z]:)/.test(raw) || raw.split("/").includes("..");
}

function normalizeGithubIssue(value) {
  if (value == null || value === "") return null;
  const issue = Number(value);
  if (!Number.isInteger(issue) || issue < 1) {
    throw new Error("task registry record github_issue must be a positive integer");
  }
  return issue;
}

export function normalizeTaskRecord(record = {}) {
  const id = String(record.id || "").trim();
  const displayId = String(record.display_id ?? record.displayId ?? "").trim().toUpperCase();
  const rawPath = record.path ?? record.taskPath;
  const path = normalizeRelPath(rawPath);
  const status = String(record.status || "doing").trim();
  const rawArtifactRoot = record.artifact_root ?? record.artifactRoot ?? artifactPaths().root;
  const artifactRoot = normalizeRelPath(rawArtifactRoot);
  const githubIssue = normalizeGithubIssue(record.github_issue ?? record.githubIssue ?? null);

  if (!isCanonicalTaskId(id)) throw new Error("task registry record requires AS-TASK canonical id");
  if (!isDisplayTaskId(displayId)) throw new Error("task registry record requires T-YYYYMMDD-NNN display_id");
  if (rejectsUnsafeRelPath(rawPath)) throw new Error("task registry record requires a relative task markdown path");
  if (!path.endsWith(".md")) throw new Error("task registry record requires a task markdown path");
  if (rejectsUnsafeRelPath(rawArtifactRoot)) throw new Error("task registry record requires a relative artifact root");

  return {
    id,
    display_id: displayId,
    path,
    github_issue: githubIssue,
    status,
    artifact_root: artifactRoot ? `${artifactRoot}/` : `${artifactPaths().root}/`,
  };
}

export function normalizeTaskRegistry(registry = {}) {
  const tasks = Array.isArray(registry.tasks) ? registry.tasks : [];
  return {
    version: TASK_REGISTRY_VERSION,
    tasks: tasks.map(normalizeTaskRecord),
  };
}

export function readTaskRegistry(path = taskRegistryPath()) {
  if (!existsSync(path)) return emptyTaskRegistry();
  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  return normalizeTaskRegistry(parsed);
}

function baseDisplayId(displayId) {
  const match = /^T-\d{8}-\d{3}/.exec(displayId);
  return match?.[0] ?? displayId;
}

function nextSuffixedDisplayId(displayId, used) {
  const base = baseDisplayId(displayId);
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

function rewriteDisplayIdInPath(path, fromDisplayId, toDisplayId) {
  const normalizedPath = normalizeRelPath(path);
  const dir = pathPosix.dirname(normalizedPath);
  const base = pathPosix.basename(normalizedPath);
  const nextBase = base.startsWith(`${fromDisplayId}-`)
    ? `${toDisplayId}-${base.slice(fromDisplayId.length + 1)}`
    : base === `${fromDisplayId}.md`
      ? `${toDisplayId}.md`
      : base;
  return dir === "." ? nextBase : pathPosix.join(dir, nextBase);
}

export function upsertTaskRecord(registry, record, { onDisplayConflict = "throw" } = {}) {
  const next = normalizeTaskRegistry(registry);
  let normalized = normalizeTaskRecord(record);
  const idIndex = next.tasks.findIndex((task) => task.id === normalized.id);
  const displayConflict = next.tasks.find(
    (task) => task.display_id === normalized.display_id && task.id !== normalized.id,
  );
  if (displayConflict) {
    if (onDisplayConflict !== "suffix") {
      throw new Error(`display_id ${normalized.display_id} already belongs to ${displayConflict.id}`);
    }
    const displayId = nextSuffixedDisplayId(
      normalized.display_id,
      new Set(next.tasks.map((task) => task.display_id)),
    );
    normalized = {
      ...normalized,
      display_id: displayId,
      path: rewriteDisplayIdInPath(normalized.path, normalized.display_id, displayId),
    };
  }
  if (idIndex >= 0) {
    next.tasks[idIndex] = { ...next.tasks[idIndex], ...normalized };
  } else {
    next.tasks.push(normalized);
  }
  next.tasks.sort((a, b) => a.display_id.localeCompare(b.display_id) || a.id.localeCompare(b.id));
  return next;
}

export function writeTaskRegistry(path, registry) {
  const normalized = normalizeTaskRegistry(registry);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`);
  renameSync(tmp, path);
  return normalized;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withTaskRegistryLock(path, fn, { lockTimeoutMs = 5000 } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const started = Date.now();
  let fd = null;
  while (fd == null) {
    try {
      fd = openSync(lockPath, "wx");
      writeFileSync(fd, `${process.pid}\n`);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() - started > lockTimeoutMs) {
        throw new Error(`timed out waiting for task registry lock: ${lockPath}`);
      }
      sleepSync(10);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    unlinkSync(lockPath);
  }
}

export function recordTask({
  registryPath = taskRegistryPath(),
  registry = null,
  record,
  onDisplayConflict = "suffix",
  lockTimeoutMs = 5000,
} = {}) {
  return withTaskRegistryLock(registryPath, () => {
    const current = registry ?? readTaskRegistry(registryPath);
    const next = upsertTaskRecord(current, record, { onDisplayConflict });
    return writeTaskRegistry(registryPath, next);
  }, { lockTimeoutMs });
}

export function findTaskRecord(registry, { id = null, displayId = null, path = null } = {}) {
  const normalized = normalizeTaskRegistry(registry);
  const normalizedPath = path ? normalizeRelPath(path) : null;
  const normalizedDisplay = displayId ? String(displayId).toUpperCase() : null;
  return normalized.tasks.find((task) => {
    if (id && task.id === id) return true;
    if (normalizedDisplay && task.display_id === normalizedDisplay) return true;
    if (normalizedPath && task.path === normalizedPath) return true;
    return false;
  }) ?? null;
}
