// markdown.mjs — markdown → HTML for the harness view. Dependency-free, escaping-safe.
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

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/(^-|-$)/g, "");
}

export function renderMarkdown(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const out = []; const toc = []; const seen = {};
  let i = 0;
  let para = [];
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(inlineMd).join(" ")}</p>`); para = []; }
  };
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      flushPara();
      const lang = fence[1].trim();
      const buf = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
      out.push(`<div class="codeblock">${label}<pre><code>${escapeHtml(buf.join("\n"))}</code></pre></div>`);
      continue;
    }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue; }
    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length; const text = h[2].trim();
      let id = slugify(text) || `h-${i}`;
      if (seen[id]) id = `${id}-${++seen[id]}`; else seen[id] = 1;
      if (level >= 2 && level <= 3) toc.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inlineMd(text)}</h${level}>`);
      i++; continue;
    }
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
    // list (indent-stack; ordered vs unordered per item; folds in Task 3 checkbox logic)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushPara();
      const stack = [];                       // [{ indent, tag }]
      const html = [];
      const closeTo = (indent) => { while (stack.length && stack[stack.length - 1].indent > indent) html.push(`</${stack.pop().tag}>`); };
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        const indent = m[1].replace(/\t/g, "  ").length;
        const ordered = /\d+\./.test(m[2]);
        let content = m[3];
        const top = stack[stack.length - 1];
        if (!top || indent > top.indent) { const tag = ordered ? "ol" : "ul"; html.push(`<${tag}>`); stack.push({ indent, tag }); }
        else if (indent < top.indent) closeTo(indent);
        const cb = content.match(/^\[([ xX])\]\s+(.*)$/);     // checkbox support from Task 3
        if (cb) { const checked = cb[1].toLowerCase() === "x"; html.push(`<li class="task-li"><label class="task"><input type="checkbox" disabled ${checked ? "checked" : ""}> ${inlineMd(cb[2])}</label></li>`); }
        else html.push(`<li>${inlineMd(content)}</li>`);
        i++;
      }
      while (stack.length) html.push(`</${stack.pop().tag}>`);
      out.push(html.join(""));
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return { html: out.join("\n"), toc };
}

export function mdToHtml(md) { return renderMarkdown(md).html; }

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
