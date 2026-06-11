// Self-contained HTML report for visual-qa runs.
// Renders one card per element with before/after/baseline thumbnails and a
// lightbox modal for fullscreen comparison. No external assets — inline CSS,
// inline JS, image refs are relative paths into captures/.

import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "../../agent-all/lib/security/artifact-redactor.mjs";
import { writeRedactionAudit } from "../../agent-all/lib/security/redact-report-writer.mjs";

/**
 * @param {object} reportData
 * @param {string} reportData.slug         - run slug (date or named)
 * @param {string} reportData.generatedAt  - ISO timestamp
 * @param {string} reportData.baseUrl
 * @param {Array<{
 *   elementId: string,
 *   pageSlug: string,
 *   pageUrl: string,
 *   selector: string,
 *   action: string,
 *   verdict: 'pass' | 'warn' | 'fail' | 'new' | 'removed',
 *   confidence: 'explicit' | 'semantic' | 'path',
 *   hasBaseline: boolean,
 *   screenshots: { before: string, after: string, baseline?: string },
 *   notes?: string
 * }>} reportData.captures
 * @param {object} [opts]
 * @param {object} [opts.config] - optional redaction config
 * @param {string} [opts.artifactPath] - audit/display path for the artifact
 * @param {boolean} [opts.writeAudit] - append redaction audit metadata when findings exist
 * @param {string} [opts.cwd] - audit root when opts.writeAudit is true
 * @param {string} [opts.runId] - audit run id when opts.writeAudit is true
 * @param {Date|string} [opts.now] - deterministic timestamp for tests
 * @returns {string} HTML document
 */
export function renderHtml(reportData, opts = {}) {
  return renderHtmlArtifact(reportData, opts).html;
}

export function renderHtmlArtifact(reportData, opts = {}) {
  const { slug, generatedAt, baseUrl, captures } = reportData;
  const counts = countByVerdict(captures);

  const cards = captures.map((c, i) => cardHtml(c, i)).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual-QA report — ${esc(slug)}</title>
  <style>${INLINE_CSS}</style>
</head>
<body>
  <header>
    <h1>Visual-QA report</h1>
    <div class="meta">
      <span><strong>Slug:</strong> ${esc(slug)}</span>
      <span><strong>Base URL:</strong> ${esc(baseUrl || "(unknown)")}</span>
      <span><strong>Generated:</strong> ${esc(generatedAt || "")}</span>
    </div>
    <div class="counts">
      ${badge("pass", counts.pass)} ${badge("warn", counts.warn)} ${badge("fail", counts.fail)} ${badge("new", counts.new)} ${badge("removed", counts.removed)}
    </div>
  </header>
  <main>
    ${cards || '<p class="empty">No captures in this run.</p>'}
  </main>
  <div id="lightbox" hidden>
    <button id="lb-close" aria-label="Close">✕</button>
    <button id="lb-prev" aria-label="Previous">‹</button>
    <button id="lb-next" aria-label="Next">›</button>
    <img id="lb-img" alt="">
    <div id="lb-caption"></div>
  </div>
  <script>${INLINE_JS}</script>
</body>
</html>`;
  const checked = redactArtifactContent({
    artifactPath: opts.artifactPath ?? "report.html",
    content: html,
    config: opts.config ?? {},
    now: opts.now ?? generatedAt ?? new Date(),
  });
  const redactionAudit = opts.writeAudit
    ? writeRedactionAudit({
        cwd: opts.cwd ?? process.cwd(),
        runId: opts.runId ?? "visual-qa",
        config: opts.config ?? {},
        artifactPath: opts.artifactPath ?? "report.html",
        findings: checked.findings,
        now: opts.now ?? generatedAt ?? new Date(),
      })
    : null;
  assertRedactionAllowed(checked);
  return {
    html: checked.content,
    findings: checked.findings,
    audit: checked.audit,
    redactionAudit,
  };
}

function cardHtml(c, idx) {
  const v = c.verdict || "pass";
  const conf = c.confidence || "path";
  const before = esc(c.screenshots?.before || "");
  const after = esc(c.screenshots?.after || "");
  const baseline = esc(c.screenshots?.baseline || "");
  const hasBaseline = !!c.hasBaseline && baseline;
  const frames = [
    { label: "before", src: before },
    { label: "after", src: after },
    ...(hasBaseline ? [{ label: "baseline", src: baseline }] : []),
  ];
  const frameJson = JSON.stringify(frames);
  return `<article class="card v-${v}" data-idx="${idx}" data-frames='${esc(frameJson)}'>
  <header>
    <span class="verdict v-${v}">${v}</span>
    <span class="conf c-${conf}" title="match confidence">${conf}</span>
    <code class="sel">${esc(c.selector || "")}</code>
    <span class="action">${esc(c.action || "")}</span>
  </header>
  <div class="pair">
    <figure>
      <figcaption>before</figcaption>
      ${before ? `<img loading="lazy" data-frame="before" data-card="${idx}" src="${before}" alt="before ${esc(c.selector || "")}">` : '<div class="missing">no screenshot</div>'}
    </figure>
    <figure>
      <figcaption>after</figcaption>
      ${after ? `<img loading="lazy" data-frame="after" data-card="${idx}" src="${after}" alt="after ${esc(c.selector || "")}">` : '<div class="missing">no screenshot</div>'}
    </figure>
  </div>
  ${hasBaseline ? `<div class="pair baseline-pair">
    <figure>
      <figcaption>baseline</figcaption>
      <img loading="lazy" data-frame="baseline" data-card="${idx}" src="${baseline}" alt="baseline ${esc(c.selector || "")}">
    </figure>
    <figure>
      <figcaption>current</figcaption>
      <img loading="lazy" data-frame="current" data-card="${idx}" src="${after}" alt="current ${esc(c.selector || "")}">
    </figure>
  </div>` : ""}
  ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ""}
  <footer>
    <span class="page">${esc(c.pageSlug || "")}</span>
    <code class="eid">${esc(c.elementId || "")}</code>
  </footer>
</article>`;
}

function countByVerdict(captures) {
  const counts = { pass: 0, warn: 0, fail: 0, new: 0, removed: 0 };
  for (const c of captures) {
    const v = c.verdict || "pass";
    if (counts[v] !== undefined) counts[v]++;
  }
  return counts;
}

function badge(kind, n) {
  return `<span class="badge b-${kind}">${kind}: ${n}</span>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const INLINE_CSS = `
:root {
  --bg: #fafafa; --fg: #222; --muted: #666; --card: #fff; --border: #e5e5e5;
  --pass: #16a34a; --warn: #ca8a04; --fail: #dc2626; --new: #2563eb; --removed: #6b7280;
}
* { box-sizing: border-box; }
body { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 1.5rem; }
header h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
header .meta { color: var(--muted); display: flex; gap: 1.5rem; flex-wrap: wrap; font-size: .85rem; margin-bottom: .75rem; }
header .counts { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.badge { padding: .25rem .6rem; border-radius: 999px; font-size: .8rem; background: #fff; border: 1px solid var(--border); }
.badge.b-pass    { color: var(--pass);    border-color: var(--pass); }
.badge.b-warn    { color: var(--warn);    border-color: var(--warn); }
.badge.b-fail    { color: var(--fail);    border-color: var(--fail); }
.badge.b-new     { color: var(--new);     border-color: var(--new); }
.badge.b-removed { color: var(--removed); border-color: var(--removed); }
main { display: grid; grid-template-columns: 1fr; gap: 1rem; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
.card.v-fail    { border-left: 3px solid var(--fail); }
.card.v-warn    { border-left: 3px solid var(--warn); }
.card.v-pass    { border-left: 3px solid var(--pass); }
.card.v-new     { border-left: 3px solid var(--new); }
.card.v-removed { border-left: 3px solid var(--removed); }
.card > header { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; }
.verdict { padding: .15rem .5rem; border-radius: 4px; font-size: .75rem; text-transform: uppercase; font-weight: 600; color: #fff; background: var(--muted); }
.verdict.v-pass    { background: var(--pass); }
.verdict.v-warn    { background: var(--warn); }
.verdict.v-fail    { background: var(--fail); }
.verdict.v-new     { background: var(--new); }
.verdict.v-removed { background: var(--removed); }
.conf { font-size: .7rem; padding: .1rem .4rem; border-radius: 3px; background: var(--border); color: var(--muted); }
.conf.c-explicit { background: #dcfce7; color: #166534; }
.conf.c-semantic { background: #fef3c7; color: #92400e; }
.conf.c-path     { background: #fee2e2; color: #991b1b; }
.sel { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .8rem; color: var(--muted); }
.action { font-size: .75rem; color: var(--muted); }
.pair, .baseline-pair { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-bottom: .5rem; }
.baseline-pair { border-top: 1px dashed var(--border); padding-top: .5rem; }
figure { margin: 0; }
figcaption { font-size: .75rem; color: var(--muted); margin-bottom: .25rem; }
.card img { width: 100%; height: auto; max-height: 320px; object-fit: contain; background: #f0f0f0; border-radius: 4px; cursor: zoom-in; display: block; }
.missing { background: #f0f0f0; border-radius: 4px; padding: 2rem; text-align: center; color: var(--muted); font-size: .8rem; }
.notes { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 4px; padding: .5rem .75rem; color: #92400e; font-size: .85rem; margin: .5rem 0; }
.card > footer { display: flex; justify-content: space-between; color: var(--muted); font-size: .75rem; margin-top: .5rem; }
.eid { font-family: ui-monospace, SFMono-Regular, monospace; }
.empty { color: var(--muted); text-align: center; padding: 3rem; }
#lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.9); display: flex; align-items: center; justify-content: center; z-index: 9999; }
#lightbox[hidden] { display: none; }
#lightbox img { max-width: 90vw; max-height: 80vh; object-fit: contain; }
#lightbox button { position: fixed; background: rgba(255,255,255,.1); color: #fff; border: 0; font-size: 2rem; width: 3rem; height: 3rem; border-radius: 999px; cursor: pointer; }
#lb-close { top: 1rem; right: 1rem; }
#lb-prev  { left: 1rem; }
#lb-next  { right: 1rem; }
#lb-caption { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); color: #fff; font-size: .85rem; background: rgba(0,0,0,.5); padding: .25rem .75rem; border-radius: 4px; }
`;

const INLINE_JS = `
(function() {
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCap = document.getElementById('lb-caption');
  let cardFrames = [];
  let curIdx = 0;

  function show(i) {
    if (!cardFrames.length) return;
    curIdx = (i + cardFrames.length) % cardFrames.length;
    const f = cardFrames[curIdx];
    lbImg.src = f.src;
    lbCap.textContent = f.label + '  (' + (curIdx+1) + '/' + cardFrames.length + ')';
  }

  document.querySelectorAll('.card img').forEach(img => {
    img.addEventListener('click', e => {
      const card = e.target.closest('.card');
      const data = card.getAttribute('data-frames');
      if (!data) return;
      try { cardFrames = JSON.parse(data); } catch { return; }
      const clickedFrame = e.target.getAttribute('data-frame');
      const startIdx = cardFrames.findIndex(f => f.label === clickedFrame);
      lb.hidden = false;
      show(startIdx >= 0 ? startIdx : 0);
    });
  });

  document.getElementById('lb-close').addEventListener('click', () => lb.hidden = true);
  document.getElementById('lb-prev').addEventListener('click', () => show(curIdx - 1));
  document.getElementById('lb-next').addEventListener('click', () => show(curIdx + 1));
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') lb.hidden = true;
    else if (e.key === 'ArrowLeft') show(curIdx - 1);
    else if (e.key === 'ArrowRight') show(curIdx + 1);
  });
})();
`;
