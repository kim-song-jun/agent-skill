#!/usr/bin/env node
// Codex PreToolUse policy hook for generated projects.
// Blocks high-risk shell commands and requires pathspec commits.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GIT_GLOBAL_OPTIONS_WITH_VALUES = new Set([
  "-C",
  "-c",
  "--config-env",
  "--exec-path",
  "--git-dir",
  "--namespace",
  "--work-tree",
]);

const GIT_GLOBAL_OPTIONS_WITH_INLINE_VALUES = ["-C", "--git-dir=", "--work-tree="];

const GIT_GLOBAL_OPTIONS_WITHOUT_VALUES = new Set([
  "--bare",
  "--help",
  "--html-path",
  "--info-path",
  "--literal-pathspecs",
  "--man-path",
  "--no-literal-pathspecs",
  "--no-optional-locks",
  "--no-pager",
  "--no-replace-objects",
  "--paginate",
  "--version",
]);

const COMMIT_LONG_OPTIONS_WITH_VALUES = new Set([
  "--author",
  "--cleanup",
  "--date",
  "--file",
  "--fixup",
  "--message",
  "--pathspec-from-file",
  "--reedit-message",
  "--reuse-message",
  "--squash",
  "--template",
  "--trailer",
  "--untracked-files",
]);

const COMMIT_SHORT_OPTIONS_WITH_VALUES = new Set(["C", "F", "c", "m", "t"]);

function shellTokens(command) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  let hasToken = false;

  const pushToken = () => {
    if (!hasToken) return;
    tokens.push(token);
    token = "";
    hasToken = false;
  };

  const pushOperator = (operator) => {
    pushToken();
    tokens.push(operator);
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaped) {
      token += char;
      hasToken = true;
      escaped = false;
      continue;
    }

    if (quote) {
      if (quote === '"' && char === "\\") {
        escaped = true;
        hasToken = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        hasToken = true;
        continue;
      }
      token += char;
      hasToken = true;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      hasToken = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === ";") {
      pushOperator(char);
      continue;
    }

    if (char === "\n" || char === "\r") {
      pushOperator("\n");
      if (char === "\r" && command[index + 1] === "\n") index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      pushToken();
      continue;
    }

    if ((char === "&" || char === "|") && command[index + 1] === char) {
      pushOperator(`${char}${char}`);
      index += 1;
      continue;
    }

    if (char === "|" || char === "&") {
      pushOperator(char);
      continue;
    }

    token += char;
    hasToken = true;
  }

  if (escaped) token += "\\";
  pushToken();
  return tokens;
}

function isCommandBoundary(token) {
  return token === "&&" || token === "||" || token === ";" || token === "\n" || token === "|" || token === "&";
}

function isAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function commandSegments(tokens) {
  const segments = [];
  let start = 0;
  for (let index = 0; index <= tokens.length; index += 1) {
    if (index < tokens.length && !isCommandBoundary(tokens[index])) continue;
    if (start < index) segments.push({ start, end: index });
    start = index + 1;
  }
  return segments;
}

function commandStart(tokens, segment) {
  let cursor = segment.start;
  while (cursor < segment.end && isAssignment(tokens[cursor])) cursor += 1;
  return cursor < segment.end ? cursor : null;
}

function isGitGlobalOptionWithInlineValue(token) {
  return GIT_GLOBAL_OPTIONS_WITH_INLINE_VALUES.some((option) => token.startsWith(option) && token !== option);
}

function parseGitInvocation(tokens, gitIndex, end) {
  let cursor = gitIndex + 1;
  while (cursor < end) {
    const token = tokens[cursor];
    if (GIT_GLOBAL_OPTIONS_WITH_VALUES.has(token)) {
      cursor += 2;
      continue;
    }
    if (isGitGlobalOptionWithInlineValue(token) || GIT_GLOBAL_OPTIONS_WITHOUT_VALUES.has(token)) {
      cursor += 1;
      continue;
    }
    if (token.startsWith("--") && token.includes("=")) {
      cursor += 1;
      continue;
    }
    if (token.startsWith("-")) {
      cursor += 1;
      continue;
    }
    return { subcommand: token, argsStart: cursor + 1, end };
  }
  return null;
}

function hasTokenBeforePathspec(tokens, start, end, predicate) {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (tokens[cursor] === "--") break;
    if (predicate(tokens[cursor])) return true;
  }
  return false;
}

function inspectShortCommitOptionToken(token) {
  if (!token.startsWith("-") || token.startsWith("--")) return { all: false, skipNext: false };

  for (let cursor = 1; cursor < token.length; cursor += 1) {
    const option = token[cursor];
    if (option === "a") return { all: true, skipNext: false };
    if (option === "S" && cursor < token.length - 1) return { all: false, skipNext: false };
    if (COMMIT_SHORT_OPTIONS_WITH_VALUES.has(option)) {
      return { all: false, skipNext: cursor === token.length - 1 };
    }
  }

  return { all: false, skipNext: false };
}

function inspectCommitArgs(tokens, start, end) {
  const result = { all: false, amend: false, hasPathspec: false };

  for (let cursor = start; cursor < end; cursor += 1) {
    const token = tokens[cursor];
    if (token === "--") {
      result.hasPathspec = cursor + 1 < end;
      break;
    }
    if (token === "--all") {
      result.all = true;
      continue;
    }
    if (token === "--amend") {
      result.amend = true;
      continue;
    }
    if (COMMIT_LONG_OPTIONS_WITH_VALUES.has(token)) {
      cursor += 1;
      continue;
    }
    if ([...COMMIT_LONG_OPTIONS_WITH_VALUES].some((option) => token.startsWith(`${option}=`))) {
      continue;
    }

    const shortOptions = inspectShortCommitOptionToken(token);
    if (shortOptions.all) result.all = true;
    if (shortOptions.skipNext) cursor += 1;
  }

  return result;
}

function analyzeGitInvocation(tokens, invocation) {
  switch (invocation.subcommand) {
    case "add":
      if (hasTokenBeforePathspec(tokens, invocation.argsStart, invocation.end, (token) => token === "-A" || token === "--all")) {
        return { blocked: true, reason: "git add -A" };
      }
      break;
    case "commit": {
      const args = inspectCommitArgs(tokens, invocation.argsStart, invocation.end);
      if (args.all) return { blocked: true, reason: "git commit -a" };
      if (args.amend) return { blocked: true, reason: "git commit --amend" };
      if (!args.hasPathspec) return { blocked: true, reason: "git commit requires explicit pathspec after --" };
      break;
    }
    case "push":
      if (
        hasTokenBeforePathspec(
          tokens,
          invocation.argsStart,
          invocation.end,
          (token) => token === "--force" || token === "--force-with-lease" || token.startsWith("--force-with-lease="),
        )
      ) {
        return { blocked: true, reason: "git push --force" };
      }
      break;
    case "reset":
      if (hasTokenBeforePathspec(tokens, invocation.argsStart, invocation.end, (token) => token === "--hard")) {
        return { blocked: true, reason: "git reset --hard" };
      }
      break;
    case "checkout":
      for (let cursor = invocation.argsStart; cursor < invocation.end - 1; cursor += 1) {
        if (tokens[cursor] === "--") return { blocked: true, reason: "git checkout --" };
      }
      break;
    default:
      break;
  }

  return null;
}

function matchesConfiguredCommand(text, pattern) {
  return typeof pattern === "string" && pattern.length > 0 && text.includes(pattern);
}

function commandHasConfirmFlag(tokens, flag) {
  const text = typeof flag === "string" ? flag : "";
  if (!text) return false;
  return tokens.some((token) => token === text || token.startsWith(`${text}=`));
}

function analyzeShellCommand(command, options = {}) {
  const text = String(command || "");
  const tokens = shellTokens(text);
  const { destructiveCommands = [], destructiveConfirmFlags = [] } = options || {};

  for (const pattern of destructiveCommands) {
    if (matchesConfiguredCommand(text, pattern)) {
      return { blocked: true, reason: `destructive command pattern: ${pattern}` };
    }
  }

  for (const flag of destructiveConfirmFlags) {
    if (commandHasConfirmFlag(tokens, flag)) {
      return { blocked: true, reason: `destructive confirmation flag: ${flag}` };
    }
  }

  for (const segment of commandSegments(tokens)) {
    const start = commandStart(tokens, segment);
    if (start === null) continue;

    if (tokens[start] === "git") {
      const result = parseGitInvocation(tokens, start, segment.end);
      if (!result) continue;
      const gitResult = analyzeGitInvocation(tokens, result);
      if (gitResult) return gitResult;
      continue;
    }

    if (tokens[start] === "docker" && tokens[start + 1] === "volume" && tokens[start + 2] === "rm") {
      return { blocked: true, reason: "docker volume rm" };
    }
  }

  return { blocked: false, reason: null };
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.length > 0) : [];
}

function loadPolicyOptionsFromFile(projectDir, fileName) {
  let parsed = {};
  try {
    parsed = JSON.parse(readFileSync(join(projectDir, fileName), "utf-8"));
  } catch {
    return { destructiveCommands: [], destructiveConfirmFlags: [] };
  }

  const policy = parsed?.policy && typeof parsed.policy === "object" ? parsed.policy : {};
  return {
    destructiveCommands: [
      ...stringArray(policy.destructiveCommands),
      ...stringArray(parsed?.destructiveCommands),
    ],
    destructiveConfirmFlags: [
      ...stringArray(policy.destructiveConfirmFlags),
      ...stringArray(parsed?.destructiveConfirmFlags),
    ],
  };
}

function loadPolicyOptions() {
  const projectDir = process.env.CODEX_PROJECT_DIR || process.env.PWD || process.cwd();
  const options = { destructiveCommands: [], destructiveConfirmFlags: [] };

  for (const fileName of [".agent-all.json", ".agent-policy.json"]) {
    const fileOptions = loadPolicyOptionsFromFile(projectDir, fileName);
    options.destructiveCommands.push(...fileOptions.destructiveCommands);
    options.destructiveConfirmFlags.push(...fileOptions.destructiveConfirmFlags);
  }

  return options;
}

let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch {}

let payload = {};
try {
  payload = input.trim() ? JSON.parse(input) : {};
} catch {}

const command = (
  payload?.tool_input?.command
  ?? payload?.toolInput?.command
  ?? payload?.input?.command
  ?? payload?.command
  ?? ""
).toString();
const result = analyzeShellCommand(command, loadPolicyOptions());

if (result.blocked) {
  console.error(`codex policy blocked command: ${result.reason}`);
  process.exit(2);
}

process.exit(0);
