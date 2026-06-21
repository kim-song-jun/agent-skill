// cursor-wiki-prose-surface.test.mjs — Doc-surface contract test for the Cursor wiki prose-only port.
//
// Asserts that the Cursor host context template (agent-init.mdc.hbs) CONTAINS
// the wiki command specs, page schema, status-digest instruction, and honest-labeling
// required by spec G12 / decision 7.
//
// This is a PRESENCE/CONTRACT test, NOT a behavior test — Cursor wiki is
// prose-only with no runnable surface (spec decision 7; Cursor excluded from
// smartness decisions 4/7 except for this intentional user-requested slice).
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
  "../../plugins/harness-builder-cursor/skills/cursor-init/templates/rules/agent-init.mdc.hbs"
);

const body = readFileSync(TEMPLATE_PATH, "utf8");

// ── Section presence ─────────────────────────────────────────────────────────

test("cursor host template contains the Project Wiki section heading", () => {
  assert.match(body, /## Project Wiki \(prose-only port\)/);
});

// ── Honest-labeling / #27 banner ─────────────────────────────────────────────

test("cursor host template contains prose-only label (spec decision 7)", () => {
  assert.match(body, /Prose-only port \(spec decision 7\)/);
});

test("cursor host template contains #27 live-CLI-unverified token (decision 6)", () => {
  assert.match(body, /#27/);
  assert.match(body, /live-CLI-unverified/);
});

test("cursor host template contains Karpathy LLM-Wiki MIT attribution", () => {
  assert.match(body, /Karpathy LLM-Wiki/);
  assert.match(body, /MIT/);
});

// ── Command verb specs ────────────────────────────────────────────────────────

test("cursor wiki prose contains write verb spec", () => {
  assert.match(body, /`write <title>`/);
  assert.match(body, /Phase B/);
});

test("cursor wiki prose contains update verb spec", () => {
  assert.match(body, /`update <slug>`/);
  assert.match(body, /Phase B/);
});

test("cursor wiki prose contains compile verb spec with diff=0 gate", () => {
  assert.match(body, /`compile`/);
  assert.match(body, /diff=0/);
});

test("cursor wiki prose contains status verb spec", () => {
  assert.match(body, /`status`/);
  assert.match(body, /index summary/);
});

test("cursor wiki prose contains list verb spec", () => {
  assert.match(body, /`list`/);
});

test("cursor wiki prose contains bare-query Phase A router", () => {
  assert.match(body, /Phase A router/);
  assert.match(body, /INDEX\.md/);
});

// ── Page schema ───────────────────────────────────────────────────────────────

test("cursor wiki prose contains all five frontmatter keys", () => {
  assert.match(body, /`title`/);
  assert.match(body, /`slug`/);
  assert.match(body, /`grade`/);
  assert.match(body, /`tags`/);
  assert.match(body, /`updated`/);
});

test("cursor wiki prose contains all five fixed sections", () => {
  assert.match(body, /BLUF/);
  assert.match(body, /Details/);
  assert.match(body, /Provenance/);
  assert.match(body, /Contradictions/);
  assert.match(body, /Related/);
});

test("cursor wiki prose contains page schema block (page.md.tpl reference)", () => {
  assert.match(body, /page\.md\.tpl/);
});

// ── Status-digest instruction ─────────────────────────────────────────────────

test("cursor wiki prose contains First thing to do each session heading", () => {
  assert.match(body, /### First thing to do each session/);
});

test("cursor wiki prose contains exact digest line template", () => {
  assert.match(body, /wiki: N page\(s\) indexed, N on disk/);
});

test("cursor wiki prose contains drift-note token in digest", () => {
  assert.match(body, /\[drift: X missing page\(s\), Y unindexed page\(s\)\]/);
});

test("cursor wiki prose states the digest is a prompt-level instruction not a hook", () => {
  assert.match(body, /prompt-level instruction/);
});

// ── Negative / honesty guards ─────────────────────────────────────────────────

test("cursor wiki prose does NOT claim a hook fires automatically (negative guard)", () => {
  // Scope the check to the wiki section only
  const wikiStart = body.indexOf("## Project Wiki (prose-only port)");
  const constraintsIdx = body.indexOf("## Special Constraints", wikiStart);
  const wikiSection = wikiStart >= 0 ? body.slice(wikiStart, constraintsIdx > wikiStart ? constraintsIdx : undefined) : body;

  assert.doesNotMatch(
    wikiSection,
    /SessionStart hook|PreToolUse hook|hook fires|hook registered|hook installed/,
    "wiki prose section must not claim a hook fires automatically"
  );
});

test("cursor wiki prose explicitly states no runnable /wiki command exists", () => {
  assert.match(body, /no runnable \/wiki command/);
});
