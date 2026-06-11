import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, posix as pathPosix, resolve } from "node:path";

export const DEFAULT_ARTIFACT_ROOT = ".agent-skill";
export const LEGACY_DOCS_ROOT = "docs";
export const LEGACY_TASKS_DIR = "docs/tasks";

export function normalizeRelPath(value) {
  const input = String(value || "").trim().replace(/\\/g, "/");
  if (!input) return "";
  return pathPosix.normalize(input).replace(/\/+$/, "");
}

export function resolveArtifactRoot(config = {}) {
  const configured = config.artifactRoot ?? config.artifact?.root ?? DEFAULT_ARTIFACT_ROOT;
  return normalizeRelPath(configured) || DEFAULT_ARTIFACT_ROOT;
}

export function artifactPaths(config = {}) {
  const root = resolveArtifactRoot(config);
  return {
    root,
    tasksDir: `${root}/tasks`,
    specsDir: `${root}/specs`,
    plansDir: `${root}/plans`,
    decisionsDir: `${root}/decisions`,
    handoffDir: `${root}/handoff`,
    runsDir: `${root}/runs`,
    registryDir: `${root}/registry`,
    taskRegistryPath: `${root}/registry/tasks.json`,
    reportsDir: `${root}/reports`,
    visualQaDir: `${root}/reports/visual-qa`,
    debugReportsDir: `${root}/reports/debug`,
    thriftReportsDir: `${root}/reports/thrift`,
    baselinesDir: `${root}/baselines`,
    legacyTasksDir: LEGACY_TASKS_DIR,
  };
}

export function shouldExportDocs(config = {}) {
  return config.artifact?.exportDocs === true || config.exportDocs === true;
}

export function docsExportPathForArtifact(artifactPath, { config = {} } = {}) {
  const normalized = normalizeRelPath(artifactPath);
  if (!normalized) return null;

  const paths = artifactPaths(config);
  const root = normalizeRelPath(paths.root);
  if (!isTaskPathInDir(normalized, root)) return null;

  const rel = normalized.slice(root.length).replace(/^\/+/, "");
  const mappings = [
    ["reports/", "docs/reports/"],
    ["specs/", "docs/superpowers/specs/"],
    ["plans/", "docs/superpowers/plans/"],
    ["tasks/", "docs/tasks/"],
    ["handoff/", "docs/tasks/"],
  ];
  for (const [prefix, docsPrefix] of mappings) {
    if (rel.startsWith(prefix)) return `${docsPrefix}${rel.slice(prefix.length)}`;
  }
  return null;
}

export function mirrorArtifactToDocs({
  cwd = process.cwd(),
  artifactPath,
  content,
  config = {},
} = {}) {
  if (!shouldExportDocs(config)) return { exported: false, path: null };
  const exportPath = docsExportPathForArtifact(artifactPath, { config });
  if (!exportPath) return { exported: false, path: null };
  const outputPath = resolve(cwd, exportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, String(content ?? ""), "utf-8");
  return { exported: true, path: exportPath };
}

export function isTaskPathInDir(taskPath, tasksDir) {
  const normalized = normalizeRelPath(taskPath);
  const dir = normalizeRelPath(tasksDir);
  return normalized === dir || normalized.startsWith(`${dir}/`);
}

export function normalizeTaskPath(rawPath, {
  tasksDir = artifactPaths().tasksDir,
  legacyTasksDir = LEGACY_TASKS_DIR,
} = {}) {
  const taskPath = normalizeRelPath(rawPath)
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .replace(/#.*$/, "")
    .replace(/[.,;:]+$/, "");
  if (!taskPath.endsWith(".md")) return null;

  let normalized;
  if (isTaskPathInDir(taskPath, tasksDir) || isTaskPathInDir(taskPath, legacyTasksDir)) {
    normalized = pathPosix.normalize(taskPath);
  } else if (taskPath.startsWith("./") || !taskPath.includes("/")) {
    normalized = pathPosix.normalize(pathPosix.join(tasksDir, taskPath.replace(/^\.\//, "")));
  } else {
    return null;
  }

  if (!isTaskPathInDir(normalized, tasksDir) && !isTaskPathInDir(normalized, legacyTasksDir)) {
    return null;
  }
  return normalized;
}

export function taskBasename(taskPath) {
  return pathPosix.basename(normalizeRelPath(taskPath)).replace(/\.md$/i, "");
}

export function handoffPathsForTaskPath(taskPath, {
  handoffDir = artifactPaths().handoffDir,
  legacySibling = false,
} = {}) {
  const normalized = normalizeRelPath(taskPath);
  const base = taskBasename(normalized);
  if (legacySibling) {
    const siblingBase = normalized.replace(/\.md$/i, "");
    return {
      handoffPath: `${siblingBase}.handoff.md`,
      sessionPath: `${siblingBase}.session.md`,
    };
  }
  const dir = normalizeRelPath(handoffDir) || artifactPaths().handoffDir;
  return {
    handoffPath: `${dir}/${base}.handoff.md`,
    sessionPath: `${dir}/${base}.session.md`,
  };
}
