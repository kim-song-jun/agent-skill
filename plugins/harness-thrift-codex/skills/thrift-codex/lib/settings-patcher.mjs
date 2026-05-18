// Minimal TOML-aware patcher for ~/.codex/config.toml.
//
// Codex stores hook registrations under a top-level [hooks] section in
// TOML (per the existing harness-builder-codex / harness-floor-codex
// templates). This module appends thrift hook stanzas to the file and
// removes them via sentinel comment markers.
//
// SIMPLIFICATION: we do NOT parse TOML. The patcher operates on the
// raw text. Assumptions:
//   1. Each thrift hook snippet is bracketed by two sentinel comment
//      lines:
//          # thrift: <name>
//          ...snippet body (one or more [[hooks.<event>]] tables)...
//          # end thrift: <name>
//   2. The patcher detects "already installed" by string-matching the
//      `# thrift: <name>` start sentinel.
//   3. Append happens at the end of the file (with a leading newline
//      if missing). This works because all our snippets define
//      `[[hooks.<event>]]` array-tables at the top level — TOML
//      treats them as additions to whatever `[hooks]` block exists,
//      regardless of declaration order in the file.
//   4. Remove finds matching start/end sentinel lines and deletes the
//      (inclusive) span. Mismatched / unbalanced sentinels are a
//      no-op for that name (rather than risking corruption).
//   5. We never overwrite or reorder non-thrift content. The file is
//      written atomically (tmp + rename).
//   6. We refuse to create config.toml from scratch — the user must
//      have run `codex` at least once. This avoids us guessing what
//      other config keys should live in the file.
//
// Contract:
//   patchCodexConfig({configPath, hooksToAdd, dryRun})
//     hooksToAdd: { [name]: <toml-snippet-string> }
//       Snippets MUST contain their own sentinel lines.
//     → { applied, skipped, current, body }
//
//   unpatchCodexConfig({configPath, sentinelPrefix, dryRun})
//     sentinelPrefix: string like "thrift:" (default).
//     → { removed, current, body }

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";

const DEFAULT_SENTINEL_PREFIX = "thrift:";

function readBody(path) {
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist — run \`codex\` at least once to seed it before patching`);
  }
  return readFileSync(path, "utf-8");
}

function atomicWrite(path, body) {
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

// Find a sentinel start line matching `# <prefix> <name>` (with optional
// surrounding whitespace; the rest of the line must match exactly).
function hasSentinel(body, prefix, name) {
  const re = new RegExp(`^\\s*#\\s*${escapeRegex(prefix)}\\s*${escapeRegex(name)}\\s*$`, "m");
  return re.test(body);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Append a snippet to the end of `body`, ensuring a single blank line
// separates it from prior content.
function appendSnippet(body, snippet) {
  let out = body;
  if (out.length > 0 && !out.endsWith("\n")) out += "\n";
  if (out.length > 0 && !out.endsWith("\n\n")) out += "\n";
  out += snippet.endsWith("\n") ? snippet : snippet + "\n";
  return out;
}

// Build the standard set of thrift hook snippets. Each value is the
// rendered TOML body (already including sentinels). Caller normally
// passes pre-rendered snippets; this helper is for tests / quick use.
//
// `hooksDir` is interpolated into each snippet's `command` line.
// `templateRender` is a callback `(name) => string` returning the
// rendered template body for `name`. If omitted, the snippets are
// inlined here (kept in sync with templates/hooks/*.toml.hbs).
export function buildStandardThriftCodexHooks({ hooksDir }) {
  const make = (name, body) => `# thrift: ${name}\n${body.trim()}\n# end thrift: ${name}\n`;
  const cmd = (script) => `node \"${hooksDir}/${script}.mjs\"`;
  return {
    "thrift-pretool-bash-telemetry": make(
      "thrift-pretool-bash-telemetry",
      `[[hooks.pre_tool_use]]
matcher = "shell_command"
command = "${cmd("thrift-pretool-bash-telemetry")}"
timeout_seconds = 10`,
    ),
    "thrift-pretool-read-coerce": make(
      "thrift-pretool-read-coerce",
      `[[hooks.pre_tool_use]]
matcher = "read_file"
command = "${cmd("thrift-pretool-read-coerce")}"
timeout_seconds = 10`,
    ),
    "thrift-posttool-summariser-trigger": make(
      "thrift-posttool-summariser-trigger",
      `[[hooks.post_tool_use]]
matcher = ".*"
command = "${cmd("thrift-posttool-summariser-trigger")}"
timeout_seconds = 15`,
    ),
    "thrift-sessionstart-cache-prime": make(
      "thrift-sessionstart-cache-prime",
      `[[hooks.session_start]]
command = "${cmd("thrift-sessionstart-cache-prime")}"
timeout_seconds = 15`,
    ),
    "thrift-sessionend-audit": make(
      "thrift-sessionend-audit",
      `[[hooks.session_end]]
command = "${cmd("thrift-sessionend-audit")}"
timeout_seconds = 30`,
    ),
  };
}

export function patchCodexConfig({ configPath, hooksToAdd, dryRun = false, sentinelPrefix = DEFAULT_SENTINEL_PREFIX }) {
  let body = readBody(configPath);
  let applied = 0;
  let skipped = 0;

  for (const [name, snippet] of Object.entries(hooksToAdd)) {
    if (typeof snippet !== "string" || snippet.length === 0) {
      // Caller error — skip this entry silently.
      skipped++;
      continue;
    }
    if (hasSentinel(body, sentinelPrefix, name)) {
      skipped++;
      continue;
    }
    body = appendSnippet(body, snippet);
    applied++;
  }

  if (!dryRun && applied > 0) {
    atomicWrite(configPath, body);
  }
  return { applied, skipped, current: body, body };
}

export function unpatchCodexConfig({ configPath, sentinelPrefix = DEFAULT_SENTINEL_PREFIX, dryRun = false }) {
  if (!existsSync(configPath)) {
    return { removed: 0, current: "", body: "" };
  }
  let body = readFileSync(configPath, "utf-8");
  let removed = 0;

  // Find all `# <prefix> <name>` sentinel start lines.
  const startRe = new RegExp(`^\\s*#\\s*${escapeRegex(sentinelPrefix)}\\s*([\\S]+)\\s*$`, "m");

  // Loop: find next start sentinel, then matching end sentinel, delete
  // the (inclusive) span. Continue until no more sentinels.
  while (true) {
    const m = startRe.exec(body);
    if (!m) break;
    const name = m[1];
    const startIdx = m.index;
    // Find end sentinel for this name.
    const endRe = new RegExp(`^\\s*#\\s*end\\s*${escapeRegex(sentinelPrefix)}\\s*${escapeRegex(name)}\\s*$`, "m");
    endRe.lastIndex = startIdx;
    const endM = endRe.exec(body.slice(startIdx));
    if (!endM) {
      // Unbalanced: skip this start sentinel by advancing past it but
      // don't delete (avoid corruption). Replace with a marker we can
      // detect, then restore at end.
      // Simpler approach: bail out of removal for this name. We do
      // this by mutating `body` minimally: replace the start sentinel
      // line with a placeholder that won't re-match.
      const lineEnd = body.indexOf("\n", startIdx);
      const before = body.slice(0, startIdx);
      const after = body.slice(lineEnd === -1 ? body.length : lineEnd);
      body = before + `# (thrift-codex: unbalanced sentinel for ${name}; skipped)` + after;
      continue;
    }
    const endAbsStart = startIdx + endM.index;
    // Find the newline after the end sentinel line (inclusive delete).
    const endLineNL = body.indexOf("\n", endAbsStart);
    const sliceEnd = endLineNL === -1 ? body.length : endLineNL + 1;
    // Also strip a single preceding blank line if it was added by appendSnippet.
    let actualStart = startIdx;
    if (actualStart >= 2 && body.slice(actualStart - 2, actualStart) === "\n\n") {
      actualStart -= 1;
    }
    body = body.slice(0, actualStart) + body.slice(sliceEnd);
    removed++;
  }

  // Restore placeholders we wrote for unbalanced sentinels back to
  // their original form (best-effort: they remain as comments).
  // (We intentionally leave them as a self-documenting trail.)

  if (!dryRun && removed > 0) {
    atomicWrite(configPath, body);
  }
  return { removed, current: body, body };
}
