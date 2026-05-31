import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIRECT_NAMES = new Set(["app", "backend", "frontend", "server", "client", "src", "docs"]);
const WORKSPACE_CONTAINER_NAMES = new Set(["apps", "packages"]);
const SKIP_NAMES = new Set([".git", ".claude", ".codex", "node_modules", "dist", "build", "coverage"]);
const MARKERS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Dockerfile"];

function hasMarker(dir) {
  return MARKERS.some((name) => existsSync(join(dir, name)));
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function pushGuide(out, path, reason) {
  out.push({ path, reason });
}

export function detectGuideDirs(projectDir) {
  const out = [];
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_NAMES.has(entry.name)) continue;

    const full = join(projectDir, entry.name);
    const marked = hasMarker(full);
    if (DIRECT_NAMES.has(entry.name) || marked) {
      pushGuide(out, entry.name, DIRECT_NAMES.has(entry.name) ? "known-folder" : "manifest");
    }

    if (WORKSPACE_CONTAINER_NAMES.has(entry.name)) {
      for (const child of readdirSync(full, { withFileTypes: true })) {
        if (!child.isDirectory() || SKIP_NAMES.has(child.name)) continue;

        const childFull = join(full, child.name);
        if (isDir(childFull) && hasMarker(childFull)) {
          pushGuide(out, `${entry.name}/${child.name}`, "workspace-package");
        }
      }
    }
  }

  return [...new Map(out.map((x) => [x.path, x])).values()].sort((a, b) => a.path.localeCompare(b.path));
}
