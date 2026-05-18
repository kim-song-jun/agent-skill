// tmp-gc.mjs — cleanup of /tmp/agent-all/ (and /tmp/visual-qa/) at session
// end. Backstop for any subprocess that didn't tidy up its own tmp file.
//
// Used as both:
//   - in-process call at end of a phase (Phase 5 / Phase 6 loop boundary)
//   - CLI entrypoint registered as a Gemini `Stop` hook:
//       node .gemini/agent-all/lib/tmp-gc.mjs --root /tmp/agent-all --older-than 3600000
//
// CRITICAL safety constraints:
//   - Only operates on paths under a configured root (default
//     `/tmp/agent-all` or `/tmp/visual-qa`). Refuses to touch `/`, `/tmp`,
//     `~`, anything that escapes the root.
//   - Honours an --older-than threshold (ms) so concurrent runs aren't
//     destroyed.
//   - Dry-run mode logs what would be removed.

import { existsSync, statSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { resolve, sep } from "node:path";

const SAFE_ROOTS = new Set([
  "/tmp/agent-all",
  "/tmp/visual-qa",
]);

function isSafeRoot(rootPath) {
  // Resolve absolute path; reject `/`, anything containing `..` after
  // resolve, anything not under one of the known SAFE_ROOTS (or a deeper
  // path beneath one).
  const abs = resolve(rootPath);
  if (abs === "/" || abs === "") return false;
  for (const safe of SAFE_ROOTS) {
    if (abs === safe || abs.startsWith(safe + sep)) return true;
  }
  return false;
}

export function ensureTmpDir(path) {
  if (!isSafeRoot(path)) {
    throw new Error(`refusing to mkdir outside safe roots: ${path}`);
  }
  mkdirSync(path, { recursive: true });
  return path;
}

// Recursively remove subdirectories/files older than `olderThanMs`.
// Returns { removed: string[], kept: string[], errors: {path, message}[] }.
export function gcTmp(root, olderThanMs = 60 * 60 * 1000, opts = {}) {
  const dryRun = opts.dryRun === true;
  const result = { removed: [], kept: [], errors: [] };
  if (!isSafeRoot(root)) {
    result.errors.push({ path: root, message: "refusing: outside safe roots" });
    return result;
  }
  if (!existsSync(root)) return result;
  let entries;
  try { entries = readdirSync(root); } catch (e) {
    result.errors.push({ path: root, message: e.message });
    return result;
  }
  const cutoff = Date.now() - olderThanMs;
  for (const name of entries) {
    const full = resolve(root, name);
    if (!full.startsWith(resolve(root) + sep) && full !== resolve(root)) {
      result.errors.push({ path: full, message: "refusing: escapes root" });
      continue;
    }
    let st;
    try { st = statSync(full); } catch (e) {
      result.errors.push({ path: full, message: e.message });
      continue;
    }
    if (st.mtimeMs >= cutoff) {
      result.kept.push(full);
      continue;
    }
    if (dryRun) {
      result.removed.push(full);
      continue;
    }
    try {
      rmSync(full, { recursive: true, force: true });
      result.removed.push(full);
    } catch (e) {
      result.errors.push({ path: full, message: e.message });
    }
  }
  return result;
}

// CLI entrypoint.
function parseArgs(argv) {
  const args = { root: null, olderThanMs: 60 * 60 * 1000, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--older-than") args.olderThanMs = parseInt(argv[++i], 10);
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function mainCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root) {
    process.stderr.write("Usage: tmp-gc.mjs --root <path> [--older-than <ms>] [--dry-run]\n");
    process.exit(2);
  }
  const out = gcTmp(args.root, args.olderThanMs, { dryRun: args.dryRun });
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(out.errors.length === 0 ? 0 : 1);
}

// Run when invoked directly. ESM-friendly check.
import { fileURLToPath } from "node:url";
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  mainCli();
}

export const __internal = { isSafeRoot, SAFE_ROOTS, parseArgs };
