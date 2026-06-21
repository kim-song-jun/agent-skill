// wiki-prose-surface.test.mjs — Doc-surface contract test for the Copilot wiki prose-only port.
//
// Asserts that the Copilot host context template (copilot-instructions.md.hbs) CONTAINS
// the wiki command specs, page schema, status-digest instruction, and honest-labeling
// required by spec G10 / decision 7.
//
// This is a PRESENCE/CONTRACT test, NOT a behavior test — Copilot/Gemini wiki is
// prose-only with no runnable surface (spec decision 7; Copilot #27 decision 6).
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
  "../../../plugins/harness-builder-copilot/skills/copilot-init/templates/copilot-instructions.md.hbs"
);

const body = readFileSync(TEMPLATE_PATH, "utf8");

// ── Section presence ─────────────────────────────────────────────────────────

test("copilot host template contains the Project Wiki section heading", () => {
  assert.match(body, /## Project Wiki \(prose-only port\)/);
});

// ── Honest-labeling / #27 banner ─────────────────────────────────────────────

test("copilot host template contains prose-only label (spec decision 7)", () => {
  assert.match(body, /Prose-only port \(spec decision 7\)/);
});

test("copilot host template contains #27 live-CLI-unverified token (decision 6)", () => {
  assert.match(body, /#27/);
  assert.match(body, /live-CLI-unverified/);
});

test("copilot host template contains Karpathy LLM-Wiki MIT attribution", () => {
  assert.match(body, /Karpathy LLM-Wiki/);
  assert.match(body, /MIT/);
});

// ── Command verb specs ────────────────────────────────────────────────────────

test("copilot wiki prose contains write verb spec", () => {
  assert.match(body, /`write <title>`/);
  assert.match(body, /Phase B/);
});

test("copilot wiki prose contains update verb spec", () => {
  assert.match(body, /`update <slug>`/);
  assert.match(body, /Phase B/);
});

test("copilot wiki prose contains compile verb spec with diff=0 gate", () => {
  assert.match(body, /`compile`/);
  assert.match(body, /diff=0/);
});

test("copilot wiki prose contains status verb spec", () => {
  assert.match(body, /`status`/);
  assert.match(body, /index summary/);
});

test("copilot wiki prose contains list verb spec", () => {
  assert.match(body, /`list`/);
});

test("copilot wiki prose contains bare-query Phase A router", () => {
  assert.match(body, /Phase A router/);
  assert.match(body, /INDEX\.md/);
});

// ── Page schema ───────────────────────────────────────────────────────────────

test("copilot wiki prose contains all five frontmatter keys", () => {
  assert.match(body, /`title`/);
  assert.match(body, /`slug`/);
  assert.match(body, /`grade`/);
  assert.match(body, /`tags`/);
  assert.match(body, /`updated`/);
});

test("copilot wiki prose contains all five fixed sections", () => {
  assert.match(body, /BLUF/);
  assert.match(body, /Details/);
  assert.match(body, /Provenance/);
  assert.match(body, /Contradictions/);
  assert.match(body, /Related/);
});

test("copilot wiki prose contains page schema block (page.md.tpl reference)", () => {
  assert.match(body, /page\.md\.tpl/);
});

// ── Status-digest instruction ─────────────────────────────────────────────────

test("copilot wiki prose contains First thing to do each session heading", () => {
  assert.match(body, /### First thing to do each session/);
});

test("copilot wiki prose contains exact digest line template", () => {
  assert.match(body, /wiki: N page\(s\) indexed, N on disk/);
});

test("copilot wiki prose contains drift-note token in digest", () => {
  assert.match(body, /\[drift: X missing page\(s\), Y unindexed page\(s\)\]/);
});

test("copilot wiki prose states the digest is a prompt-level instruction not a hook", () => {
  assert.match(body, /prompt-level instruction/);
});

// ── Negative / honesty guards ─────────────────────────────────────────────────

test("copilot wiki prose does NOT claim a hook fires automatically (negative guard)", () => {
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

test("copilot wiki prose explicitly states no runnable /wiki command exists", () => {
  assert.match(body, /no runnable \/wiki command/);
});
