// debug-artifacts.mjs - deterministic Phase 5 debug-log/state writer.
//
// Public API:
//   slugifyDebugSubject(value, {maxLength?}) -> slug
//   buildDebugLogContext(state, {slug?, now?}) -> render context
//   renderDebugLog(template, state, opts) -> markdown
//   finishDebugSession({projectRoot, state, statePath?, slug?, now?})
//     -> {ok, exitCode, debugLogPath, indexPath, rootCause, summary}

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summary as hypothesisSummary } from "./hypothesis-tracker.mjs";
import { saveState } from "./state-checkpoint.mjs";

const DEFAULT_UNVERIFIED_ROOT_CAUSE = "abandoned — no verification";
const DEFAULT_TEMPLATE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "debug-log.md.hbs",
);

function lookup(ctx, path) {
  if (path === "this") return ctx.__this__ ?? "";
  if (path === "@index") return ctx.__index__ ?? "";
  const parts = path.split(".");
  let value = ctx;
  for (let i = 0; i < parts.length; i++) {
    if (value == null) return "";
    const part = parts[i];
    value = part === "this" && i === 0 ? ctx.__this__ : value[part];
  }
  return value ?? "";
}

function findMatchingClose(tpl, openEnd, kind) {
  const openRe = new RegExp(`\\{\\{#${kind}\\s+[\\w.]+\\}\\}`, "g");
  const closeStr = `{{/${kind}}}`;
  let depth = 1;
  let cursor = openEnd;
  while (cursor < tpl.length) {
    openRe.lastIndex = cursor;
    const openMatch = openRe.exec(tpl);
    const closeIdx = tpl.indexOf(closeStr, cursor);
    if (closeIdx === -1) return -1;
    if (openMatch && openMatch.index < closeIdx) {
      depth++;
      cursor = openMatch.index + openMatch[0].length;
    } else {
      depth--;
      if (depth === 0) return closeIdx;
      cursor = closeIdx + closeStr.length;
    }
  }
  return -1;
}

function processBlocks(tpl, kind, handler) {
  const openRe = new RegExp(`\\{\\{#${kind}\\s+([\\w.]+)\\}\\}`);
  let out = "";
  let pos = 0;
  while (pos < tpl.length) {
    const slice = tpl.slice(pos);
    const match = openRe.exec(slice);
    if (!match) {
      out += tpl.slice(pos);
      break;
    }
    const openAbs = pos + match.index;
    const openEnd = openAbs + match[0].length;
    const closeAbs = findMatchingClose(tpl, openEnd, kind);
    if (closeAbs === -1) {
      out += tpl.slice(pos);
      break;
    }
    out += tpl.slice(pos, openAbs) + handler(match[1], tpl.slice(openEnd, closeAbs));
    pos = closeAbs + `{{/${kind}}}`.length;
  }
  return out;
}

function renderTemplate(tpl, ctx = {}) {
  tpl = processBlocks(tpl, "each", (path, body) => {
    const list = lookup(ctx, path);
    if (!Array.isArray(list)) return "";
    return list.map((item, index) => {
      const sub = item && typeof item === "object" && !Array.isArray(item)
        ? { ...ctx, ...item, __this__: item, __index__: index }
        : { ...ctx, __this__: item, __index__: index };
      return renderTemplate(body, sub);
    }).join("");
  });
  tpl = processBlocks(tpl, "if", (path, body) => lookup(ctx, path) ? renderTemplate(body, ctx) : "");
  return tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (_, path) => String(lookup(ctx, path) ?? ""));
}

function asDate(now) {
  return now instanceof Date ? now : new Date(now);
}

function isoNow(now) {
  return asDate(now).toISOString();
}

function dateOnly(now) {
  return isoNow(now).slice(0, 10);
}

function verifiedRootCause(state) {
  return (state?.hypotheses ?? []).find((hypothesis) => hypothesis.status === "verified")?.text
    ?? DEFAULT_UNVERIFIED_ROOT_CAUSE;
}

function writeFileAtomic(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function appendIndexEntry(path, entry) {
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "# Debug Logs\n\n";
  writeFileAtomic(path, `${existing.endsWith("\n") ? existing : `${existing}\n`}${entry}`);
}

export function slugifyDebugSubject(value, { maxLength = 40 } = {}) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "unknown";
}

export function buildDebugLogContext(state, { slug = null, now = new Date() } = {}) {
  const subject = state?.failure?.description ?? state?.failure?.command ?? "";
  const resolvedSlug = slugifyDebugSubject(slug ?? subject);
  const rootCause = state?.resolution?.rootCause ?? verifiedRootCause(state);
  return {
    ...state,
    slug: resolvedSlug,
    date: dateOnly(now),
    resolution: {
      ...(state?.resolution ?? {}),
      rootCause,
    },
    failure: {
      ...(state?.failure ?? {}),
      errorParsed: state?.failure?.errorParsed ?? { kind: "unknown", frames: [] },
    },
  };
}

export function renderDebugLog(template, state, opts = {}) {
  return renderTemplate(template, buildDebugLogContext(state, opts));
}

export function finishDebugSession({
  projectRoot = process.cwd(),
  state,
  statePath = resolve(projectRoot, ".debug-state.json"),
  templatePath = DEFAULT_TEMPLATE,
  slug = null,
  now = new Date(),
  appendIndex = true,
} = {}) {
  if (!state || typeof state !== "object") {
    throw new TypeError("finishDebugSession: state is required");
  }

  const context = buildDebugLogContext(state, { slug, now });
  const debugLogRel = `docs/debug/${context.date}-${context.slug}.md`;
  const debugLogPath = resolve(projectRoot, debugLogRel);
  const rootCause = context.resolution.rootCause;
  const finishedAt = isoNow(now);
  state.resolution = {
    rootCause,
    fixCommit: state.resolution?.fixCommit ?? null,
    debugLogPath: debugLogRel,
    finishedAt,
  };

  const rendered = renderDebugLog(readFileSync(templatePath, "utf-8"), state, { slug: context.slug, now });
  writeFileAtomic(debugLogPath, rendered.endsWith("\n") ? rendered : `${rendered}\n`);
  saveState(statePath, state);

  const indexPath = resolve(projectRoot, "docs/debug/index.md");
  if (appendIndex) {
    appendIndexEntry(indexPath, `- ${context.date} - ${context.slug} - ${rootCause} - ${debugLogRel}\n`);
  }

  const stats = hypothesisSummary(state);
  return {
    ok: stats.verified > 0,
    exitCode: stats.verified > 0 ? 0 : 1,
    debugLogPath: debugLogRel,
    indexPath: "docs/debug/index.md",
    rootCause,
    summary: `Debug complete: ${rootCause}\nLog: ${debugLogRel}\nHypotheses: ${stats.tested}/${stats.total} tested, ${stats.verified} verified, ${stats.rejected} rejected.`,
  };
}
