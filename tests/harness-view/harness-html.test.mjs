import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mdToHtml, inlineMd, escapeHtml, parseFrontmatter, renderMarkdown, slugify,
} from "../../plugins/harness-floor/skills/harness-view/lib/markdown.mjs";
import {
  collectArtifacts, renderDashboard, writeDashboard,
  familyOf, deriveDocMeta, renderSidebar, renderOverviewHome,
  renderReadingPanes, renderTocPanes,
} from "../../plugins/harness-floor/skills/harness-view/lib/harness-html.mjs";

test("inline: bold, inline code, link", () => {
  const h = inlineMd("a **bold** and `code` and [t](https://x.io)");
  assert.match(h, /<strong>bold<\/strong>/);
  assert.match(h, /<code>code<\/code>/);
  assert.match(h, /<a href="https:\/\/x\.io">t<\/a>/);
});

test("REGRESSION: digits in prose are NOT mangled by the code-span sentinel", () => {
  // The restore step must only touch real code placeholders, never ordinary numbers.
  const h = inlineMd("blocks for up to 12 hours, lease is 15 minutes");
  assert.match(h, /up to 12 hours/);
  assert.match(h, /15 minutes/);
  assert.doesNotMatch(h, /undefined/);
  assert.doesNotMatch(h, /<code>12<\/code>/);
});

test("escaping: html in text is neutralised (no raw tags survive)", () => {
  const h = mdToHtml("a <script>alert(1)</script> b");
  assert.doesNotMatch(h, /<script>/);
  assert.match(h, /&lt;script&gt;/);
});

test("escaping: code span content is escaped", () => {
  assert.match(inlineMd("`<b>&\"`"), /<code>&lt;b&gt;&amp;&quot;<\/code>/);
});

test("unsafe href is dropped (javascript:)", () => {
  const h = inlineMd("[x](javascript:alert(1))");
  assert.doesNotMatch(h, /href="javascript/i);
  assert.match(h, /x/);
});

test("GFM table renders to thead/tbody", () => {
  const h = mdToHtml("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
  assert.match(h, /<table>/);
  assert.match(h, /<thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead>/);
  assert.match(h, /<td>1<\/td><td>2<\/td>/);
  assert.match(h, /<td>3<\/td><td>4<\/td>/);
});

test("fenced code is verbatim + escaped, not formatted", () => {
  const h = mdToHtml("```\nif (a < b) **x**\n```");
  assert.match(h, /<pre><code>if \(a &lt; b\) \*\*x\*\*<\/code><\/pre>/);
});

test("fenced code with a language gets a label badge; body still escaped", () => {
  const { html } = renderMarkdown("```python\nx = a < b\n```");
  assert.match(html, /<div class="codeblock"><span class="code-lang">python<\/span><pre><code>x = a &lt; b<\/code><\/pre><\/div>/);
});

test("fenced code without a language has no label", () => {
  const { html } = renderMarkdown("```\nplain\n```");
  assert.match(html, /<div class="codeblock"><pre><code>plain<\/code><\/pre><\/div>/);
});

test("headings and lists", () => {
  const h = mdToHtml("# Title\n\n- one\n- two\n\n1. a\n2. b");
  assert.match(h, /<h1 id="title">Title<\/h1>/);
  assert.match(h, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(h, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
});

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

test("nested list items nest by indentation", () => {
  const { html } = renderMarkdown("- a\n  - a1\n  - a2\n- b");
  assert.match(html, /<ul><li>a<\/li><ul><li>a1<\/li><li>a2<\/li><\/ul><li>b<\/li><\/ul>/);
});

test("flat single-level list is unchanged", () => {
  const { html } = renderMarkdown("- one\n- two");
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test("task list items render as disabled checkboxes", () => {
  const { html } = renderMarkdown("- [x] done item\n- [ ] open item");
  assert.match(html, /<li class="task-li"><label class="task"><input type="checkbox" disabled checked> done item<\/label><\/li>/);
  assert.match(html, /<li class="task-li"><label class="task"><input type="checkbox" disabled > open item<\/label><\/li>/);
  assert.doesNotMatch(html, /\[x\]/);
  assert.doesNotMatch(html, /\[ \]/);
});

test("paragraph soft wrap joins lines with a space, not <br>", () => {
  const { html } = renderMarkdown("line one\nline two");
  assert.match(html, /<p>line one line two<\/p>/);
  assert.doesNotMatch(html, /<br>/);
});

test("blockquote still joins its lines with <br>", () => {
  const { html } = renderMarkdown("> q1\n> q2");
  assert.match(html, /<blockquote>q1<br>q2<\/blockquote>/);
});

test("parseFrontmatter extracts meta and body", () => {
  const { meta, body } = parseFrontmatter("---\nid: AS-1\nstatus: running\n---\n# Body\ntext");
  assert.equal(meta.id, "AS-1");
  assert.equal(meta.status, "running");
  assert.match(body, /# Body/);
  assert.doesNotMatch(body, /id: AS-1/);
});

// ── dashboard assembly over a temp project ──
function fixtureProject() {
  const dir = mkdtempSync(join(tmpdir(), "hv-"));
  writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify({
    status: "running", runId: "RUN-9", task: "ship the thing",
    updatedAt: "2026-06-29T10:00:00Z", phases: [{ phase: 0 }, { phase: 1 }],
  }));
  mkdirSync(join(dir, ".agent-skill", "tasks"), { recursive: true });
  writeFileSync(join(dir, ".agent-skill", "tasks", "index.md"), "# Task ledger\n\n| id | title |\n|---|---|\n| T-1 | first |");
  writeFileSync(join(dir, ".agent-skill", "tasks", "T-1.md"), "---\ndisplay_id: T-1\nstatus: running\n---\n# First task\n\n## Goal\nDo it.");
  mkdirSync(join(dir, "docs", "superpowers", "specs"), { recursive: true });
  writeFileSync(join(dir, "docs", "superpowers", "specs", "2026-06-29-thing.md"), "# Thing spec\n\nBody for **thing**.");
  return dir;
}

test("collectArtifacts gathers run, tasks, specs", () => {
  const dir = fixtureProject();
  const a = collectArtifacts({ cwd: dir, now: "GEN" });
  assert.equal(a.run.runId, "RUN-9");
  assert.equal(a.tasks.length, 1);
  assert.equal(a.specs.length, 1);
  assert.match(a.taskIndex, /Task ledger/);
});

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

test("phase timeline marks completed and current", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderDashboard(a);
  // phases [0,1] done; status running → phase 2 is current
  assert.match(html, /ph-done"><span class="ph-n">0<\/span>/);
  assert.match(html, /ph-done"><span class="ph-n">1<\/span>/);
  assert.match(html, /ph-current"><span class="ph-n">2<\/span>/);
});

test("no run state → friendly empty, no crash", () => {
  const dir = mkdtempSync(join(tmpdir(), "hv-"));
  const html = renderDashboard(collectArtifacts({ cwd: dir, now: "GEN" }));
  assert.match(html, /No active/);
});

test("writeDashboard writes .agent-skill/html/index.html", () => {
  const dir = fixtureProject();
  const p = writeDashboard({ cwd: dir, now: "GEN" });
  assert.ok(existsSync(p));
  assert.match(p, /\.agent-skill\/html\/index\.html$/);
  assert.match(readFileSync(p, "utf-8"), /<!DOCTYPE html>/);
});

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

test("renderOverviewHome shows run, tasks rollup, and specs summary", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderOverviewHome(a);
  assert.match(html, /ship the thing/);              // run task (via renderRun)
  assert.match(html, /RUN-9/);                         // run id
  assert.match(html, /1\s*running/i);                  // tasks rollup (fixture: one running task)
  assert.match(html, /Specs/);                          // specs summary card
  assert.match(html, /class="hv-stat"/);
});

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
  // id = "task:T-1" → aid = "task-T-1" → href = #task-T-1--goal
  assert.match(html, /<a href="#task-T-1--goal">Goal<\/a>/);
});

test("renderMarkdown with idPrefix produces prefixed heading ids in html and toc", () => {
  const { html, toc } = renderMarkdown("## Goal", { idPrefix: "spec-x" });
  assert.match(html, /id="spec-x--goal"/);
  assert.equal(toc.length, 1);
  assert.equal(toc[0].id, "spec-x--goal");
});

test("dedup-register: three headings where Notes 2 slug collides with synthesized Notes", () => {
  // Order: Notes (→ notes), Notes 2 (→ notes-2), Notes (→ notes-3, skipping the taken notes-2)
  const { html } = renderMarkdown("## Notes\n\n## Notes 2\n\n## Notes");
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  // All three must be distinct
  assert.equal(new Set(ids).size, ids.length, `duplicate id found: ${ids.join(", ")}`);
  // "Notes 2" must keep its natural slug
  assert.ok(ids.includes("notes-2"), "Notes 2 must map to notes-2");
  // The synthesized third Notes must NOT collide with notes-2
  assert.ok(!ids.filter((id) => id !== "notes-2").includes("notes-2"), "synthesized Notes must not reuse notes-2");
});

test("href single-escape: & in URL appears as &amp; once, not &amp;amp;", () => {
  const h = inlineMd("[t](http://x?a=1&b=2)");
  assert.match(h, /href="http:\/\/x\?a=1&amp;b=2"/);
  assert.doesNotMatch(h, /&amp;amp;/);
});

test("cross-pane uniqueness: two docs with '## Goal' get distinct heading ids", () => {
  // fixtureProject has task T-1 with "## Goal"; add a second spec that also has "## Goal"
  const dir = fixtureProject();
  mkdirSync(join(dir, "docs", "superpowers", "specs"), { recursive: true });
  writeFileSync(join(dir, "docs", "superpowers", "specs", "2026-01-01-other.md"), "# Other\n\n## Goal\nAlso has goal.");
  const a = collectArtifacts({ cwd: dir, now: "GEN" });
  const html = renderReadingPanes(a);
  const goalIds = [...html.matchAll(/id="([^"]*goal[^"]*)"/gi)].map((m) => m[1]);
  assert.ok(goalIds.length >= 2, `expected at least 2 goal headings, got: ${goalIds.join(", ")}`);
  assert.equal(new Set(goalIds).size, goalIds.length, `duplicate goal id found: ${goalIds.join(", ")}`);
});
