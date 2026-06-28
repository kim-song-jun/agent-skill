// harness-html.mjs — render the harness's own markdown/JSON artifacts (specs, the
// task ledger, and the live /agent-all run state) into ONE self-contained, human-
// readable HTML dashboard. Dependency-free (no markdown library, no network): the
// output is a single file you can open anywhere.
//
// Used two ways: on demand by the /harness-view command, and best-effort at every
// /agent-all phase checkpoint so the human view tracks a run live.
import { readFileSync, readdirSync, existsSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

// ───────────────────────── minimal, escaping-safe markdown → HTML ─────────────────────────
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Only permit benign hrefs; everything else (javascript:, data:, vbscript:) drops the link target.
function safeHref(url) {
  const u = String(url).trim();
  if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(u) && !/^javascript:/i.test(u)) return escapeHtml(u);
  return null;
}

// Inline formatting on a single line. Code spans are extracted first so nothing is
// formatted inside them; the rest is HTML-escaped, then bold/italic/link applied.
export function inlineMd(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(escapeHtml(c));
    return `${codes.length - 1}`;
  });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
    const href = safeHref(url);
    return href ? `<a href="${href}">${label}</a>` : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(\d+)/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

function isTableSep(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}
function splitRow(line) {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

export function mdToHtml(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const out = [];
  let i = 0;
  let para = [];
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(inlineMd).join("<br>")}</p>`); para = []; }
  };
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      flushPara();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue; }
    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); out.push(`<h${h[1].length}>${inlineMd(h[2].trim())}</h${h[1].length}>`); i++; continue; }
    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); out.push("<hr>"); i++; continue; }
    // table: a pipe row followed by a separator row
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      const thead = `<thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }
    // blockquote
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${buf.map(inlineMd).join("<br>")}</blockquote>`);
      continue;
    }
    // list (flat; ordered vs unordered by the first marker)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushPara();
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "")); i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inlineMd(it)}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return out.join("\n");
}

// Strip a leading YAML-ish frontmatter block; return { meta, body }.
export function parseFrontmatter(md) {
  const m = String(md ?? "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: String(md ?? "") };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

// ───────────────────────── artifact collection ─────────────────────────
function readJson(path) { try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; } }
function readText(path) { try { return readFileSync(path, "utf-8"); } catch { return null; } }
function listMd(dir, skip = []) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !skip.includes(f) && !f.startsWith("_"))
    .sort()
    .map((f) => ({ name: f, md: readText(join(dir, f)) || "" }));
}

export function collectArtifacts({ cwd = process.cwd(), now = new Date().toISOString() } = {}) {
  const tasksDir = existsSync(resolve(cwd, ".agent-skill/tasks")) ? resolve(cwd, ".agent-skill/tasks") : resolve(cwd, "docs/tasks");
  return {
    generatedAt: now,
    project: basename(resolve(cwd)),
    run: readJson(resolve(cwd, ".agent-all-state.json")),
    taskIndex: readText(join(tasksDir, "index.md")),
    tasks: listMd(tasksDir, ["index.md"]),
    specs: listMd(resolve(cwd, "docs/superpowers/specs")),
  };
}

// ───────────────────────── dashboard rendering ─────────────────────────
const PHASE_NAMES = ["Preflight", "Intent", "Plan", "Dispatch", "Gate", "PR", "Loop"];
const STATUS_CLASS = { running: "v-new", done: "v-pass", aborted: "v-fail" };

function renderRun(run) {
  if (!run) return `<p class="empty">No active <code>.agent-all-state.json</code>. Start a run with <code>/agent-all</code>.</p>`;
  const done = new Set((Array.isArray(run.phases) ? run.phases : []).map((p) => Number(p.phase)));
  const maxPhase = done.size ? Math.max(...done) : -1;
  const timeline = PHASE_NAMES.map((name, n) => {
    const state = done.has(n) ? "done" : n === maxPhase + 1 && run.status === "running" ? "current" : "todo";
    return `<li class="ph ph-${state}"><span class="ph-n">${n}</span><span class="ph-name">${name}</span></li>`;
  }).join("");
  const sc = STATUS_CLASS[run.status] || "v-removed";
  const meta = [
    ["Status", `<span class="verdict ${sc}">${escapeHtml(run.status || "unknown")}</span>`],
    ["Run id", `<code>${escapeHtml(run.runId || "—")}</code>`],
    ["Task", escapeHtml(run.task ? String(run.task) : "—")],
    ["Updated", escapeHtml(run.updatedAt || "—")],
    run.costUSD != null ? ["Cost", `$${escapeHtml(String(run.costUSD))}`] : null,
    run.abortedReason ? ["Aborted reason", `<code>${escapeHtml(run.abortedReason)}</code>`] : null,
  ].filter(Boolean).map(([k, v]) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const decisions = run.decisions && Object.keys(run.decisions).length
    ? `<h3>Decisions</h3><pre><code>${escapeHtml(JSON.stringify(run.decisions, null, 2))}</code></pre>` : "";
  return `<div class="card"><dl class="kvs">${meta}</dl><ol class="timeline">${timeline}</ol>${decisions}</div>`;
}

function renderDoc(name, md) {
  const { meta, body } = parseFrontmatter(md);
  const badge = meta.status ? `<span class="verdict ${STATUS_CLASS[meta.status] || "v-removed"}">${escapeHtml(meta.status)}</span>` : "";
  const id = meta.display_id || meta.id ? `<code>${escapeHtml(meta.display_id || meta.id)}</code>` : "";
  return `<details class="doc"><summary>${escapeHtml(name)} ${id} ${badge}</summary><div class="doc-body">${mdToHtml(body)}</div></details>`;
}

function renderList(items) {
  if (!items.length) return `<p class="empty">None found.</p>`;
  return items.map((it) => renderDoc(it.name, it.md)).join("\n");
}

export function renderDashboard(a) {
  const tasksSection = (a.taskIndex ? `<div class="card">${mdToHtml(parseFrontmatter(a.taskIndex).body)}</div>` : "")
    + renderList(a.tasks || []);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(a.project)} — harness view</title>
<style>${CSS}</style></head>
<body>
<header>
  <h1>${escapeHtml(a.project)} <span class="sub">harness view</span></h1>
  <div class="gen">generated ${escapeHtml(a.generatedAt)}</div>
</header>
<nav class="tabs">
  <button class="tab active" data-tab="run">Run</button>
  <button class="tab" data-tab="tasks">Tasks (${(a.tasks || []).length})</button>
  <button class="tab" data-tab="specs">Specs (${(a.specs || []).length})</button>
</nav>
<main>
  <section id="run" class="panel active">${renderRun(a.run)}</section>
  <section id="tasks" class="panel">${tasksSection}</section>
  <section id="specs" class="panel">${renderList(a.specs || [])}</section>
</main>
<script>
  for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => {
    for (const x of document.querySelectorAll(".tab")) x.classList.remove("active");
    for (const x of document.querySelectorAll(".panel")) x.classList.remove("active");
    b.classList.add("active");
    document.getElementById(b.dataset.tab).classList.add("active");
  });
</script>
</body></html>`;
}

export function writeDashboard({ cwd = process.cwd(), now = new Date().toISOString() } = {}) {
  const html = renderDashboard(collectArtifacts({ cwd, now }));
  const outDir = resolve(cwd, ".agent-skill", "html");
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "index.html");
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, html);
  renameSync(tmp, path);
  return path;
}

const CSS = `
:root { --bg:#fafafa; --fg:#222; --muted:#666; --card:#fff; --border:#e5e5e5;
  --pass:#16a34a; --warn:#ca8a04; --fail:#dc2626; --new:#2563eb; --removed:#6b7280; }
* { box-sizing: border-box; }
body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; }
header { padding: 1.25rem 1.5rem .75rem; border-bottom: 1px solid var(--border); background: var(--card); }
h1 { font-size: 1.3rem; margin: 0; } h1 .sub { color: var(--muted); font-weight: 400; font-size: .9rem; }
.gen { color: var(--muted); font-size: .78rem; margin-top: .25rem; }
.tabs { display: flex; gap: .25rem; padding: .5rem 1.5rem 0; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 2; }
.tab { border: 1px solid transparent; border-bottom: none; background: none; padding: .5rem .9rem; font: inherit; color: var(--muted); cursor: pointer; border-radius: 6px 6px 0 0; }
.tab.active { color: var(--fg); background: var(--bg); border-color: var(--border); font-weight: 600; }
main { padding: 1.5rem; max-width: 980px; margin: 0 auto; }
.panel { display: none; } .panel.active { display: block; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
.kvs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .5rem 1.5rem; margin: 0 0 1rem; }
.kv { display: flex; flex-direction: column; } .kv dt { color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .03em; } .kv dd { margin: .1rem 0 0; }
.verdict { padding: .12rem .5rem; border-radius: 4px; font-size: .72rem; text-transform: uppercase; font-weight: 700; color: #fff; background: var(--muted); }
.verdict.v-pass { background: var(--pass); } .verdict.v-fail { background: var(--fail); } .verdict.v-new { background: var(--new); } .verdict.v-removed { background: var(--removed); }
.timeline { list-style: none; display: flex; flex-wrap: wrap; gap: .4rem; padding: 0; margin: .5rem 0 0; }
.ph { display: flex; align-items: center; gap: .4rem; border: 1px solid var(--border); border-radius: 999px; padding: .25rem .7rem; font-size: .8rem; background: var(--bg); color: var(--muted); }
.ph-n { display: inline-flex; width: 1.2rem; height: 1.2rem; align-items: center; justify-content: center; border-radius: 50%; background: var(--border); color: var(--fg); font-size: .72rem; font-weight: 700; }
.ph-done { border-color: var(--pass); color: var(--pass); } .ph-done .ph-n { background: var(--pass); color: #fff; }
.ph-current { border-color: var(--new); color: var(--new); font-weight: 700; } .ph-current .ph-n { background: var(--new); color: #fff; }
.doc { background: var(--card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: .6rem; }
.doc > summary { cursor: pointer; padding: .7rem 1rem; font-weight: 600; user-select: none; }
.doc-body { padding: 0 1.25rem 1rem; border-top: 1px solid var(--border); }
.empty { color: var(--muted); }
table { border-collapse: collapse; width: 100%; margin: .75rem 0; font-size: .9rem; }
th, td { border: 1px solid var(--border); padding: .4rem .6rem; text-align: left; vertical-align: top; }
th { background: var(--bg); }
pre { background: #1e1e1e; color: #e6e6e6; padding: .9rem 1rem; border-radius: 6px; overflow: auto; font-size: .82rem; }
:not(pre) > code { background: #f0f0f0; border-radius: 3px; padding: .05rem .35rem; font-size: .85em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid var(--border); margin: .5rem 0; padding: .2rem 0 .2rem 1rem; color: var(--muted); }
h2, h3 { margin: 1.1rem 0 .5rem; } a { color: var(--new); }
`;
