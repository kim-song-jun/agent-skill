const BLOCK_RULES = [
  { name: "git add -A", pattern: /\bgit\s+add\s+(-A|--all)\b/ },
  { name: "git commit -a", pattern: /\bgit\s+commit\b(?=[^\n]*(?:\s-a[m\s]|\s--all\b))/ },
  { name: "git commit --amend", pattern: /\bgit\s+commit\b(?=[^\n]*--amend\b)/ },
  { name: "git push --force", pattern: /\bgit\s+push\b(?=[^\n]*--force(?:-with-lease)?\b)/ },
  { name: "git reset --hard", pattern: /\bgit\s+reset\s+--hard\b/ },
  { name: "git checkout --", pattern: /\bgit\s+checkout\s+--\s+/ },
  { name: "docker volume rm", pattern: /\bdocker\s+volume\s+rm\b/ },
];

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

    if (/\s/.test(char)) {
      pushToken();
      continue;
    }

    if (char === ";") {
      pushOperator(char);
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
  return token === "&&" || token === "||" || token === ";" || token === "|" || token === "&";
}

function tokenListHasGitCommit(tokens) {
  return tokens.some((token, index) => token === "git" && tokens[index + 1] === "commit");
}

function commitHasPathspec(command) {
  const tokens = shellTokens(command);
  let sawCommit = false;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] !== "git" || tokens[index + 1] !== "commit") continue;
    sawCommit = true;

    let hasPathspec = false;
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      if (isCommandBoundary(tokens[cursor])) break;
      if (tokens[cursor] === "--" && tokens[cursor + 1] && !isCommandBoundary(tokens[cursor + 1])) {
        hasPathspec = true;
        break;
      }
    }

    if (!hasPathspec) return false;
  }

  return sawCommit;
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
  const { destructiveCommands = [], destructiveConfirmFlags = [] } = options || {};
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

  for (const rule of BLOCK_RULES) {
    if (rule.pattern.test(text)) {
      return { blocked: true, reason: rule.name };
    }
  }
  if (tokenListHasGitCommit(tokens) && !commitHasPathspec(text)) {
    return { blocked: true, reason: "git commit requires explicit pathspec after --" };
  }
  return { blocked: false, reason: null };
}
