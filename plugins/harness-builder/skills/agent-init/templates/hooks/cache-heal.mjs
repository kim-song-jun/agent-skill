#!/usr/bin/env node
// SessionStart hook (project-scoped). Two responsibilities:
// 1. Heal context-mode plugin cache symlinks (mirrors the global hook).
// 2. Seed an indexing hint for context-mode by reading CLAUDE.md.
import { existsSync, readdirSync, statSync, symlinkSync, lstatSync, unlinkSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";

const HOOK_NAME = "cache-heal";

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

function warnUnlessMissing(action, error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
  warnHook(action, error);
}

try {
  const f = resolve(homedir(), ".claude", "plugins", "installed_plugins.json");
  if (existsSync(f)) {
    const cacheRoot = resolve(homedir(), ".claude", "plugins", "cache");
    const ip = JSON.parse(readFileSync(f, "utf-8"));
    for (const [k, es] of Object.entries(ip.plugins || {})) {
      if (k !== "context-mode@context-mode") continue;
      for (const e of es) {
        const p = e.installPath;
        if (!p || existsSync(p)) continue;
        if (!resolve(p).startsWith(cacheRoot + sep)) continue;
        const parent = dirname(p);
        if (!existsSync(parent)) continue;
        try {
          if (lstatSync(p).isSymbolicLink()) unlinkSync(p);
        } catch (error) {
          warnUnlessMissing("remove stale cache link", error);
        }
        const dirs = readdirSync(parent).filter(d => /^\d+\.\d+/.test(d) && statSync(join(parent, d)).isDirectory());
        if (!dirs.length) continue;
        dirs.sort((a, b) => {
          const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
          for (let i = 0; i < 3; i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
          }
          return 0;
        });
        try {
          symlinkSync(join(parent, dirs[dirs.length - 1]), p, process.platform === "win32" ? "junction" : undefined);
        } catch (error) {
          warnHook("repair context-mode cache link", error);
        }
      }
    }
  }
} catch (error) {
  warnHook("heal context-mode cache", error);
}

// Optional: emit a hint pointing at CLAUDE.md
try {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const claudeMd = resolve(cwd, "CLAUDE.md");
  if (existsSync(claudeMd)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `Project harness active. Read CLAUDE.md (${claudeMd}) and .claude/agents/ for roster.`,
      },
    }));
  }
} catch (error) {
  warnHook("emit project hint", error);
}
process.exit(0);
