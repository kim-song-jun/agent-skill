// wiki-prose-surface.test.mjs — Doc-surface contract test for the Gemini wiki prose-only port.
//
// Asserts that the Gemini host context template (GEMINI.md.hbs) CONTAINS the wiki
// command specs, page schema, status-digest instruction, and honest-labeling
// required by spec G11 / decision 7.
//
// This is a PRESENCE/CONTRACT test, NOT a behavior test — Copilot/Gemini wiki is
// prose-only with no runnable surface (spec decision 7). Gemini carries no #27 flag
// (spec §3.4 row 88); the surrounding Operational Soft Rules framing already establishes
// the soft-enforcement / no-hard-hook posture.
//
// No wiki lib is imported. No command is executed. Nothing is claimed to fire automatically.
//
// Negative guard: asserts the prose does NOT claim a hook fires automatically.
// This is the load-bearing real-contract assertion — it fails if a future edit
// dresses the prose up as runnable behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(
  here,
  "../../../plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs"
);

const body = readFileSync(TEMPLATE_PATH, "utf8");

// ── Section presence ─────────────────────────────────────────────────────────

test("gemini host template contains the Project Wiki section heading", () => {
  assert.match(body, /## Project Wiki \(prose-only port\)/);
});

// ── Honest-labeling / prose-only banner ──────────────────────────────────────

test("gemini host template contains prose-only label (spec decision 7)", () => {
  assert.match(body, /Prose-only port \(spec decision 7\)/);
});

test("gemini host template contains prompt-level policy disclaimer", () => {
  assert.match(body, /treat as prompt-level policy/);
});

test("gemini host template contains no-runnable-surface disclaimer for Gemini CLI", () => {
  assert.match(body, /no runnable \/wiki command/);
});

test("gemini host template contains no wiki hook disclaimer", () => {
  assert.match(body, /no wiki hook in this release/);
});

test("gemini host template contains Karpathy LLM-Wiki MIT attribution", () => {
  assert.match(body, /Karpathy LLM-Wiki/);
  assert.match(body, /MIT/);
});

// ── Command verb specs ────────────────────────────────────────────────────────

test("gemini wiki prose contains write verb spec", () => {
  assert.match(body, /`write <title>`/);
  assert.match(body, /Phase B/);
});

test("gemini wiki prose contains update verb spec", () => {
  assert.match(body, /`update <slug>`/);
  assert.match(body, /Phase B/);
});

test("gemini wiki prose contains compile verb spec with diff=0 gate", () => {
  assert.match(body, /`compile`/);
  assert.match(body, /diff=0/);
});

test("gemini wiki prose contains status verb spec", () => {
  assert.match(body, /`status`/);
  assert.match(body, /index summary/);
});

test("gemini wiki prose contains list verb spec", () => {
  assert.match(body, /`list`/);
});

test("gemini wiki prose contains bare-query Phase A router", () => {
  assert.match(body, /Phase A router/);
  assert.match(body, /INDEX\.md/);
});

// ── Page schema ───────────────────────────────────────────────────────────────

test("gemini wiki prose contains all five frontmatter keys", () => {
  assert.match(body, /`title`/);
  assert.match(body, /`slug`/);
  assert.match(body, /`grade`/);
  assert.match(body, /`tags`/);
  assert.match(body, /`updated`/);
});

test("gemini wiki prose contains all five fixed sections", () => {
  assert.match(body, /BLUF/);
  assert.match(body, /Details/);
  assert.match(body, /Provenance/);
  assert.match(body, /Contradictions/);
  assert.match(body, /Related/);
});

test("gemini wiki prose contains page schema block (page.md.tpl reference)", () => {
  assert.match(body, /page\.md\.tpl/);
});

// ── Status-digest instruction ─────────────────────────────────────────────────

test("gemini wiki prose contains First thing to do each session heading", () => {
  assert.match(body, /### First thing to do each session/);
});

test("gemini wiki prose contains exact digest line template", () => {
  assert.match(body, /wiki: N page\(s\) indexed, N on disk/);
});

test("gemini wiki prose contains drift-note token in digest", () => {
  assert.match(body, /\[drift: X missing page\(s\), Y unindexed page\(s\)\]/);
});

test("gemini wiki prose states the digest is a prompt-level instruction not a hook", () => {
  assert.match(body, /prompt-level instruction/);
});

// ── Negative / honesty guards ─────────────────────────────────────────────────

test("gemini wiki prose does NOT claim a hook fires automatically (negative guard)", () => {
  // Scope the check to the wiki section only
  const wikiStart = body.indexOf("## Project Wiki (prose-only port)");
  const rolesIdx = body.indexOf("## Roles", wikiStart);
  const wikiSection = wikiStart >= 0 ? body.slice(wikiStart, rolesIdx > wikiStart ? rolesIdx : undefined) : body;

  assert.doesNotMatch(
    wikiSection,
    /SessionStart hook|PreToolUse hook|hook fires|hook registered|hook installed/,
    "wiki prose section must not claim a hook fires automatically"
  );
});
