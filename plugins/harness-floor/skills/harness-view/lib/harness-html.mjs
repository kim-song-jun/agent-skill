// harness-html.mjs — render the harness's own markdown/JSON artifacts (specs, the
// task ledger, and the live /agent-all run state) into ONE self-contained, human-
// readable HTML dashboard. Dependency-free (no markdown library, no network): the
// output is a single file you can open anywhere.
//
// Used two ways: on demand by the /harness-view command, and best-effort at every
// /agent-all phase checkpoint so the human view tracks a run live.
import { readFileSync, readdirSync, existsSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

import { escapeHtml, parseFrontmatter, renderMarkdown } from "./markdown.mjs";

// ───────────────────────── document metadata ─────────────────────────
export const FAMILIES = [
  "agent-all", "visual-qa", "harness-builder", "harness-debug", "harness-explore",
  "harness-thrift", "cross-platform", "hook", "decision-surfacing", "auto-detect",
  "native-ask", "cli-runtime",
];
export function familyOf(slug) { for (const f of FAMILIES) if (String(slug).includes(f)) return f; return "misc"; }

export function deriveDocMeta(kind, file, md) {
  const { meta, body } = parseFrontmatter(md);
  const slug = String(file).replace(/\.md$/, "");
  const titleM = body.match(/^#\s+(.+)$/m);
  const date = (String(file).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  return {
    id: `${kind}:${slug}`,
    file, body,
    title: titleM ? titleM[1].trim() : slug,
    date,
    family: familyOf(slug),
    lang: /\.ko$/.test(slug) ? "KO" : "EN",
    status: meta.status || "",
  };
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
const STATUS_CLASS = { running: "v-new", done: "v-pass", aborted: "v-fail", todo: "v-todo" };
function badge(status) { return status ? `<span class="verdict ${STATUS_CLASS[status] || "v-removed"}">${escapeHtml(status)}</span>` : ""; }

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

export function renderDashboard(a) {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(a.project)} — harness view</title>
<style>${CSS}</style></head>
<body>
<header class="hv-header">
  <h1>${escapeHtml(a.project)} <span class="hv-sub">harness view</span></h1>
  ${a.run ? badge(a.run.status) : ""}
  <span class="hv-gen">generated ${escapeHtml(a.generatedAt)}</span>
  <button class="hv-toggle" aria-label="menu">☰</button>
</header>
<div class="hv-app">
  ${renderSidebar(a)}
  <main class="hv-main">${renderReadingPanes(a)}</main>
  ${renderTocPanes(a)}
</div>
<script>${CLIENT_JS}</script>
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

// ───────────────────────── sidebar rendering ─────────────────────────
function navRow(meta, label, extra = "") {
  return `<a class="hv-row" data-doc-id="${escapeHtml(meta.id)}" data-search="${escapeHtml((meta.title + " " + meta.family).toLowerCase())}" title="${escapeHtml(meta.file)}">`
    + `<span class="hv-row-t">${escapeHtml(label)}</span><span class="hv-row-m">${extra}</span></a>`;
}

export function renderSidebar(a) {
  const tasks = (a.tasks || []).map((t) => deriveDocMeta("task", t.name, t.md));
  const specs = (a.specs || []).map((s) => deriveDocMeta("spec", s.name, s.md));
  const taskRows = tasks.map((m) => navRow(m, m.title,
    `<code>${escapeHtml(m.id.split(":")[1])}</code> ${badge(m.status)}`)).join("");
  const groups = {};
  for (const m of specs) (groups[m.family] = groups[m.family] || []).push(m);
  const specGroups = Object.entries(groups).sort((x, y) => y[1].length - x[1].length).map(([fam, items]) =>
    `<div class="hv-group"><div class="hv-group-h">${escapeHtml(fam)} <span class="hv-group-n">${items.length}</span></div>`
    + items.sort((p, q) => (p.date < q.date ? -1 : 1)).map((m) =>
        navRow(m, m.title, `<span class="hv-date">${escapeHtml(m.date)}</span> <span class="verdict outline">${escapeHtml(m.lang)}</span>`)).join("")
    + `</div>`).join("");
  return `<aside class="hv-sidebar">`
    + `<input class="hv-search" type="search" placeholder="🔍  검색 (제목·내용)" aria-label="search">`
    + `<div class="hv-sec">Run</div>`
    + `<a class="hv-row" data-doc-id="home" data-search="run overview"><span class="hv-row-t">현재 런 / 개요</span></a>`
    + `<div class="hv-sec">Tasks <span class="hv-group-n">${tasks.length}</span></div>${taskRows || `<p class="hv-empty">None</p>`}`
    + `<div class="hv-sec">Specs <span class="hv-group-n">${specs.length}</span></div>${specGroups || `<p class="hv-empty">None</p>`}`
    + `</aside>`;
}

// ───────────────────────── overview-home rendering ─────────────────────────
export function renderOverviewHome(a) {
  const tasks = (a.tasks || []).map((t) => deriveDocMeta("task", t.name, t.md));
  const specs = (a.specs || []).map((s) => deriveDocMeta("spec", s.name, s.md));
  const roll = { done: 0, running: 0, todo: 0 };
  for (const t of tasks) if (roll[t.status] != null) roll[t.status]++;
  const families = new Set(specs.map((s) => s.family)).size;
  const latest = specs.map((s) => s.date).filter(Boolean).sort().slice(-1)[0] || "—";
  return `<div class="hv-stats">`
    + `<div class="hv-stat hv-stat-wide"><div class="hv-stat-l">Run</div>${renderRun(a.run)}</div>`
    + `<div class="hv-stat"><div class="hv-stat-l">Tasks</div><div class="hv-roll">`
      + `<span class="r-done">● ${roll.done} done</span><span class="r-run">● ${roll.running} running</span><span class="r-todo">● ${roll.todo} todo</span>`
      + `</div></div>`
    + `<div class="hv-stat"><div class="hv-stat-l">Specs</div><div class="hv-big">${specs.length}</div>`
      + `<div class="hv-muted">${families} topics · 최근 ${escapeHtml(latest)}</div></div>`
    + `</div>`;
}

// ───────────────────────── reading panes + toc panes ─────────────────────────
function tocHtml(toc) {
  if (!toc || !toc.length) return `<p class="hv-muted">No sections</p>`;
  return `<ul class="hv-toc-list">` + toc.map((t) =>
    `<li class="toc-l${t.level}"><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`).join("") + `</ul>`;
}

function docPane(meta) {
  const aid = meta.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const { html } = renderMarkdown(meta.body, { idPrefix: aid });
  const metaLine = [meta.file, meta.date, meta.status].filter(Boolean).map(escapeHtml).join(" · ");
  return `<section class="hv-pane" data-doc-id="${escapeHtml(meta.id)}">`
    + `<div class="hv-doc-meta">${metaLine}</div><div class="doc-body">${html}</div></section>`;
}

export function renderReadingPanes(a) {
  const docs = [
    ...(a.tasks || []).map((t) => deriveDocMeta("task", t.name, t.md)),
    ...(a.specs || []).map((s) => deriveDocMeta("spec", s.name, s.md)),
  ];
  return `<section class="hv-pane hv-active" data-doc-id="home">${renderOverviewHome(a)}</section>`
    + docs.map(docPane).join("\n");
}

export function renderTocPanes(a) {
  const docs = [
    ...(a.tasks || []).map((t) => deriveDocMeta("task", t.name, t.md)),
    ...(a.specs || []).map((s) => deriveDocMeta("spec", s.name, s.md)),
  ];
  return `<nav class="hv-toc hv-active" data-doc-id="home"><div class="hv-toc-h">On this page</div><p class="hv-muted">Overview</p></nav>`
    + docs.map((m) => {
      const aid = m.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      return `<nav class="hv-toc" data-doc-id="${escapeHtml(m.id)}"><div class="hv-toc-h">On this page</div>${tocHtml(renderMarkdown(m.body, { idPrefix: aid }).toc)}</nav>`;
    }).join("\n");
}

const CSS = `
:root { --bg:#fafafa; --fg:#1f2328; --muted:#656d76; --card:#fff; --border:#e3e6ea; --hover:#f3f4f6;
  --accent:#2563eb; --accent-soft:#eef4ff; --pass:#16a34a; --warn:#ca8a04; --fail:#dc2626; --new:#2563eb; --removed:#6b7280; --todo:#9aa3ad; }
* { box-sizing:border-box; } body { font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; background:var(--bg); color:var(--fg); margin:0; }
a { color:var(--accent); }
.verdict { display:inline-block; padding:.1rem .45rem; border-radius:999px; font-size:.68rem; text-transform:uppercase; font-weight:700; color:#fff; background:var(--muted); }
.verdict.v-pass{background:var(--pass);} .verdict.v-fail{background:var(--fail);} .verdict.v-new{background:var(--new);} .verdict.v-removed{background:var(--removed);} .verdict.v-todo{color:var(--fg);background:#e7eaee;}
.verdict.outline{background:transparent;color:var(--muted);border:1px solid var(--border);}
.hv-header{display:flex;align-items:baseline;gap:.6rem;padding:.7rem 1.1rem;border-bottom:1px solid var(--border);background:var(--card);}
.hv-header h1{font-size:1.05rem;margin:0;} .hv-sub{color:var(--muted);font-size:.8rem;} .hv-gen{margin-left:auto;color:var(--muted);font-size:.72rem;}
.hv-toggle{display:none;background:none;border:1px solid var(--border);border-radius:6px;padding:.2rem .5rem;cursor:pointer;}
.hv-app{display:grid;grid-template-columns:300px 1fr 220px;height:calc(100vh - 52px);}
.hv-sidebar{border-right:1px solid var(--border);background:var(--card);overflow:auto;padding:.6rem;}
.hv-search{width:100%;padding:.5rem .7rem;border:1px solid var(--border);border-radius:8px;font:inherit;margin-bottom:.5rem;background:var(--bg);}
.hv-sec{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:.7rem .4rem .3rem;font-weight:700;}
.hv-row{display:block;padding:.4rem .55rem;border-radius:7px;cursor:pointer;text-decoration:none;color:var(--fg);}
.hv-row:hover{background:var(--hover);} .hv-row.hv-active{background:var(--accent-soft);box-shadow:inset 2px 0 0 var(--accent);}
.hv-row-t{display:block;font-size:.85rem;line-height:1.3;} .hv-row-m{display:flex;align-items:center;gap:.35rem;margin-top:.15rem;}
.hv-row-m code{font-size:.7rem;background:#eef0f2;padding:0 .3rem;border-radius:4px;}
.hv-group{margin-bottom:.3rem;} .hv-group-h{font-size:.74rem;font-weight:700;color:var(--muted);padding:.35rem .5rem;display:flex;gap:.4rem;align-items:center;}
.hv-group-n{font-size:.66rem;background:#e7eaee;color:var(--muted);border-radius:999px;padding:0 .4rem;}
.hv-date{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;} .hv-empty{color:var(--muted);padding:0 .5rem;}
.hv-main{overflow:auto;padding:1.6rem 2rem;}
.hv-pane{display:none;max-width:780px;} .hv-pane.hv-active{display:block;}
.hv-doc-meta{color:var(--muted);font-size:.78rem;margin:0 0 1rem;}
.hv-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;} .hv-stat-wide{grid-column:1/-1;}
.hv-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1rem 1.2rem;}
.hv-stat-l{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:.4rem;}
.hv-big{font-size:1.5rem;font-weight:700;} .hv-muted{color:var(--muted);font-size:.78rem;margin-top:.2rem;}
.hv-roll span{margin-right:.7rem;font-size:.9rem;} .r-done{color:var(--pass);} .r-run{color:var(--accent);} .r-todo{color:var(--muted);}
.hv-toc{border-left:1px solid var(--border);padding:1.4rem 1rem;overflow:auto;background:var(--card);display:none;}
.hv-toc.hv-active{display:block;} .hv-toc-h{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;margin-bottom:.5rem;}
.hv-toc-list{list-style:none;padding:0;margin:0;} .hv-toc-list li{margin:.2rem 0;} .hv-toc-list a{text-decoration:none;color:var(--muted);font-size:.8rem;}
.hv-toc-list a:hover{color:var(--accent);} .toc-l3{padding-left:.8rem;font-size:.76rem;}
/* run timeline (kept from the original renderRun markup) */
.kvs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.5rem 1.5rem;margin:0 0 1rem;}
.kv{display:flex;flex-direction:column;} .kv dt{color:var(--muted);font-size:.72rem;text-transform:uppercase;} .kv dd{margin:.1rem 0 0;}
.timeline{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;padding:0;margin:.5rem 0 0;}
.ph{display:flex;align-items:center;gap:.4rem;border:1px solid var(--border);border-radius:999px;padding:.25rem .7rem;font-size:.8rem;background:var(--bg);color:var(--muted);}
.ph-n{display:inline-flex;width:1.2rem;height:1.2rem;align-items:center;justify-content:center;border-radius:50%;background:var(--border);color:var(--fg);font-size:.72rem;font-weight:700;}
.ph-done{border-color:var(--pass);color:var(--pass);} .ph-done .ph-n{background:var(--pass);color:#fff;}
.ph-current{border-color:var(--new);color:var(--new);font-weight:700;} .ph-current .ph-n{background:var(--new);color:#fff;}
/* shared doc rendering */
.doc-body h1{font-size:1.5rem;margin:0 0 .3rem;} .doc-body h2{font-size:1.15rem;margin:1.6rem 0 .5rem;padding-top:.4rem;border-top:1px solid var(--border);}
.doc-body h3{font-size:1rem;margin:1.1rem 0 .4rem;} .doc-body p{margin:.5rem 0;}
.doc-body ul,.doc-body ol{margin:.4rem 0;padding-left:1.4rem;} .doc-body li{margin:.15rem 0;}
.doc-body li.task-li{list-style:none;margin-left:-1.1rem;} .doc-body .task{display:inline-flex;align-items:center;gap:.45rem;} .doc-body .task input{width:1rem;height:1rem;}
.doc-body table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.9rem;} .doc-body th,.doc-body td{border:1px solid var(--border);padding:.4rem .6rem;text-align:left;vertical-align:top;} .doc-body th{background:var(--bg);}
.doc-body blockquote{border-left:3px solid var(--accent);margin:.6rem 0;padding:.3rem 0 .3rem 1rem;color:var(--muted);background:var(--accent-soft);border-radius:0 6px 6px 0;}
.codeblock{position:relative;margin:.75rem 0;} .code-lang{position:absolute;top:0;right:0;font-size:.65rem;text-transform:uppercase;color:#8b9099;background:#2a2a2a;padding:.15rem .5rem;border-radius:0 6px 6px 0;}
.doc-body pre{background:#1e1e1e;color:#e6e6e6;padding:.9rem 1rem;border-radius:8px;overflow:auto;font-size:.82rem;margin:0;}
.doc-body :not(pre)>code{background:#eef0f2;border-radius:4px;padding:.05rem .35rem;font-size:.85em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;} .doc-body pre code{background:none;padding:0;}
@media (max-width:860px){
  .hv-app{grid-template-columns:1fr;} .hv-toc,.hv-toc.hv-active{display:none;} .hv-toggle{display:block;margin-left:.4rem;}
  .hv-sidebar{position:fixed;z-index:5;top:52px;bottom:0;left:0;width:280px;transform:translateX(-100%);transition:transform .15s;}
  body.hv-nav-open .hv-sidebar{transform:none;}
}
`;

const CLIENT_JS = `
(function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll('.hv-row'));
  var panes = document.querySelectorAll('.hv-pane');
  var tocs = document.querySelectorAll('.hv-toc');
  function show(id) {
    var found = false;
    panes.forEach(function (p) { var on = p.getAttribute('data-doc-id') === id; p.classList.toggle('hv-active', on); if (on) found = true; });
    tocs.forEach(function (t) { t.classList.toggle('hv-active', t.getAttribute('data-doc-id') === id); });
    rows.forEach(function (r) { r.classList.toggle('hv-active', r.getAttribute('data-doc-id') === id); });
    if (!found) { var home = document.querySelector('.hv-pane[data-doc-id=\\'home\\']'); if (home) home.classList.add('hv-active'); }
    document.body.classList.remove('hv-nav-open');
  }
  function fromHash() { var m = /^#doc=(.+)$/.exec(location.hash); if (m) show(decodeURIComponent(m[1])); else if (!location.hash) show('home'); /* else: bare heading anchor — leave pane active, let browser scroll */ }
  rows.forEach(function (r) { r.addEventListener('click', function (e) { e.preventDefault(); location.hash = 'doc=' + encodeURIComponent(r.getAttribute('data-doc-id')); }); });
  window.addEventListener('hashchange', fromHash);
  var box = document.querySelector('.hv-search');
  if (box) box.addEventListener('input', function () {
    var q = box.value.trim().toLowerCase();
    rows.forEach(function (r) {
      var id = r.getAttribute('data-doc-id');
      var hay = (r.getAttribute('data-search') || '');
      var pane = document.querySelector('.hv-pane[data-doc-id=\\'' + id + '\\']');
      var body = pane ? (pane.textContent || '').toLowerCase() : '';
      r.style.display = (!q || hay.indexOf(q) >= 0 || body.indexOf(q) >= 0) ? '' : 'none';
    });
    document.querySelectorAll('.hv-group').forEach(function (g) {
      var any = Array.prototype.some.call(g.querySelectorAll('.hv-row'), function (r) { return r.style.display !== 'none'; });
      g.style.display = any ? '' : 'none';
    });
  });
  var toggle = document.querySelector('.hv-toggle');
  if (toggle) toggle.addEventListener('click', function () { document.body.classList.toggle('hv-nav-open'); });
  fromHash();
})();
`;
