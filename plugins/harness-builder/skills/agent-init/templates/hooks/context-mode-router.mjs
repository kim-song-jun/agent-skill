#!/usr/bin/env node
// PreToolUse hook for Bash. Emits a context-mode routing hint when the command
// is likely to produce >20 lines. Pure stdout — does not block the tool call.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
let input = "";
try { input = readFileSync(0, "utf-8"); } catch {}
let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}
const cmd = (payload?.tool_input?.command ?? "").toString();
const LIKELY_LARGE = [
  /\bgit\s+(log|diff|status|show|grep|ls-files)\b/, /\bnpm\s+(test|run|install)\b/,
  /\bcat\b/, /\bls\s+-/, /\bgrep\b/, /\brg\b/, /\bfind\b/,
  /\bjq\b/, /\bdocker\s+(ps|images|logs)\b/, /\bcurl\b/, /\bgh\s+/,
];
if (LIKELY_LARGE.some(rx => rx.test(cmd))) {
  const recommendThrift = recordLargeCommandAndMaybeRecommendThrift();
  const thriftGuidance = recommendThrift
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

function recordLargeCommandAndMaybeRecommendThrift() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (existsSync(resolve(root, ".thrift.json"))) return false;

  const statePath = resolve(root, ".agent-skill", "state", "context-mode-router.json");
  let state = {};
  try {
    if (existsSync(statePath)) state = JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    state = {};
  }

  const now = Date.now();
  const largeCommandCount = Number(state.largeCommandCount || 0) + 1;
  const lastReminderAt = Number(state.lastThriftReminderAt || 0);
  const shouldRecommend = largeCommandCount >= 3 && now - lastReminderAt > 60 * 60 * 1000;

  const nextState = {
    ...state,
    largeCommandCount,
    updatedAt: new Date(now).toISOString(),
    lastCommand: cmd.slice(0, 240),
    ...(shouldRecommend ? { lastThriftReminderAt: now } : {}),
  };

  try {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(nextState, null, 2));
    if (shouldRecommend) {
      const recommendation = resolve(root, ".agent-skill", "recommendations", "thrift.md");
      mkdirSync(dirname(recommendation), { recursive: true });
      writeFileSync(
        recommendation,
        [
          "# /thrift recommended",
          "",
          "Repeated large-output commands were detected before thrift was enabled.",
          "",
          "Run `/thrift` to install long-session summary and audit hooks. If you only need this one command, route it through context-mode or redirect output to a file.",
          "",
        ].join("\n"),
      );
    }
  } catch {
    // Advisory only. Never block the user's tool call.
  }

  return shouldRecommend;
}
