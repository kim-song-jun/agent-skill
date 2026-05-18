// report-renderer.mjs — render `templates/report.md.hbs` against an
// aggregated `report.json`. Coordinator invokes via `read_bash` and
// redirects stdout to `report.md`.
//
// Uses the same lightweight Handlebars-ish renderer shipped in
// `plugins/harness-floor-cursor/bin/lib/render.mjs`. We re-implement here
// locally so the lib has no cross-plugin import dependency (cross-platform
// isolation test requires that all imports stay inside the plugin tree).

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE = resolve(here, "..", "templates", "report.md.hbs");

function isMain() {
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
}

// --- minimal Handlebars-ish renderer (kept local; mirrors bin/lib/render.mjs)
function lookup(ctx, path) {
  if (path === "this") return ctx.__this__ ?? "";
  if (path === "@index") return ctx.__index__ ?? "";
  const parts = path.split(".");
  let v = ctx;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (v == null) return "";
    if (p === "this" && i === 0) v = ctx.__this__;
    else v = v[p];
  }
  return v ?? "";
}

function renderEach(body, list, ctx) {
  if (!Array.isArray(list)) return "";
  return list.map((item, i) => {
    const sub = (item && typeof item === "object" && !Array.isArray(item))
      ? { ...ctx, ...item, __this__: item, __index__: i }
      : { ...ctx, __this__: item, __index__: i };
    return render(body, sub);
  }).join("");
}

function findMatchingClose(tpl, openEnd, kind) {
  const openRe = new RegExp(`\\{\\{#${kind}\\s+[\\w.]+\\}\\}`, "g");
  const closeStr = `{{/${kind}}}`;
  let depth = 1;
  let i = openEnd;
  while (i < tpl.length) {
    openRe.lastIndex = i;
    const openMatch = openRe.exec(tpl);
    const closeIdx = tpl.indexOf(closeStr, i);
    if (closeIdx === -1) return -1;
    if (openMatch && openMatch.index < closeIdx) {
      depth++;
      i = openMatch.index + openMatch[0].length;
    } else {
      depth--;
      if (depth === 0) return closeIdx;
      i = closeIdx + closeStr.length;
    }
  }
  return -1;
}

function processBlocks(tpl, kind, handler) {
  const openRe = new RegExp(`\\{\\{#${kind}\\s+([\\w.]+)\\}\\}`);
  let out = "";
  let pos = 0;
  while (pos < tpl.length) {
    openRe.lastIndex = 0;
    const slice = tpl.slice(pos);
    const m = openRe.exec(slice);
    if (!m) { out += tpl.slice(pos); break; }
    const openAbs = pos + m.index;
    const openEnd = openAbs + m[0].length;
    const closeAbs = findMatchingClose(tpl, openEnd, kind);
    if (closeAbs === -1) { out += tpl.slice(pos); break; }
    const body = tpl.slice(openEnd, closeAbs);
    const replacement = handler(m[1], body);
    out += tpl.slice(pos, openAbs) + replacement;
    pos = closeAbs + `{{/${kind}}}`.length;
  }
  return out;
}

function render(tpl, ctx = {}) {
  tpl = processBlocks(tpl, "each", (path, body) => renderEach(body, lookup(ctx, path), ctx));
  tpl = processBlocks(tpl, "if", (path, body) => lookup(ctx, path) ? render(body, ctx) : "");
  tpl = tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (_, path) => String(lookup(ctx, path) ?? ""));
  return tpl;
}

// --- public API

export function renderReport(reportJson, templatePath = DEFAULT_TEMPLATE) {
  if (!existsSync(templatePath)) {
    throw new Error(`report template not found: ${templatePath}`);
  }
  const tpl = readFileSync(templatePath, "utf-8");
  return render(tpl, reportJson ?? {});
}

// CLI: `node lib/report-renderer.mjs <report.json> [template-path]` → stdout.
if (isMain()) {
  const [, , reportPath, templatePath] = process.argv;
  if (!reportPath) {
    console.error("usage: report-renderer.mjs <report.json> [template.md.hbs]");
    process.exit(2);
  }
  const reportJson = JSON.parse(readFileSync(reportPath, "utf-8"));
  process.stdout.write(renderReport(reportJson, templatePath || DEFAULT_TEMPLATE));
}
