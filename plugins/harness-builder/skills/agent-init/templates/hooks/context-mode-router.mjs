#!/usr/bin/env node
// PreToolUse hook for Bash. Emits a context-mode routing hint when the command
// is likely to produce >20 lines. Pure stdout — does not block the tool call.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_NAME = "context-mode-router";

function formatHookError(error) {
  const raw = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error || "unknown error");
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();
  return (firstLine || "unknown error").slice(0, 200);
}

function warnHook(action, error) {
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${formatHookError(error)}`);
}

export function nextRoutingState(prevState, { cmd, now }) {
  const state = prevState && typeof prevState === "object" ? prevState : {};
  const largeCommandCount = Number(state.largeCommandCount || 0) + 1;
  const lastReminderAt = Number(state.lastThriftReminderAt || 0);
  const shouldRecommend = largeCommandCount >= 3 && now - lastReminderAt > 60 * 60 * 1000;
  const nextState = {
    ...state,
    largeCommandCount,
    updatedAt: new Date(now).toISOString(),
    lastCommand: String(cmd ?? "").slice(0, 240),
    ...(shouldRecommend ? { lastThriftReminderAt: now } : {}),
  };
  return { state: nextState, shouldRecommend };
}

// Atomic write: tmp sibling + fsync + rename (rename(2) is atomic on POSIX).
// NOTE: largeCommandCount is an advisory nudge counter; a lost increment under
// concurrent sessions only delays the /thrift suggestion and is acceptable.
export function writeRoutingStateAtomic(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const tmp = `${statePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  try { const fd = openSync(tmp, "r+"); fsyncSync(fd); closeSync(fd); } catch {}
  renameSync(tmp, statePath);
  return statePath;
}

function main() {
  let input = "";
  try {
    input = readFileSync(0, "utf-8");
  } catch (error) {
    warnHook("read stdin", error);
  }
  let payload = {};
  try {
    payload = JSON.parse(input || "{}");
  } catch (error) {
    if (input.trim()) warnHook("parse hook payload", error);
    payload = {};
  }
  const cmd = (payload?.tool_input?.command ?? "").toString();
  const LIKELY_LARGE = [
    /\bgit\s+(log|diff|status|show|grep|ls-files)\b/, /\bnpm\s+(test|run|install)\b/,
    /\bcat\b/, /\bls\s+-/, /\bgrep\b/, /\brg\b/, /\bfind\b/,
    /\bjq\b/, /\bdocker\s+(ps|images|logs)\b/, /\bcurl\b/, /\bgh\s+/,
  ];
  if (LIKELY_LARGE.some(rx => rx.test(cmd))) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    let shouldRecommend = false;
    if (!existsSync(resolve(root, ".thrift.json"))) {
      const statePath = resolve(root, ".agent-skill", "state", "context-mode-router.json");
      let prev = {};
      try {
        if (existsSync(statePath)) prev = JSON.parse(readFileSync(statePath, "utf-8"));
      } catch (error) {
        warnHook("read routing state", error);
      }
      const { state, shouldRecommend: sr } = nextRoutingState(prev, { cmd, now: Date.now() });
      shouldRecommend = sr;
      try {
        writeRoutingStateAtomic(statePath, state);
        if (shouldRecommend) {
          const recommendation = resolve(root, ".agent-skill", "recommendations", "thrift.md");
          mkdirSync(dirname(recommendation), { recursive: true });
          writeFileSync(recommendation, [
            "# /thrift recommended",
            "",
            "Repeated large-output commands were detected before thrift was enabled.",
            "",
            "Run `/thrift` to install long-session summary and audit hooks. If you only need this one command, route it through context-mode or redirect output to a file.",
            "",
          ].join("\n"));
        }
      } catch (error) {
        warnHook("write routing state", error);
        // Advisory only. Never block the user's tool call.
      }
    }
    const thriftGuidance = shouldRecommend
      ? " Repeated large-output work detected and .thrift.json is not present; run /thrift to enable automatic summary/audit recommendations for long sessions."
      : "";
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `<context_guidance>This command may exceed 20 lines. Prefer mcp__plugin_context-mode_context-mode__ctx_batch_execute or ctx_execute so raw output stays in the sandbox; if context-mode is unavailable, redirect output to a file and cite the path.${thriftGuidance}</context_guidance>`,
      },
    }));
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
