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

function hitsProtected(tokens, start, end, protectedPaths) {
  const set = new Set(protectedPaths);
  for (let c = start; c < end; c += 1) {
    if (tokens[c] === "--") continue;
    if (set.has(tokens[c])) return tokens[c];
  }
  return null;
}

function analyzeGitInvocation(tokens, invocation, protectedPaths) {
  switch (invocation.subcommand) {
    case "add":
      if (hasTokenBeforePathspec(tokens, invocation.argsStart, invocation.end, (token) => token === "-A" || token === "--all")) {
        return { blocked: true, reason: "git add -A" };
      }
      if (protectedPaths.length > 0) {
        const hit = hitsProtected(tokens, invocation.argsStart, invocation.end, protectedPaths);
        if (hit) return { blocked: true, reason: `protected path: ${hit}` };
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
      if (protectedPaths.length > 0) {
        const hit = hitsProtected(tokens, invocation.argsStart, invocation.end, protectedPaths);
        if (hit) return { blocked: true, reason: `protected path: ${hit}` };
      }
      break;
    default:
      break;
  }

  return null;
}

function analyzeBuiltInCommand(tokens, protectedPaths) {
  for (const segment of commandSegments(tokens)) {
    const start = commandStart(tokens, segment);
    if (start === null) continue;

    if (tokens[start] === "git") {
      const result = parseGitInvocation(tokens, start, segment.end);
      if (!result) continue;
      const gitResult = analyzeGitInvocation(tokens, result, protectedPaths);
      if (gitResult) return gitResult;
      continue;
    }

    if (tokens[start] === "docker" && tokens[start + 1] === "volume" && tokens[start + 2] === "rm") {
      return { blocked: true, reason: "docker volume rm" };
    }
  }

  return null;
}

function matchesConfiguredCommand(text, pattern) {
  if (typeof pattern === "string") return pattern.length > 0 && text.includes(pattern);
  if (!(pattern instanceof RegExp)) return false;
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function commandHasConfirmFlag(tokens, flag) {
  const text = String(flag);
  if (!text) return false;
  return tokens.some((token) => token === text || token.startsWith(`${text}=`));
}

export function analyzeShellCommand(command, options = {}) {
  const text = String(command || "");
  const { destructiveCommands = [], destructiveConfirmFlags = [], protectedPaths = [] } = options || {};
  const tokens = shellTokens(text);

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

  const builtInResult = analyzeBuiltInCommand(tokens, protectedPaths);
  if (builtInResult) return builtInResult;

  return { blocked: false, reason: null };
}
