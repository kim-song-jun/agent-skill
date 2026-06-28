# /harness-view Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/harness-view`'s flat tabbed-accordion HTML with a master-detail dashboard (sidebar search/grouping + focused reading pane + TOC, overview-home as landing) and fix the markdown fidelity defects — all in a dependency-zero single `index.html`.

**Architecture:** Node pre-renders every artifact (run state, tasks, specs) to HTML and embeds each as a hidden `<section data-doc-id>`; vanilla inline JS toggles panes, filters the sidebar, and routes by URL hash. The markdown engine moves to its own module and gains heading anchors, task checkboxes, nested lists, and code-fence language labels. The `bin/render.mjs` entry point and `writeDashboard()` signature are unchanged, so `/agent-all` checkpoint regeneration and on-demand `/harness-view` keep working untouched.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test` + `node:assert/strict`, zero runtime dependencies, vanilla browser JS, inline CSS.

**Spec:** `docs/superpowers/specs/2026-06-29-harness-view-dashboard-redesign-design.md` (KO: `.ko.md`).

## Global Constraints

- **Dependency-zero, single file:** output is one self-contained `.agent-skill/html/index.html`. No external libs, no build step, no network, no sidecar assets. Markdown engine runs server-side only (Node); the browser ships no parser.
- **Entry points unchanged:** `bin/render.mjs` and `writeDashboard({ cwd, now })` keep their current signatures and the output path `.agent-skill/html/index.html` (atomic write via tmp + rename).
- **Security posture preserved:** every artifact value is HTML-escaped via `escapeHtml`; only benign hrefs survive `safeHref` (no `javascript:`/`data:`/`vbscript:`).
- **Data sources fixed:** run = `.agent-all-state.json`; tasks = `.agent-skill/tasks/` (fallback `docs/tasks/`); specs = `docs/superpowers/specs/`. No new sources.
- **Test runner:** `node --test tests/harness-view/` from the repo root. ESM imports use relative paths.
- **Module layout:** markdown engine in `plugins/harness-floor/skills/harness-view/lib/markdown.mjs`; collection + dashboard assembly + inline CSS/JS in `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs`.

---

## File Structure

- **Create** `plugins/harness-floor/skills/harness-view/lib/markdown.mjs` — the markdown engine: `escapeHtml`, `safeHref`, `inlineMd`, `slugify`, `renderMarkdown` (single pass → `{html, toc}`), `mdToHtml` (string wrapper), `parseFrontmatter`. One responsibility: markdown → HTML + heading index.
- **Modify** `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs` — remove the engine (now imported from `markdown.mjs`); keep `collectArtifacts`; add `familyOf` + `deriveDocMeta`; replace the tabbed `renderDashboard` with the three-column shell (`renderSidebar`, `renderOverviewHome`, `renderReadingPanes`, `renderTocPanes`); keep `renderRun` markup intact (reused in the overview-home); add the new `CSS` and `CLIENT_JS` constants; keep `writeDashboard`.
- **Unchanged** `plugins/harness-floor/skills/harness-view/bin/render.mjs` — still `import { writeDashboard } from "../lib/harness-html.mjs"`.
- **Modify** `tests/harness-view/harness-html.test.mjs` — repoint engine imports to `markdown.mjs`; add tests for anchors/TOC, checkboxes, nested lists, code language, soft-wrap, `familyOf`, `deriveDocMeta`, sidebar/overview/reading-pane assembly; update the two assertions that the redesign changes (heading-id, dashboard structure).
- **Modify** `plugins/harness-floor/skills/harness-view/SKILL.md` — refresh the "what it shows / layout" description.

### Shared interfaces (used across tasks — names are fixed)

```
// markdown.mjs
escapeHtml(s) -> string
safeHref(url) -> string|null
inlineMd(text) -> string
slugify(s) -> string
renderMarkdown(md) -> { html: string, toc: Array<{ level:number, text:string, id:string }> }
mdToHtml(md) -> string              // === renderMarkdown(md).html
parseFrontmatter(md) -> { meta: object, body: string }

// harness-html.mjs
FAMILIES: string[]                  // ordered known-prefix list
familyOf(slug) -> string            // a family from FAMILIES, else "misc"
deriveDocMeta(kind, file, md) -> {  // kind = "task" | "spec"
  id: string,        // e.g. "spec:2026-06-29-thing"  (kind + ":" + slug)
  file: string, title: string, date: string,
  family: string, lang: "KO"|"EN", status: string, body: string
}
collectArtifacts({ cwd, now }) -> { generatedAt, project, run, taskIndex, tasks, specs }
                                    // tasks/specs are [{ name, md }]  (unchanged)
renderRun(run) -> string            // unchanged markup (ph-done/ph-current/empty)
renderSidebar(a) -> string
renderOverviewHome(a) -> string
renderReadingPanes(a) -> string     // home pane + one .doc-pane[data-doc-id] per task/spec
renderTocPanes(a) -> string         // one .toc-pane[data-doc-id] per doc + home
renderDashboard(a) -> string
writeDashboard({ cwd, now }) -> string   // path; unchanged behavior
```

---

## Task 1: Extract the markdown engine into `markdown.mjs` (pure move + regression)

Move the existing engine out of `harness-html.mjs` verbatim so the redesign builds on a focused module. No behavior change yet.

**Files:**
- Create: `plugins/harness-floor/skills/harness-view/lib/markdown.mjs`
- Modify: `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs` (remove engine fns, import them)
- Test: `tests/harness-view/harness-html.test.mjs` (repoint engine imports)

**Interfaces:**
- Produces: `escapeHtml`, `safeHref` (internal), `inlineMd`, `mdToHtml`, `parseFrontmatter` from `markdown.mjs`.

- [ ] **Step 1: Create `markdown.mjs` with the existing engine, copied verbatim**

Copy these functions out of the current `harness-html.mjs` into the new file, unchanged: `escapeHtml`, `safeHref`, `inlineMd`, `isTableSep`, `splitRow`, `mdToHtml`, `parseFrontmatter`. Export the public ones.

```js
// markdown.mjs — markdown → HTML for the harness view. Dependency-free, escaping-safe.
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeHref(url) {
  const u = String(url).trim();
  if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(u) && !/^javascript:/i.test(u)) return escapeHtml(u);
  return null;
}
export function inlineMd(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(escapeHtml(c)); return ` ${codes.length - 1} `; });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => { const href = safeHref(url); return href ? `<a href="${href}">${label}</a>` : label; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/ (\d+) /g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}
function isTableSep(line) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line); }
function splitRow(line) { return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()); }

export function mdToHtml(md) {
  // ← paste the CURRENT mdToHtml body verbatim from harness-html.mjs (no changes in this task)
}
export function parseFrontmatter(md) {
  // ← paste the CURRENT parseFrontmatter body verbatim from harness-html.mjs
}
```

> Note: the existing `inlineMd` uses ` ${n} ` (space-padded) sentinels — keep it exactly; the regression test at `tests/harness-view/harness-html.test.mjs` ("digits in prose are NOT mangled") guards this.

- [ ] **Step 2: In `harness-html.mjs`, delete the moved fns and import them**

Remove `escapeHtml`, `safeHref`, `inlineMd`, `isTableSep`, `splitRow`, `mdToHtml`, `parseFrontmatter` from `harness-html.mjs`. At the top add:

```js
import { escapeHtml, inlineMd, mdToHtml, parseFrontmatter } from "./markdown.mjs";
```

(Leave `renderRun`, `renderDoc`, `renderList`, `renderDashboard`, `collectArtifacts`, `writeDashboard`, the `CSS` const, and the node:fs/path imports in place for now.)

- [ ] **Step 3: Repoint the test imports**

In `tests/harness-view/harness-html.test.mjs`, split the import so engine fns come from `markdown.mjs`:

```js
import {
  mdToHtml, inlineMd, escapeHtml, parseFrontmatter,
} from "../../plugins/harness-floor/skills/harness-view/lib/markdown.mjs";
import {
  collectArtifacts, renderDashboard, writeDashboard,
} from "../../plugins/harness-floor/skills/harness-view/lib/harness-html.mjs";
```

- [ ] **Step 4: Run the full existing suite — pure-move regression**

Run: `node --test tests/harness-view/`
Expected: PASS — all current tests green (this task changed no behavior, only file location).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/markdown.mjs \
        plugins/harness-floor/skills/harness-view/lib/harness-html.mjs \
        tests/harness-view/harness-html.test.mjs
git commit -m "refactor(harness-view): extract markdown engine into markdown.mjs"
```

---

## Task 2: Heading anchors + `renderMarkdown` returning `{ html, toc }`

Single-pass render that slugs every heading into an `id` and collects an h2/h3 table of contents from the same pass (ids are guaranteed to match).

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/markdown.mjs`
- Test: `tests/harness-view/harness-html.test.mjs`

**Interfaces:**
- Produces: `slugify(s) -> string`; `renderMarkdown(md) -> { html, toc }`; `mdToHtml(md)` becomes `renderMarkdown(md).html`.

- [ ] **Step 1: Write failing tests for anchors, TOC, and slug dedup**

```js
import { renderMarkdown, slugify } from "../../plugins/harness-floor/skills/harness-view/lib/markdown.mjs";

test("slugify lowercases and hyphenates, keeps hangul", () => {
  assert.equal(slugify("Goal & Scope"), "goal-scope");
  assert.equal(slugify("재설정 토큰"), "재설정-토큰");
});

test("renderMarkdown gives headings ids and collects an h2/h3 toc", () => {
  const { html, toc } = renderMarkdown("# Title\n\n## Goal\ntext\n\n### Detail\nmore\n\n# Other H1");
  assert.match(html, /<h2 id="goal">Goal<\/h2>/);
  assert.match(html, /<h3 id="detail">Detail<\/h3>/);
  assert.deepEqual(toc, [
    { level: 2, text: "Goal", id: "goal" },
    { level: 3, text: "Detail", id: "detail" },
  ]); // h1 is excluded from the toc
});

test("renderMarkdown dedupes repeated heading slugs", () => {
  const { html } = renderMarkdown("## Notes\n\n## Notes");
  assert.match(html, /<h2 id="notes">Notes<\/h2>/);
  assert.match(html, /<h2 id="notes-2">Notes<\/h2>/);
});

test("mdToHtml is the html string of renderMarkdown", () => {
  assert.equal(mdToHtml("## A"), renderMarkdown("## A").html);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "renderMarkdown|slugify|mdToHtml is the html"`
Expected: FAIL — `renderMarkdown`/`slugify` not exported.

- [ ] **Step 3: Implement `slugify`, convert `mdToHtml` body into `renderMarkdown`, add the wrapper**

In `markdown.mjs`, add `slugify`, rename the current `mdToHtml` body into `renderMarkdown` that returns `{ html, toc }`, and make `mdToHtml` a thin wrapper. Change ONLY the heading branch and the return; leave every other branch identical to Task 1.

```js
export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/(^-|-$)/g, "");
}

export function renderMarkdown(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const out = []; const toc = []; const seen = {};
  let i = 0; let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inlineMd).join(" ")}</p>`); para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    // ... (fenced code, blank, hr, table, blockquote, list branches stay AS-IS from Task 1) ...
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
    // ... rest unchanged ...
    para.push(line.trim()); i++;
  }
  flushPara();
  return { html: out.join("\n"), toc };
}

export function mdToHtml(md) { return renderMarkdown(md).html; }
```

> The paragraph `flushPara` here uses `.join(" ")` — that is the Task 6 soft-wrap change. To keep THIS task green against the current "headings and lists" test (which has no multi-line paragraph), `.join(" ")` is safe; the `<br>`→space behavior is formally tested in Task 6.

- [ ] **Step 4: Update the existing heading assertion that anchors now change**

In the existing "headings and lists" test, the `<h1>` now carries an id:

```js
test("headings and lists", () => {
  const h = mdToHtml("# Title\n\n- one\n- two\n\n1. a\n2. b");
  assert.match(h, /<h1 id="title">Title<\/h1>/);            // ← was /<h1>Title<\/h1>/
  assert.match(h, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(h, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
});
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS — new anchor/TOC tests green, updated heading test green, all prior engine/dashboard tests still green.

- [ ] **Step 6: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/markdown.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): heading anchors + renderMarkdown toc"
```

---

## Task 3: Task checkboxes render as real checkboxes

`- [ ]` / `- [x]` become disabled `<input type="checkbox">`, fixing the `[x]`/`[]` literal leak.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/markdown.mjs` (the list branch of `renderMarkdown`)
- Test: `tests/harness-view/harness-html.test.mjs`

- [ ] **Step 1: Write failing test**

```js
test("task list items render as disabled checkboxes", () => {
  const { html } = renderMarkdown("- [x] done item\n- [ ] open item");
  assert.match(html, /<li class="task-li"><label class="task"><input type="checkbox" disabled checked> done item<\/label><\/li>/);
  assert.match(html, /<li class="task-li"><label class="task"><input type="checkbox" disabled > open item<\/label><\/li>/);
  assert.doesNotMatch(html, /\[x\]/);
  assert.doesNotMatch(html, /\[ \]/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "checkboxes"`
Expected: FAIL — current output keeps literal `[x]`/`[ ]`.

- [ ] **Step 3: Implement checkbox detection inside the list branch**

In `renderMarkdown`'s list branch, before pushing each `<li>`, check for a leading `[ ]`/`[x]`:

```js
// inside the list-item loop, `content` is the text after the marker:
const cb = content.match(/^\[([ xX])\]\s+(.*)$/);
if (cb) {
  const checked = cb[1].toLowerCase() === "x";
  out_li.push(`<li class="task-li"><label class="task"><input type="checkbox" disabled ${checked ? "checked" : ""}> ${inlineMd(cb[2])}</label></li>`);
} else {
  out_li.push(`<li>${inlineMd(content)}</li>`);
}
```

(Use whatever the local list-accumulator variable is named; the existing branch builds `<li>` items then wraps them in `<ul>`/`<ol>`.)

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS — checkbox test green; the plain "headings and lists" test (non-checkbox bullets) still green.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/markdown.mjs tests/harness-view/harness-html.test.mjs
git commit -m "fix(harness-view): render task checkboxes instead of literal [x]"
```

---

## Task 4: Nested lists by indentation

Indent-stack tracking so sub-items nest correctly instead of flattening.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/markdown.mjs` (replace the flat list branch)
- Test: `tests/harness-view/harness-html.test.mjs`

- [ ] **Step 1: Write failing test**

```js
test("nested list items nest by indentation", () => {
  const { html } = renderMarkdown("- a\n  - a1\n  - a2\n- b");
  assert.match(html, /<ul><li>a<\/li><ul><li>a1<\/li><li>a2<\/li><\/ul><li>b<\/li><\/ul>/);
});

test("flat single-level list is unchanged", () => {
  const { html } = renderMarkdown("- one\n- two");
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "nested list|flat single-level"`
Expected: FAIL on nesting (current branch flattens all items to one `<ul>`).

- [ ] **Step 3: Replace the list branch with an indent-stack implementation**

```js
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
```

> This branch folds in Task 3's checkbox logic, so it supersedes the Task 3 edit (same file, same branch). Keep the Task 3 test — it now passes through this code path.

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS — nested + flat + checkbox tests green; "headings and lists" green.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/markdown.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): indentation-aware nested lists"
```

---

## Task 5: Fenced-code language label

A fence's language hint (` ```python `) becomes an uppercase badge on the code block.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/markdown.mjs` (the fenced-code branch)
- Test: `tests/harness-view/harness-html.test.mjs`

- [ ] **Step 1: Write failing test**

```js
test("fenced code with a language gets a label badge; body still escaped", () => {
  const { html } = renderMarkdown("```python\nx = a < b\n```");
  assert.match(html, /<div class="codeblock"><span class="code-lang">python<\/span><pre><code>x = a &lt; b<\/code><\/pre><\/div>/);
});

test("fenced code without a language has no label", () => {
  const { html } = renderMarkdown("```\nplain\n```");
  assert.match(html, /<div class="codeblock"><pre><code>plain<\/code><\/pre><\/div>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "fenced code with a language|without a language"`
Expected: FAIL — current branch emits a bare `<pre><code>` with no wrapper/label.

- [ ] **Step 3: Implement the labelled fenced-code branch**

```js
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
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS — both new tests green; the existing "fenced code is verbatim + escaped" test still green (its `/<pre><code>…<\/code><\/pre>/` substring is still present inside the wrapper).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/markdown.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): code-fence language label"
```

---

## Task 6: Soft-wrap paragraphs (CommonMark) — single newline → space

Prose lines in a paragraph join with a space, not `<br>`, matching standard markdown. (The `renderMarkdown` written in Task 2 already uses `.join(" ")`; this task adds the regression test that locks it and confirms blockquotes still use `<br>`.)

**Files:**
- Test: `tests/harness-view/harness-html.test.mjs`
- Modify (only if needed): `plugins/harness-floor/skills/harness-view/lib/markdown.mjs`

- [ ] **Step 1: Write the test that pins soft-wrap behavior**

```js
test("paragraph soft wrap joins lines with a space, not <br>", () => {
  const { html } = renderMarkdown("line one\nline two");
  assert.match(html, /<p>line one line two<\/p>/);
  assert.doesNotMatch(html, /<br>/);
});

test("blockquote still joins its lines with <br>", () => {
  const { html } = renderMarkdown("> q1\n> q2");
  assert.match(html, /<blockquote>q1<br>q2<\/blockquote>/);
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test tests/harness-view/ --test-name-pattern "soft wrap|blockquote still"`
Expected: PASS if Task 2 already converted `flushPara` to `.join(" ")` and left the blockquote branch on `<br>`. If the paragraph test FAILS (still `<br>`), apply Step 3.

- [ ] **Step 3 (only if Step 2 failed): switch the paragraph join to a space**

In `renderMarkdown`, the paragraph flush must be:

```js
const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inlineMd).join(" ")}</p>`); para = []; } };
```

Leave the blockquote branch joining with `<br>`.

- [ ] **Step 4: Run the full suite**

Run: `node --test tests/harness-view/`
Expected: PASS — all engine tests green.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/markdown.mjs tests/harness-view/harness-html.test.mjs
git commit -m "test(harness-view): pin commonmark soft-wrap behavior"
```

---

## Task 7: Per-document metadata — `familyOf` + `deriveDocMeta`

Derive title, date, topic family, language, status, and a stable id from each artifact.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs`
- Test: `tests/harness-view/harness-html.test.mjs`

**Interfaces:**
- Produces: `FAMILIES`, `familyOf(slug)`, `deriveDocMeta(kind, file, md)`.

- [ ] **Step 1: Write failing tests**

```js
import { familyOf, deriveDocMeta } from "../../plugins/harness-floor/skills/harness-view/lib/harness-html.mjs";

test("familyOf matches known prefixes, else misc", () => {
  assert.equal(familyOf("2026-05-18-agent-all-codex-impl-spec"), "agent-all");
  assert.equal(familyOf("2026-05-17-visual-qa-design"), "visual-qa");
  assert.equal(familyOf("2026-06-11-something-unknown"), "misc");
});

test("deriveDocMeta extracts title, date, family, lang, id, status", () => {
  const md = "---\ndisplay_id: T-1\nstatus: running\n---\n# First task\n\nbody";
  const m = deriveDocMeta("task", "T-1-first.md", md);
  assert.equal(m.id, "task:T-1-first");
  assert.equal(m.title, "First task");
  assert.equal(m.status, "running");
  assert.match(m.body, /body/);

  const spec = deriveDocMeta("spec", "2026-06-29-thing.ko.md", "# 한글 제목\n\n본문");
  assert.equal(spec.id, "spec:2026-06-29-thing.ko");
  assert.equal(spec.title, "한글 제목");
  assert.equal(spec.date, "2026-06-29");
  assert.equal(spec.lang, "KO");
});

test("deriveDocMeta falls back to the file slug when there is no h1", () => {
  const m = deriveDocMeta("spec", "2026-01-01-no-title.md", "no heading here");
  assert.equal(m.title, "2026-01-01-no-title");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "familyOf|deriveDocMeta"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement `FAMILIES`, `familyOf`, `deriveDocMeta`**

Add to `harness-html.mjs` (it already imports `parseFrontmatter` from `markdown.mjs`):

```js
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
    status: meta.status || meta.display_id ? (meta.status || "") : (meta.status || ""),
  };
}
```

> `status` is `meta.status` when present, else `""` (specs have no status). Simplify the ternary to `status: meta.status || ""`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/harness-html.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): per-document metadata derivation"
```

---

## Task 8: Sidebar — search box + grouped navigation

Build the left nav: a search input, then Run / Tasks (with status badges) / Specs (grouped by family with counts), each row labelled by extracted title.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs`
- Test: `tests/harness-view/harness-html.test.mjs`

**Interfaces:**
- Consumes: `deriveDocMeta`, `escapeHtml`. Produces: `renderSidebar(a) -> string`.

- [ ] **Step 1: Write failing test**

```js
import { renderSidebar } from "../../plugins/harness-floor/skills/harness-view/lib/harness-html.mjs";

test("renderSidebar has a search box, run/tasks/specs sections, grouped specs, titles not filenames", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderSidebar(a);
  assert.match(html, /<input[^>]*class="hv-search"/);
  assert.match(html, /data-doc-id="home"/);                 // Run/overview row
  assert.match(html, /data-doc-id="task:T-1"/);             // task row by id
  assert.match(html, /First task/);                          // task title, not "T-1.md"
  assert.match(html, /class="hv-group"[^>]*>/);             // a spec family group
  assert.match(html, /Thing spec/);                          // spec title, not the filename
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "renderSidebar"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement `renderSidebar`**

```js
function navRow(meta, label, extra = "") {
  const text = (meta.title || meta.family || meta.body || "").toLowerCase();
  return `<a class="hv-row" data-doc-id="${escapeHtml(meta.id)}" data-search="${escapeHtml((meta.title + " " + meta.family).toLowerCase())}" title="${escapeHtml(meta.file)}">`
    + `<span class="hv-row-t">${escapeHtml(label)}</span><span class="hv-row-m">${extra}</span></a>`;
}

export function renderSidebar(a) {
  const tasks = (a.tasks || []).map((t) => deriveDocMeta("task", t.name, t.md));
  const specs = (a.specs || []).map((s) => deriveDocMeta("spec", s.name, s.md));
  const taskRows = tasks.map((m) => navRow(m, m.title,
    `<code>${escapeHtml(m.status ? m.id.split(":")[1] : m.id.split(":")[1])}</code> ${badge(m.status)}`)).join("");
  const groups = {};
  for (const m of specs) (groups[m.family] = groups[m.family] || []).push(m);
  const specGroups = Object.entries(groups).sort((x, y) => y[1].length - x[1].length).map(([fam, items]) =>
    `<div class="hv-group"><div class="hv-group-h">${escapeHtml(fam)} <span class="hv-group-n">${items.length}</span></div>`
    + items.sort((p, q) => (p.date < q.date ? -1 : 1)).map((m) =>
        navRow(m, m.title, `<span class="hv-date">${escapeHtml(m.date)}</span> <span class="verdict outline">${m.lang}</span>`)).join("")
    + `</div>`).join("");
  return `<aside class="hv-sidebar">`
    + `<input class="hv-search" type="search" placeholder="🔍  검색 (제목·내용)" aria-label="search">`
    + `<div class="hv-sec">Run</div>`
    + `<a class="hv-row" data-doc-id="home" data-search="run overview"><span class="hv-row-t">현재 런 / 개요</span></a>`
    + `<div class="hv-sec">Tasks <span class="hv-group-n">${tasks.length}</span></div>${taskRows || `<p class="hv-empty">None</p>`}`
    + `<div class="hv-sec">Specs <span class="hv-group-n">${specs.length}</span></div>${specGroups || `<p class="hv-empty">None</p>`}`
    + `</aside>`;
}
```

Add a small `badge` helper near `renderRun` if one does not already exist:

```js
const STATUS_CLASS = { running: "v-new", done: "v-pass", aborted: "v-fail", todo: "v-todo" };
function badge(status) { return status ? `<span class="verdict ${STATUS_CLASS[status] || "v-removed"}">${escapeHtml(status)}</span>` : ""; }
```

(The current file already defines `STATUS_CLASS`; reuse it and add the `todo` entry. Define `badge` once.)

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/harness-html.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): grouped, searchable sidebar"
```

---

## Task 9: Overview-home (default landing)

A stat-card landing: Run card (reusing `renderRun`), Tasks rollup by status, Specs summary.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs`
- Test: `tests/harness-view/harness-html.test.mjs`

**Interfaces:**
- Consumes: `renderRun`, `deriveDocMeta`. Produces: `renderOverviewHome(a) -> string`.

- [ ] **Step 1: Write failing test**

```js
import { renderOverviewHome } from "../../plugins/harness-floor/skills/harness-view/lib/harness-html.mjs";

test("renderOverviewHome shows run, tasks rollup, and specs summary", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderOverviewHome(a);
  assert.match(html, /ship the thing/);              // run task (via renderRun)
  assert.match(html, /RUN-9/);                         // run id
  assert.match(html, /1\s*running/i);                  // tasks rollup (fixture: one running task)
  assert.match(html, /Specs/);                          // specs summary card
  assert.match(html, /class="hv-stat"/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "renderOverviewHome"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement `renderOverviewHome`**

```js
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
```

> `renderRun` must keep its current markup (the `ph-done`/`ph-current` timeline and the `No active` empty state) — the existing "phase timeline" and "no run state" tests assert it and now exercise it through the overview-home.

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/harness-html.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): overview-home landing"
```

---

## Task 10: Reading panes + TOC panes (pre-rendered, hidden)

One hidden `<section>` per document (title + meta + rendered body) and one hidden `<nav>` per document holding its TOC, both keyed by `data-doc-id`.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs`
- Test: `tests/harness-view/harness-html.test.mjs`

**Interfaces:**
- Consumes: `renderMarkdown` (import it), `deriveDocMeta`, `renderOverviewHome`. Produces: `renderReadingPanes(a)`, `renderTocPanes(a)`.

- [ ] **Step 1: Add the `renderMarkdown` import and write failing tests**

```js
test("renderReadingPanes has a visible home pane and one hidden doc pane per artifact", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderReadingPanes(a);
  assert.match(html, /<section class="hv-pane hv-active" data-doc-id="home">/);
  assert.match(html, /<section class="hv-pane" data-doc-id="task:T-1">/);
  assert.match(html, /<section class="hv-pane" data-doc-id="spec:2026-06-29-thing">/);
  assert.match(html, /Body for <strong>thing<\/strong>/);   // spec body rendered
  assert.match(html, /First task/);                          // task body rendered
});

test("renderTocPanes emits a toc nav per doc with anchor links", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderTocPanes(a);
  assert.match(html, /<nav class="hv-toc" data-doc-id="task:T-1">/);
  assert.match(html, /<a href="#goal">Goal<\/a>/);           // T-1 fixture has "## Goal"
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "renderReadingPanes|renderTocPanes"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement both, plus a `tocHtml` helper**

Add `renderMarkdown` to the `markdown.mjs` import in `harness-html.mjs`. Then:

```js
function tocHtml(toc) {
  if (!toc || !toc.length) return `<p class="hv-muted">No sections</p>`;
  return `<ul class="hv-toc-list">` + toc.map((t) =>
    `<li class="toc-l${t.level}"><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`).join("") + `</ul>`;
}

function docPane(meta) {
  const { html } = renderMarkdown(meta.body);
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
    + docs.map((m) => `<nav class="hv-toc" data-doc-id="${escapeHtml(m.id)}"><div class="hv-toc-h">On this page</div>${tocHtml(renderMarkdown(m.body).toc)}</nav>`).join("\n");
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-view/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/harness-html.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): pre-rendered reading + toc panes"
```

---

## Task 11: Assemble the three-column dashboard + CSS + client JS

Wire sidebar + reading panes + TOC into the shell; add the inline CSS and the vanilla JS (selection, search, hash routing). Update the two structure assertions the redesign changes.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/lib/harness-html.mjs` (rewrite `renderDashboard`, replace `CSS`, add `CLIENT_JS`; delete the now-unused `renderDoc`/`renderList`/tab code)
- Test: `tests/harness-view/harness-html.test.mjs`

**Interfaces:**
- Consumes: `renderSidebar`, `renderReadingPanes`, `renderTocPanes`. Produces: the final `renderDashboard(a) -> string`.

- [ ] **Step 1: Update the changed structure tests**

Replace the old "renderDashboard … 3 panels" test (it asserted `id="run"/id="tasks"/id="specs"`) with the new shell contract; keep the content assertions:

```js
test("renderDashboard assembles the three-column shell with content", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderDashboard(a);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /class="hv-app"/);                       // grid shell
  assert.match(html, /class="hv-sidebar"/);                   // sidebar present
  assert.match(html, /data-doc-id="home"/);                   // home pane
  assert.match(html, /ship the thing/);                        // run task (overview-home)
  assert.match(html, /First task/);                            // task rendered in a pane
  assert.match(html, /Thing spec/);                            // spec rendered in a pane
  assert.match(html, /<script>/);                              // client JS embedded
});
```

> Keep the existing "phase timeline marks completed and current" and "no run state → friendly empty" tests unchanged — they assert `renderRun` markup, which is reused verbatim inside the overview-home and still emitted by `renderDashboard`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/harness-view/ --test-name-pattern "three-column shell"`
Expected: FAIL — current `renderDashboard` emits tabs/panels, not `hv-app`/`hv-sidebar`.

- [ ] **Step 3: Rewrite `renderDashboard` and replace assets**

Replace `renderDashboard`, delete `renderDoc`/`renderList` and the old tab `<script>`, replace the `CSS` constant, and add `CLIENT_JS`:

```js
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
```

```js
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
  function fromHash() { var m = /^#doc=(.+)$/.exec(location.hash); show(m ? decodeURIComponent(m[1]) : 'home'); }
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
```

Replace the `CSS` constant with the full stylesheet below (three-column grid, sidebar, cards, doc typography, TOC, responsive). It extends the existing tokens and the shared `.doc-body`/`.verdict` rules:

```js
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
.codeblock{position:relative;margin:.75rem 0;} .code-lang{position:absolute;top:0;right:0;font-size:.65rem;text-transform:uppercase;color:#8b9099;background:#2a2a2a;padding:.15rem .5rem;border-radius:0 6px 0 6px;}
.doc-body pre{background:#1e1e1e;color:#e6e6e6;padding:.9rem 1rem;border-radius:8px;overflow:auto;font-size:.82rem;margin:0;}
.doc-body :not(pre)>code{background:#eef0f2;border-radius:4px;padding:.05rem .35rem;font-size:.85em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;} .doc-body pre code{background:none;padding:0;}
@media (max-width:860px){
  .hv-app{grid-template-columns:1fr;} .hv-toc{display:none;} .hv-toggle{display:block;margin-left:.4rem;}
  .hv-sidebar{position:fixed;z-index:5;top:52px;bottom:0;left:0;width:280px;transform:translateX(-100%);transition:transform .15s;}
  body.hv-nav-open .hv-sidebar{transform:none;}
}
`;
```

- [ ] **Step 4: Run the full suite**

Run: `node --test tests/harness-view/`
Expected: PASS — three-column-shell test green; phase-timeline, no-run-state, collectArtifacts, writeDashboard, and all engine tests green.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/lib/harness-html.mjs tests/harness-view/harness-html.test.mjs
git commit -m "feat(harness-view): three-column dashboard shell, CSS, client JS"
```

---

## Task 12: Refresh `SKILL.md` description

Update the skill doc so "what it shows / layout" matches the new UI. Documentation-only.

**Files:**
- Modify: `plugins/harness-floor/skills/harness-view/SKILL.md`

- [ ] **Step 1: Update the "what it shows" / layout section**

Edit the relevant prose to describe: a master-detail dashboard — a searchable sidebar (Run / Tasks / Specs grouped by topic, labelled by title), a focused reading pane, and a per-document table of contents; an overview-home landing with run/tasks/specs stat cards; deep-links via `#doc=<id>`; still one dependency-free `.agent-skill/html/index.html`. Keep the invocation (`node "${CLAUDE_PLUGIN_ROOT}/skills/harness-view/bin/render.mjs"`) and the auto-regeneration note unchanged.

- [ ] **Step 2: Sanity-check the file renders as markdown (no broken fences)**

Run: `node --test tests/harness-view/`
Expected: PASS (unchanged — doc edit does not affect tests). This step just confirms nothing else was touched.

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor/skills/harness-view/SKILL.md
git commit -m "docs(harness-view): describe the redesigned dashboard"
```

---

## Task 13: Visual verification gate (global rule 17)

Render the real build with Playwright and confirm the redesign visually before declaring done. No code changes; this is the completion gate.

**Files:** none (verification only).

- [ ] **Step 1: Generate the dashboard against a realistic fixture**

Build a temp project with a run state, 2-3 tasks (one with checkboxes + a nested list + a fenced code block), and the repo's real `docs/superpowers/specs/` (50 docs) so scale is exercised. Run:

```bash
CLAUDE_PROJECT_DIR=<fixture> node plugins/harness-floor/skills/harness-view/bin/render.mjs
```

Expected: prints the `.agent-skill/html/index.html` path with no error.

- [ ] **Step 2: Screenshot the key states**

Serve the output over `http://127.0.0.1:<port>` (Playwright blocks `file://`) and capture: (a) overview-home, (b) a selected task showing real checkboxes + nested list + code language label + TOC, (c) the sidebar with an active search filter narrowing the spec list, (d) the responsive collapsed-sidebar state at ≤860px width.

- [ ] **Step 3: Confirm against the spec and report**

Verify visually: titles (not filenames) in the sidebar, specs grouped by family, checkboxes rendered (no `[x]`/`[]` leak), TOC anchors jump, search filters live, sidebar collapses on narrow width. Put the before/after screenshots inline in the completion report (global rule 16). If any state is wrong, file it as a fix against the relevant earlier task and re-run that task's tests.

- [ ] **Step 4: Final suite + release gate**

Run the full repo test suite (release gate per global rule 24), not just the harness-view tests:

```bash
node --test
```

Expected: PASS. Report the result verbatim.

---

## Self-Review

**1. Spec coverage:**
- §3 single-file / pre-render+toggle → Tasks 10 (hidden panes) + 11 (shell + JS). ✓
- §3 entry points unchanged → `bin/render.mjs` untouched; `writeDashboard` test kept (Task 11). ✓
- §4 layout (sidebar / overview-home / reading pane / TOC / responsive) → Tasks 8, 9, 10, 11 (CSS incl. `@media`). ✓
- §5 title extraction / grouping / search / deep-link → Task 7 (title+family), Task 8 (grouping+search box), Task 11 (search JS + hash routing). ✓
- §6 fidelity: checkboxes (3), nested lists (4), code language (5), heading anchors (2), soft-wrap (6). ✓
- §7 backward compat / empty states → `renderRun` kept (Tasks 9/11); writeDashboard/collectArtifacts tests kept. ✓
- §8 tests + visual verification → unit tests across Tasks 2-11; Task 13 visual gate + full suite. ✓
- §9 implementation surface (markdown.mjs, harness-html.mjs, SKILL.md) → Tasks 1-12. ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". Code blocks are concrete. The one "paste current body verbatim" in Task 1 is a deliberate pure-move instruction with the surrounding file shown, not a placeholder. ✓

**3. Type consistency:** `renderMarkdown -> {html, toc}` (Tasks 2, 10); `mdToHtml -> string` wrapper (Tasks 1-2); `deriveDocMeta(kind, file, md) -> {id,file,title,date,family,lang,status,body}` consistent (Tasks 7, 8, 9, 10); `data-doc-id` id format `kind:slug` consistent in derive (7), sidebar (8), panes (10), JS (11); `hv-active` class used by panes/tocs/rows consistently (10, 11); `badge`/`STATUS_CLASS` defined once (Task 8) and reused (9, 11). ✓

> **Cleanup note:** Task 11 deletes `renderDoc`/`renderList` (old accordion helpers) once the new shell replaces them — no dead code left (global rule 1).
