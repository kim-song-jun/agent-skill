// Tree walker — enumerates directory + file paths under a root with
// ignore-pattern support. Used by Phase 1 to compute the top-level
// work list, and by Phase 3 indirectly (via the subagent replies).
//
// Contract:
//   topLevelDirs(root, ignorePatterns) → string[]
//     Immediate subdirectories of `root`, excluding any name matching
//     `ignorePatterns`. Returns repo-relative names (e.g., "src",
//     "tests") sorted alphabetically. Symlinks to directories are
//     followed but the symlink name itself is what's returned (the
//     subagent decides whether to recurse into the target).
//
//   walk(dir, ignorePatterns, options) → Iterator<string>
//     Lazy generator yielding absolute file paths under `dir`,
//     respecting ignorePatterns and `options.maxDepth` (default 10).
//     Symlink cycles are guarded via a visited-set of real paths.
//
//   applyIgnore(paths, patterns) → string[]
//     Filter helper. Patterns are gitignore-like (basename match for
//     plain names; trailing `/` for dir-only; `*` glob for wildcard).
//
//   loadGitignore(root) → string[]
//     Read `.gitignore` and `.explore-ignore` at root; return the
//     union of non-comment, non-empty patterns. Patterns are
//     simplified — only basename + glob patterns are honoured in v1.
//     (Anchored paths like `/foo/bar` are reduced to basename match.)

import { readdirSync, statSync, readFileSync, existsSync, lstatSync, realpathSync } from "node:fs";
import { resolve, join, basename, sep } from "node:path";

// ---------- pattern matching ----------

// Convert a gitignore-style pattern to a RegExp matching a single
// path basename. Supported in v1:
//   - exact basename ("node_modules")
//   - trailing slash → dir-only (handled by caller)
//   - * → matches any chars except `/`
//   - ? → matches a single char except `/`
//   - leading `!` → negation (handled by caller; here we strip it)
// Anchored patterns (leading `/`) and ** are NOT supported in v1;
// they collapse to plain basename match.
function patternToRegex(rawPat) {
  let pat = rawPat;
  if (pat.startsWith("!")) pat = pat.slice(1);
  // Strip leading slash — we match basenames in v1.
  if (pat.startsWith("/")) pat = pat.slice(1);
  // Strip trailing slash — dir-only handling is the caller's job.
  let dirOnly = false;
  if (pat.endsWith("/")) { dirOnly = true; pat = pat.slice(0, -1); }
  // If pattern contains a slash, reduce to the final segment.
  // (v1 simplification — see references/design-notes.md.)
  if (pat.includes("/")) pat = pat.split("/").pop();
  if (!pat) return { re: null, dirOnly };
  // Escape regex metachars except * and ?
  let re = "";
  for (const ch of pat) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += "\\" + ch;
    else re += ch;
  }
  return { re: new RegExp(`^${re}$`), dirOnly };
}

function matchesAny(name, isDir, patterns) {
  for (const raw of patterns) {
    if (!raw || raw.startsWith("#")) continue;
    const negated = raw.startsWith("!");
    const { re, dirOnly } = patternToRegex(raw);
    if (!re) continue;
    if (dirOnly && !isDir) continue;
    if (re.test(name)) {
      // Negation in v1: we DON'T support re-including; first match wins.
      // (Documented limitation in references/design-notes.md.)
      if (negated) return false;
      return true;
    }
  }
  return false;
}

export function applyIgnore(paths, patterns) {
  return paths.filter((p) => !matchesAny(basename(p), false, patterns));
}

// ---------- gitignore loader ----------

function readPatternFile(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function loadGitignore(root) {
  const a = readPatternFile(resolve(root, ".gitignore"));
  const b = readPatternFile(resolve(root, ".explore-ignore"));
  return [...a, ...b];
}

// ---------- top-level dirs ----------

export function topLevelDirs(root, ignorePatterns = []) {
  if (!existsSync(root)) return [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = [];
  for (const e of entries) {
    // Follow symlinks to test whether the target is a dir.
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = statSync(resolve(root, e.name)).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (!isDir) continue;
    if (matchesAny(e.name, true, ignorePatterns)) continue;
    dirs.push(e.name);
  }
  dirs.sort();
  return dirs;
}

// ---------- recursive walker ----------

export function* walk(dir, ignorePatterns = [], options = {}) {
  const maxDepth = options.maxDepth ?? 10;
  const visited = new Set();

  function* recurse(d, depth) {
    if (depth > maxDepth) return;
    let real;
    try {
      real = realpathSync(d);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);

    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name;
      let isDir = e.isDirectory();
      let isSymlink = e.isSymbolicLink();
      if (isSymlink) {
        try {
          const s = statSync(resolve(d, name));
          isDir = s.isDirectory();
        } catch {
          continue;
        }
      }
      if (matchesAny(name, isDir, ignorePatterns)) continue;
      const full = join(d, name);
      if (isDir) {
        yield* recurse(full, depth + 1);
      } else if (e.isFile() || (isSymlink && !isDir)) {
        yield full;
      }
    }
  }

  yield* recurse(dir, 0);
}
