#!/usr/bin/env node
// preToolUse hook handler for Copilot CLI. Denies shared-worktree-dangerous git
// commands (the same rules the Claude/Codex agent-policy-hook enforces) so the
// Copilot port gets REAL hard enforcement, not just prompt-level guidance.
//
// Copilot's preToolUse is FAIL-CLOSED: a crash or non-zero exit denies the tool
// call. So this handler is defensive — any failure path EXITS 0 (allow) rather
// than bricking the session by denying every command. It only ever DENIES when
// the git-safety analysis explicitly flags a command.
import { readFileSync } from "node:fs";

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf-8") || "{}");
} catch {
  process.exit(0); // unreadable/garbage stdin → allow
}

const toolName = String(payload.toolName ?? payload.tool_name ?? "");
if (!/^(bash|powershell)$/i.test(toolName)) process.exit(0); // only shell tools carry commands

// Dynamic import so a missing/broken safety lib fails OPEN (allow), never
// fail-closed deny-all. The normal install copies git-safety.mjs alongside.
let analyzeGitCommand;
try {
  ({ analyzeGitCommand } = await import("./git-safety.mjs"));
} catch {
  process.exit(0);
}

let args = payload.toolArgs ?? payload.tool_input ?? payload.toolInput ?? null;
// Copilot CLI v1.0.63 sends toolArgs as a JSON-ENCODED STRING (e.g.
// '{"command":"git stash"}'), not a parsed object — verified by live probe.
// Parse it when it looks like JSON; otherwise treat it as the raw command.
if (typeof args === "string") {
  const trimmed = args.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { args = JSON.parse(trimmed); } catch { /* not JSON → keep the raw string */ }
  }
}
let command = "";
if (typeof args === "string") {
  command = args;
} else if (args && typeof args === "object") {
  command = String(args.command ?? args.script ?? args.cmd ?? args.commandLine ?? "");
}

const verdict = analyzeGitCommand(command);
if (verdict.blocked) {
  process.stdout.write(
    JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: verdict.reason }) + "\n",
  );
}
process.exit(0);
