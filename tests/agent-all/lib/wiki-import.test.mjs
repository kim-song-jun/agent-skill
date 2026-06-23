import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveTopic, parseSources, importDoc } from "../../../plugins/harness-floor/skills/wiki/lib/wiki-import.mjs";

test("deriveTopic: spec and plan of one feature share a slug (merge key)", () => {
  const spec = deriveTopic("docs/superpowers/specs/2026-06-23-agent-all-compaction-resilience-design.md");
  const plan = deriveTopic("docs/superpowers/plans/2026-06-23-agent-all-compaction-resilience.md");
  assert.equal(spec.slug, "agent-all-compaction-resilience");
  assert.equal(plan.slug, spec.slug, "spec+plan must collapse to the same topic");
  assert.equal(spec.type, "spec");
  assert.equal(plan.type, "plan");
});

test("deriveTopic: strips task-id, numeric, and date prefixes", () => {
  assert.equal(deriveTopic(".agent-skill/tasks/T-20260611-001-fix-login.md").slug, "fix-login");
  assert.equal(deriveTopic("docs/04-db-schema-design.md").slug, "db-schema");
  assert.equal(deriveTopic("docs/LOT_DATA_SSOT.md").slug, "lot-data-ssot");
});

test("parseSources extracts the Sources list", () => {
  const page = "## Provenance\n\nGrade: C\n- A = primary\n\nSources:\n- spec: docs/a.md\n- plan: docs/b.md\n\n## Contradictions\n";
  assert.deepEqual(parseSources(page), ["spec: docs/a.md", "plan: docs/b.md"]);
});

test("importDoc: new topic creates a page with a source link, grade C", () => {
  const wiki = mkdtempSync(join(tmpdir(), "wi-"));
  const doc = join(wiki, "spec.md");
  writeFileSync(doc, "# Auth redesign\n\nlong body ".repeat(50));
  const r = importDoc(wiki, doc, { type: "spec", authored: { bluf: "Auth.", details: "synth", contradictions: "" }, now: "2026-06-23" });
  assert.equal(r.ok, true);
  assert.equal(r.existed, false);
  const page = readFileSync(join(wiki, `${r.slug}.md`), "utf-8");
  assert.match(page, new RegExp(`spec: ${doc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(page, /grade: C/);
});

test("importDoc: second source for same topic merges (one page, two sources, grade B)", () => {
  const wiki = mkdtempSync(join(tmpdir(), "wi-"));
  const specDoc = join(wiki, "2026-06-23-x-design.md"); writeFileSync(specDoc, "# X\nbody");
  const planDoc = join(wiki, "2026-06-23-x.md"); writeFileSync(planDoc, "# X\nbody");
  const a = importDoc(wiki, specDoc, { authored: { bluf: "X.", details: "d", contradictions: "" } });
  const b = importDoc(wiki, planDoc, { authored: { bluf: "X.", details: "d2", contradictions: "" } });
  assert.equal(b.slug, a.slug, "same topic → same page");
  assert.equal(b.existed, true);
  const page = readFileSync(join(wiki, `${b.slug}.md`), "utf-8");
  const sources = parseSources(page);
  assert.equal(sources.length, 2, "both sources preserved");
  assert.match(page, /grade: B/, "promoted on 2nd source");
});

test("importDoc: reference-not-duplicate — page body much smaller than source", () => {
  const wiki = mkdtempSync(join(tmpdir(), "wi-"));
  const doc = join(wiki, "big.md");
  const big = "# Big spec\n\n" + "detailed paragraph. ".repeat(2000);
  writeFileSync(doc, big);
  const r = importDoc(wiki, doc, { authored: { bluf: "Big.", details: "a short synthesis", contradictions: "" } });
  const page = readFileSync(join(wiki, `${r.slug}.md`), "utf-8");
  assert.ok(page.length < big.length / 3, "synthesized page must be far smaller than the source (no copy)");
});
