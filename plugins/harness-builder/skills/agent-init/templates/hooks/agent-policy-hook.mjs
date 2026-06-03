#!/usr/bin/env node
// PreToolUse hook for Bash. Blocks high-risk shell commands and enforces
// pathspec commits from inside a generated project .claude/hooks/ directory.
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

const IMPLEMENTER_DIRECTIVE = `\n\n---\nDecision-Surfacing Protocol\nBefore implementation, identify unresolved product/API/data/UX decisions. If decisions are needed, report them before editing. Before reporting STATUS: DONE, run verification and include a literal verification_passed line.\n`;

const REVIEWER_DIRECTIVE = `\n\n---\nAt the END of your review, output one literal line:\n\`VERIFICATION_AUDIT: passed\` if verification evidence is present and acceptable,\n\`VERIFICATION_AUDIT: failed\` if verification evidence is missing or failed,\n\`VERIFICATION_AUDIT: skipped\` only if verification is not applicable.\n`;

const QA_DIRECTIVE = `\n\n---\nYou are the QA team. Audit the user-side flow, not tech-stack correctness.\n\nAt the END of your review, output one literal line:\n\`QA_AUDIT: passed\` if the user-facing flow holds up,\n\`QA_AUDIT: failed\` if it does not,\n\`QA_AUDIT: skipped\` only if no user-visible change exists.\n`;

const COORDINATOR_DIRECTIVE = `\n\n---\nYou are the orchestration gate. Inspect shared files, HOT-file ownership, retry sequencing, and pathspec commit risk before reviewer dispatch.\n\nAt the END of your review, output one literal line:\n\`ORCHESTRATION_AUDIT: passed\` if ownership and sequencing are safe,\n\`ORCHESTRATION_AUDIT: failed\` if there is a blocking coordination risk,\n\`ORCHESTRATION_AUDIT: skipped\` only if orchestration review is not applicable.\n`;

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
      // Backslash-newline is a line continuation: drop both characters so the
      // lines join, instead of emitting a literal newline token. A literal
      // "\n" token is treated as a command boundary, which would split a
      // multi-line `git commit ... -- <pathspec>` and wrongly block it.
      if (command[index + 1] === "\n") { index += 1; continue; }
      if (command[index + 1] === "\r" && command[index + 2] === "\n") { index += 2; continue; }
      if (command[index + 1] === "\r") { index += 1; continue; }
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
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const options = { destructiveCommands: [], destructiveConfirmFlags: [] };

  for (const fileName of [".agent-all.json", ".agent-policy.json"]) {
    const fileOptions = loadPolicyOptionsFromFile(projectDir, fileName);
    options.destructiveCommands.push(...fileOptions.destructiveCommands);
    options.destructiveConfirmFlags.push(...fileOptions.destructiveConfirmFlags);
  }

  return options;
}

function taskParams(payload) {
  if (payload?.parameters && typeof payload.parameters === "object") return payload.parameters;
  if (payload?.tool_input && typeof payload.tool_input === "object") return payload.tool_input;
  if (payload?.toolInput && typeof payload.toolInput === "object") return payload.toolInput;
  return {};
}

function setTaskParams(payload, params) {
  if (payload?.parameters && typeof payload.parameters === "object") payload.parameters = params;
  else if (payload?.tool_input && typeof payload.tool_input === "object") payload.tool_input = params;
  else if (payload?.toolInput && typeof payload.toolInput === "object") payload.toolInput = params;
  else payload.parameters = params;
  return payload;
}

function toolName(payload) {
  return payload?.tool ?? payload?.tool_name ?? payload?.toolName;
}

function isTaskPayload(payload) {
  return toolName(payload) === "Task";
}

function isImplementerDispatch(params) {
  return typeof params?.description === "string" && /^implement task\b/i.test(params.description);
}

function isQaReviewerDispatch(params) {
  return typeof params?.description === "string" && /^qa review task\b/i.test(params.description);
}

function isCoordinatorDispatch(params) {
  return typeof params?.description === "string" && /^orchestration gate task\b/i.test(params.description);
}

function isReviewerDispatch(params) {
  if (typeof params?.description !== "string") return false;
  if (isQaReviewerDispatch(params)) return false;
  return /^(?:review task|.+\sreview task)\b/i.test(params.description);
}

function taskResultText(payload) {
  const value = payload?.result ?? payload?.tool_response ?? payload?.toolResponse ?? payload?.response ?? "";
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? "");
}

function validateAuditToken(text, token) {
  const re = new RegExp(`${token}:\\s*(passed|failed|skipped)\\b`);
  return re.test(String(text ?? ""));
}

function validateVerificationReport(text) {
  const body = String(text ?? "");
  if (!/STATUS:\s*DONE\b/i.test(body)) return true;
  return /verification_passed\b/i.test(body);
}

function handleTaskHook(event, payload) {
  const params = taskParams(payload);
  const isImpl = isImplementerDispatch(params);
  const isQa = isQaReviewerDispatch(params);
  const isCoord = isCoordinatorDispatch(params);
  const isRev = isReviewerDispatch(params);
  if (!isImpl && !isQa && !isCoord && !isRev) return false;

  if (event === "PreToolUse") {
    if (isImpl) params.prompt = `${params.prompt || ""}${IMPLEMENTER_DIRECTIVE}`;
    else if (isCoord) params.prompt = `${params.prompt || ""}${COORDINATOR_DIRECTIVE}`;
    else if (isQa) params.prompt = `${params.prompt || ""}${QA_DIRECTIVE}`;
    else if (isRev) params.prompt = `${params.prompt || ""}${REVIEWER_DIRECTIVE}`;
    process.stdout.write(JSON.stringify(setTaskParams(payload, params)));
    process.exit(0);
  }

  if (event === "PostToolUse") {
    const text = taskResultText(payload);
    if (isImpl && !validateVerificationReport(text)) {
      console.error("Implementer must include verification_passed before reporting STATUS: DONE.");
      process.exit(2);
    }
    if (isCoord && !validateAuditToken(text, "ORCHESTRATION_AUDIT")) {
      console.error("Coordinator must include ORCHESTRATION_AUDIT: passed|failed|skipped.");
      process.exit(2);
    }
    if (isQa && !validateAuditToken(text, "QA_AUDIT")) {
      console.error("QA reviewer must include QA_AUDIT: passed|failed|skipped.");
      process.exit(2);
    }
    if (isRev && !validateAuditToken(text, "VERIFICATION_AUDIT")) {
      console.error("Reviewer must include VERIFICATION_AUDIT: passed|failed|skipped.");
      process.exit(2);
    }
    process.exit(0);
  }

  return false;
}

let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch {}

let payload = {};
try {
  payload = input.trim() ? JSON.parse(input) : {};
} catch {}

const event = process.argv[2] || payload?.hook_event_name || payload?.hookEventName || "";
if (isTaskPayload(payload) && handleTaskHook(event, payload)) {
  process.exit(0);
}

const command = (payload?.tool_input?.command ?? payload?.command ?? "").toString();
const result = analyzeShellCommand(command, loadPolicyOptions());

if (result.blocked) {
  console.error(`agent policy blocked command: ${result.reason}`);
  process.exit(2);
}

process.exit(0);
