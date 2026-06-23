import { execFileSync } from "node:child_process";

function runGit(args, { cwd, execFile = execFileSync } = {}) {
  try {
    return String(execFile("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim();
  } catch {
    return "";
  }
}

export function readGitState({ cwd = process.cwd(), execFile = execFileSync } = {}) {
  const branch = runGit(["branch", "--show-current"], { cwd, execFile }) || "unknown";
  const status = runGit(["status", "--short"], { cwd, execFile });
  const log = runGit(["log", "--oneline", "-n", "10"], { cwd, execFile });
  const statusLines = status ? status.split(/\r?\n/).filter(Boolean) : [];
  const logLines = log ? log.split(/\r?\n/).filter(Boolean) : [];
  const summary = `${branch}; ${statusLines.length === 0 ? "clean" : `${statusLines.length} changed file(s)`}`;
  return { branch, statusLines, logLines, summary };
}

// Extract working-tree paths from `git status --short` lines. The first 3 chars
// are the XY status + space; rename rows ("R  old -> new") resolve to the NEW path.
export function parseDirtyPaths(statusLines) {
  return (statusLines ?? [])
    .map((line) => String(line).slice(3).split(" -> ").pop().trim())
    .filter(Boolean);
}
