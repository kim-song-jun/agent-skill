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

test("renderDashboard includes run status, task, spec, and 3 panels", () => {
  const a = collectArtifacts({ cwd: fixtureProject(), now: "GEN" });
  const html = renderDashboard(a);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /ship the thing/);          // run task
  assert.match(html, /RUN-9/);                     // run id
  assert.match(html, /First task/);                // task body rendered
  assert.match(html, /Thing spec/);                // spec body rendered
  assert.match(html, /id="run"/);
  assert.match(html, /id="tasks"/);
  assert.match(html, /id="specs"/);
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
