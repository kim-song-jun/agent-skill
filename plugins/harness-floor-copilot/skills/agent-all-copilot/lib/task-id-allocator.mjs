import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { posix as pathPosix } from "node:path";
import { artifactPaths, normalizeRelPath } from "./artifact-paths.mjs";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CANONICAL_TASK_ID_RE = /^AS-TASK-[0-9A-HJKMNP-TV-Z]{26}$/;
const DISPLAY_ID_RE = /^T-(\d{8})-(\d{3})(?:-(\d+))?$/;

function idsFromIndex(indexText) {
  return [...String(indexText || "").matchAll(/(?:docs\/tasks|\.agent-skill\/tasks)\/0*([0-9]+)-[^)\s]+\.md/g)].map((m) => Number(m[1]));
}

function idsFromFiles(filenames) {
  return filenames
    .map((name) => /^0*([0-9]+)-.+\.md$/.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

export function allocateTaskId({ indexText = "", filenames = [], requestedId = null } = {}) {
  const used = new Set([...idsFromIndex(indexText), ...idsFromFiles(filenames)]);
  if (requestedId != null) {
    const n = Number(requestedId);
    if (!Number.isInteger(n) || n < 1) throw new Error("--task-id must be a positive integer");
    if (used.has(n)) throw new Error(`task id ${n} collides with an existing task`);
    return n;
  }
  return used.size === 0 ? 1 : Math.max(...used) + 1;
}

function encodeTime(ms, length = 10) {
  let value = BigInt(ms);
  let out = "";
  for (let i = 0; i < length; i++) {
    const mod = Number(value % 32n);
    out = CROCKFORD[mod] + out;
    value = value / 32n;
  }
  if (value > 0n) throw new Error("timestamp too large for ULID encoding");
  return out;
}

function encodeRandom(bytes, length = 16) {
  const input = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  if (input.length < 10) throw new Error("randomBytes must provide at least 10 bytes");
  let value = 0n;
  for (const byte of input.slice(0, 10)) {
    value = (value << 8n) + BigInt(byte);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    const shift = BigInt((length - i - 1) * 5);
    out += CROCKFORD[Number((value >> shift) & 31n)];
  }
  return out;
}

function millis(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "string") return new Date(now).getTime();
  return Number(now ?? Date.now());
}

export function generateCanonicalTaskId({
  now = new Date(),
  randomBytes = cryptoRandomBytes,
} = {}) {
  const ms = millis(now);
  if (!Number.isFinite(ms) || ms < 0) throw new Error("now must resolve to a valid timestamp");
  const bytes = typeof randomBytes === "function" ? randomBytes(10) : randomBytes;
  return `AS-TASK-${encodeTime(ms)}${encodeRandom(bytes)}`;
}

export function isCanonicalTaskId(value) {
  return CANONICAL_TASK_ID_RE.test(String(value || ""));
}

export function isDisplayTaskId(value) {
  return DISPLAY_ID_RE.test(String(value || ""));
}

function dateStamp(now) {
  const date = new Date(millis(now));
  if (!Number.isFinite(date.getTime())) throw new Error("now must resolve to a valid timestamp");
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function taskSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "task";
}

export function displayIdFromFilename(filename) {
  const base = pathPosix.basename(String(filename || ""));
  const match = /^(T-\d{8}-\d{3}(?:-\d+)?)-[^/]+\.md$/i.exec(base);
  return match?.[1]?.toUpperCase() ?? null;
}

function displayIdsFromIndex(indexText) {
  const ids = [];
  const matches = String(indexText || "").matchAll(/(?:^|[(/`\s])((?:T-\d{8}-\d{3})(?:-\d+)?)-[^)\s/]+\.md/gi);
  for (const match of matches) ids.push(match[1].toUpperCase());
  return ids;
}

function displayIdsFromRegistry(registry) {
  const tasks = Array.isArray(registry?.tasks) ? registry.tasks : [];
  return tasks.map((task) => task?.display_id || task?.displayId).filter(Boolean).map((id) => String(id).toUpperCase());
}

export function usedDisplayIds({ indexText = "", filenames = [], registry = null } = {}) {
  return new Set([
    ...displayIdsFromIndex(indexText),
    ...filenames.map(displayIdFromFilename).filter(Boolean),
    ...displayIdsFromRegistry(registry),
  ]);
}

function displayIdForSequence(stamp, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error("display task id sequence must be a positive integer");
  return `T-${stamp}-${String(n).padStart(3, "0")}`;
}

function baseDisplayId(displayId) {
  const match = /^T-\d{8}-\d{3}/.exec(displayId);
  return match?.[0] ?? displayId;
}

export function allocateDisplayId({
  indexText = "",
  filenames = [],
  registry = null,
  requestedId = null,
  requestedDisplayId = null,
  now = new Date(),
} = {}) {
  const used = usedDisplayIds({ indexText, filenames, registry });
  const stamp = dateStamp(now);
  let candidate = requestedDisplayId ? String(requestedDisplayId).toUpperCase() : null;

  if (candidate == null && requestedId != null) {
    const n = Number(requestedId);
    if (!Number.isInteger(n) || n < 1) throw new Error("--task-id must be a positive integer");
    candidate = displayIdForSequence(stamp, n);
  }

  if (candidate != null) {
    if (!isDisplayTaskId(candidate)) throw new Error("requested display id must match T-YYYYMMDD-NNN");
    if (!used.has(candidate)) return candidate;
    const base = baseDisplayId(candidate);
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix++;
    return `${base}-${suffix}`;
  }

  let max = 0;
  for (const id of used) {
    const match = DISPLAY_ID_RE.exec(id);
    if (match?.[1] === stamp) max = Math.max(max, Number(match[2]));
  }
  return displayIdForSequence(stamp, max + 1);
}

export function taskFilenameForIdentity(identity = {}) {
  const displayId = identity.displayId ?? identity.display_id;
  const slug = identity.slug ?? identity.title ?? "task";
  const normalizedDisplay = String(displayId || "").toUpperCase();
  if (!isDisplayTaskId(normalizedDisplay)) throw new Error("displayId must match T-YYYYMMDD-NNN");
  return `${normalizedDisplay}-${taskSlug(slug)}.md`;
}

export function allocateTaskIdentity({
  indexText = "",
  filenames = [],
  registry = null,
  requestedId = null,
  requestedDisplayId = null,
  now = new Date(),
  randomBytes = cryptoRandomBytes,
  slug = "task",
  title = "Task",
  tasksDir = artifactPaths().tasksDir,
  artifactRoot = artifactPaths().root,
  githubIssue = null,
  status = "doing",
} = {}) {
  const id = generateCanonicalTaskId({ now, randomBytes });
  const displayId = allocateDisplayId({
    indexText,
    filenames,
    registry,
    requestedId,
    requestedDisplayId,
    now,
  });
  const normalizedSlug = taskSlug(slug || title);
  const filename = taskFilenameForIdentity({ displayId, slug: normalizedSlug });
  const path = `${normalizeRelPath(tasksDir)}/${filename}`;
  return {
    id,
    display_id: displayId,
    displayId,
    slug: normalizedSlug,
    filename,
    path,
    title,
    github_issue: githubIssue,
    githubIssue,
    status,
    artifact_root: `${normalizeRelPath(artifactRoot) || artifactPaths().root}/`,
    artifactRoot: normalizeRelPath(artifactRoot) || artifactPaths().root,
  };
}

export function taskFrontmatter(identity = {}) {
  const id = identity.id;
  const displayId = identity.display_id ?? identity.displayId;
  if (!isCanonicalTaskId(id)) throw new Error("task identity requires canonical id");
  if (!isDisplayTaskId(displayId)) throw new Error("task identity requires display id");
  const lines = [
    "---",
    `id: ${id}`,
    `display_id: ${displayId}`,
  ];
  const githubIssue = identity.github_issue ?? identity.githubIssue;
  if (githubIssue != null && githubIssue !== "") lines.push(`github_issue: ${githubIssue}`);
  lines.push(`status: ${identity.status || "doing"}`);
  lines.push(`artifact_root: ${identity.artifact_root ?? `${identity.artifactRoot || artifactPaths().root}/`}`);
  lines.push("---", "");
  return lines.join("\n");
}
