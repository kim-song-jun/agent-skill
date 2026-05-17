#!/usr/bin/env node
// PreToolUse hook for Bash. Emits a context-mode routing hint when the command
// is likely to produce >20 lines. Pure stdout — does not block the tool call.
import { readFileSync } from "node:fs";
let input = "";
try { input = readFileSync(0, "utf-8"); } catch {}
let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}
const cmd = (payload?.tool_input?.command ?? "").toString();
const LIKELY_LARGE = [
  /\bgit\s+log\b/, /\bgit\s+diff\b/, /\bnpm\s+(test|run|install)\b/,
  /\bcat\b/, /\bls\s+-/, /\bgrep\b/, /\brg\b/, /\bfind\b/,
  /\bjq\b/, /\bdocker\s+(ps|images|logs)\b/, /\bcurl\b/, /\bgh\s+/,
];
if (LIKELY_LARGE.some(rx => rx.test(cmd))) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: "<context_guidance>This command may exceed 20 lines. Prefer mcp__plugin_context-mode_context-mode__ctx_batch_execute or ctx_execute so raw output stays in the sandbox.</context_guidance>",
    },
  }));
}
process.exit(0);
