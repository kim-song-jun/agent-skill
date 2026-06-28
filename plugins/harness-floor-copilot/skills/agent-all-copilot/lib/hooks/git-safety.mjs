// git-safety.mjs — pure shared-worktree git-safety analysis for the Copilot CLI
// preToolUse hook. Mirrors the Claude/Codex `agent-policy-hook` git rules. Those
// hooks are self-contained rendered templates that cannot import a lib, so this
// is a tested module copy of the same rules (a future slice could unify them if
// the Claude/Codex hooks gain an install-anchored vendored-lib pattern).
//
// `analyzeGitCommand(command)` takes the raw shell command string a Copilot
// `bash`/`powershell` tool call would run and returns { blocked, reason }.

const SEGMENT_SEP = /\s*(?:&&|\|\||;|\||\n)\s*/;

function tokenize(segment) {
  const tokens = [];
  let cur = "";
  let quote = null;
  let has = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      has = true;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) { tokens.push(cur); cur = ""; has = false; }
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) tokens.push(cur);
  return tokens;
}

function hasFlagBeforePathspec(tokens, start, predicate) {
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i] === "--") return false;
    if (predicate(tokens[i])) return true;
  }
  return false;
}

function analyzeGitTokens(tokens) {
  let sub = null;
  let subIdx = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (!tokens[i].startsWith("-")) { sub = tokens[i]; subIdx = i; break; }
  }
  if (!sub) return null;
  const argsStart = subIdx + 1;

  switch (sub) {
    case "stash": {
      const s = tokens[argsStart];
      if (s !== "list" && s !== "show") {
        return { blocked: true, reason: "git stash (rule 6 — hides the shared worktree's uncommitted work; commit your files with an explicit pathspec instead)" };
      }
      return null;
    }
    case "switch":
      return { blocked: true, reason: "git switch (rule 7 — no branch switch/creation; work on main)" };
    case "checkout":
      if (hasFlagBeforePathspec(tokens, argsStart, (t) => t === "-b" || t === "-B")) {
        return { blocked: true, reason: "git checkout -b (rule 7 — no branch creation; work on main)" };
      }
      for (let i = argsStart; i < tokens.length - 1; i++) {
        if (tokens[i] === "--") return { blocked: true, reason: "git checkout -- (reverts tracked files; not on a shared worktree)" };
      }
      return null;
    case "clean": {
      let dryRun = false;
      for (let i = argsStart; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "--") break;
        if (t === "-n" || t === "--dry-run") { dryRun = true; break; }
        if (t.length > 1 && t[0] === "-" && t[1] !== "-" && t.includes("n")) { dryRun = true; break; }
      }
      if (!dryRun) return { blocked: true, reason: "git clean (rule 8 — destroys untracked worktree files, incl. other sessions'; use 'git clean -n' to preview)" };
      return null;
    }
    case "reset":
      if (hasFlagBeforePathspec(tokens, argsStart, (t) => t === "--hard")) {
        return { blocked: true, reason: "git reset --hard (rule 8 — discards uncommitted work across the worktree)" };
      }
      return null;
    case "add":
      if (hasFlagBeforePathspec(tokens, argsStart, (t) => t === "-A" || t === "--all")) {
        return { blocked: true, reason: "git add -A (rule 8/9 — stages the whole index incl. other sessions' changes; stage explicit pathspecs)" };
      }
      return null;
    case "commit": {
      let all = false;
      let amend = false;
      let hasPathspec = false;
      for (let i = argsStart; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "--") { hasPathspec = i + 1 < tokens.length; break; }
        if (t === "--all") all = true;
        else if (t === "--amend") amend = true;
        else if (t.length > 1 && t[0] === "-" && t[1] !== "-" && t.includes("a")) all = true;
      }
      if (all) return { blocked: true, reason: "git commit -a (rule 9 — captures the whole index; commit explicit pathspecs after --)" };
      if (amend) return { blocked: true, reason: "git commit --amend (rule 9 — rewrites shared history)" };
      if (!hasPathspec) return { blocked: true, reason: "git commit requires an explicit pathspec after -- (rule 9 — no index-wide commits on a shared worktree)" };
      return null;
    }
    case "push":
      if (hasFlagBeforePathspec(tokens, argsStart, (t) => t === "--force" || t === "--force-with-lease" || t.startsWith("--force-with-lease="))) {
        return { blocked: true, reason: "git push --force (rule 8 — force-push clobbers shared refs)" };
      }
      return null;
    default:
      return null;
  }
}

export function analyzeGitCommand(command) {
  const text = String(command ?? "");
  if (!text.trim()) return { blocked: false, reason: null };
  for (const segment of text.split(SEGMENT_SEP)) {
    const tokens = tokenize(segment);
    if (tokens[0] === "git") {
      const result = analyzeGitTokens(tokens);
      if (result) return result;
    }
  }
  return { blocked: false, reason: null };
}
