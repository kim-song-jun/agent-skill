// Phase-doc contract for the agent-all↔wiki auto-loop (CC).
// Asserts the loop is actually WIRED into the phase docs — gated on
// config.wiki.auto, install-anchored import (./lib/wiki-log.mjs), read at Phase 1,
// write at Phase 2 + 5, compile gate at Phase 5, and the --no-wiki opt-out.
// These guard against the wiring silently regressing to prose-only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHASES = resolve("plugins/harness-floor/skills/agent-all/phases");
const read = (f) => readFileSync(resolve(PHASES, f), "utf-8");

test("0-preflight normalizes --no-wiki into config.wiki.auto=false", () => {
  const body = read("0-preflight.md");
  assert.match(body, /--no-wiki/, "preflight documents the opt-out flag");
  assert.match(body, /flags\["no-wiki"\][\s\S]{0,80}config\.wiki[\s\S]{0,40}auto: false/, "normalizes the flag to config.wiki.auto=false once");
});

test("0-preflight deterministically ensures .wiki up front when config.wiki.auto (creation no longer hangs off the optional Phase 2 step)", () => {
  const body = read("0-preflight.md");
  assert.match(body, /config\.wiki\?\.auto/, "the deterministic ensure is gated on config.wiki.auto");
  assert.match(body, /from "\.\/lib\/wiki-log\.mjs"/, "imports the install-anchored ./lib/wiki-log.mjs (no cross-skill path)");
  assert.match(body, /ensureWiki/, "preflight calls ensureWiki so the dir exists on EVERY run, not just when the LLM remembers the Phase 2 sub-step");
  assert.match(body, /started a project wiki at \.wiki\/ — disable with --no-wiki/, "preflight prints the one-time first-creation notice");
});

test("Phase 1 reads the wiki into planning, gated on config.wiki.auto, install-anchored", () => {
  const body = read("1-intent.md");
  assert.match(body, /config\.wiki\?\.auto/, "the recall step is gated on config.wiki.auto");
  assert.match(body, /from "\.\/lib\/wiki-log\.mjs"/, "imports the install-anchored ./lib/wiki-log.mjs (no cross-skill path)");
  assert.match(body, /findOrCreatePage|readPage/, "routes + reads the matched page");
  assert.match(body, /wikiContext/, "folds recalled knowledge into planning state");
});

test("Phase 2 records the plan (write half), auto-creates .wiki with a one-time notice", () => {
  const body = read("2-plan.md");
  assert.match(body, /config\.wiki\?\.auto/, "gated on config.wiki.auto");
  assert.match(body, /from "\.\/lib\/wiki-log\.mjs"/, "install-anchored import");
  assert.match(body, /ensureWiki/, "ensures/auto-creates the wiki");
  assert.match(body, /started a project wiki at \.wiki\/ — disable with --no-wiki/, "prints the one-time first-creation notice (auto-create decision)");
  assert.match(body, /grade: "C"/, "plan capture writes at grade C (inferred)");
  assert.match(body, /writePage/, "writes the page");
});

test("Phase 5 records the outcome (C→B), cross-links, detects contradiction, and runs the compile gate", () => {
  const body = read("5-pr.md");
  assert.match(body, /config\.wiki\?\.auto/, "gated on config.wiki.auto");
  assert.match(body, /from "\.\/lib\/wiki-log\.mjs"/, "install-anchored import");
  assert.match(body, /grade: "B"/, "promotes the page C→B once shipped");
  assert.match(body, /PR: \$\{prUrl\}|prUrl/, "cross-links the PR url");
  assert.match(body, /[Cc]ontradiction/, "documents contradiction detection");
  assert.match(body, /compile\(/, "runs the compile self-audit gate");
  assert.match(body, /non-fatal|never abort|warn/i, "the compile gate is non-fatal (warn, never abort)");
});

test("CC delegates wiki authoring to a cheap-model scribe (config.wiki.model) — token-aware", () => {
  for (const f of ["2-plan.md", "5-pr.md"]) {
    const body = read(f);
    assert.match(body, /config\.wiki\.model/, `${f}: the wiki step dispatches the scribe on config.wiki.model`);
    assert.match(body, /scribe/i, `${f}: names the wiki-scribe delegate`);
    assert.match(body, /haiku/i, `${f}: defaults the scribe to the cheap haiku tier`);
    // The lib write must stay in the orchestrator (skill) context — install-safe —
    // not inside the scribe (which runs in the project cwd).
    assert.match(body, /writePage runs (here|HERE)|install-safe|install-anchored/i, `${f}: writePage runs in skill context, scribe never touches the lib path`);
    // Guard against the GAP-1 leftover: no residual "author ... yourself" trailer
    // (that would tell the MAIN thread to author, contradicting the scribe delegation).
    assert.doesNotMatch(body, /author[^.\n]*\byourself\b/i, `${f}: no contradictory "author ... yourself" instruction (authoring is delegated to the scribe)`);
  }
});

test("Codex honestly documents inline authoring (no per-dispatch model tier)", () => {
  for (const f of ["2-plan.md", "5-pr.md"]) {
    const body = readCodex(f);
    assert.match(body, /single-model|inline|no per-dispatch model tier/i, `codex ${f}: documents inline authoring`);
    assert.match(body, /wiki\.model.*inert|inert.*wiki\.model|inert/i, `codex ${f}: notes wiki.model is inert on Codex`);
  }
});

test("the loop is honestly non-fatal in the write phases (a wiki failure never fails the run)", () => {
  for (const f of ["2-plan.md", "5-pr.md"]) {
    const body = read(f);
    assert.match(body, /console\.warn\(`wiki|non-fatal/i, `${f}: warns and continues on wiki failure`);
  }
});

// --- Codex port parity (install-anchored to .codex/skills/agent-all/lib) ---
const CODEX_PHASES = resolve("plugins/harness-floor-codex/skills/agent-all-codex/phases");
const readCodex = (f) => readFileSync(resolve(CODEX_PHASES, f), "utf-8");
const CODEX_ANCHOR = /from "\.\/\.codex\/skills\/agent-all\/lib\/wiki-log\.mjs"/;

test("Codex port mirrors the wiki loop, gated + install-anchored to .codex/skills/agent-all/lib", () => {
  const codexPreflight = readCodex("0-preflight.md");
  assert.match(codexPreflight, /flags\["no-wiki"\][\s\S]{0,80}auto: false/, "codex normalizes --no-wiki");
  assert.match(codexPreflight, /config\.wiki\?\.auto/, "codex preflight gates the deterministic ensure");
  assert.match(codexPreflight, CODEX_ANCHOR, "codex preflight anchored import for the up-front ensure");
  assert.match(codexPreflight, /ensureWiki[\s\S]{0,300}started a project wiki/, "codex preflight deterministically ensures .wiki + first-creation notice");
  const intent = readCodex("1-intent.md");
  assert.match(intent, /config\.wiki\?\.auto/, "codex Phase 1 gated");
  assert.match(intent, CODEX_ANCHOR, "codex Phase 1 anchored import");
  const plan = readCodex("2-plan.md");
  assert.match(plan, /config\.wiki\?\.auto/, "codex Phase 2 gated");
  assert.match(plan, CODEX_ANCHOR, "codex Phase 2 anchored import");
  assert.match(plan, /ensureWiki[\s\S]{0,300}started a project wiki/, "codex auto-creates + notice");
  assert.match(plan, /grade: "C"/, "codex plan-capture grade C");
  const pr = readCodex("5-pr.md");
  assert.match(pr, /config\.wiki\?\.auto/, "codex Phase 5 gated");
  assert.match(pr, CODEX_ANCHOR, "codex Phase 5 anchored import");
  assert.match(pr, /grade: "B"/, "codex outcome grade B");
  assert.match(pr, /compile\(/, "codex compile gate");
});

// --- Prose ports: honest absence (no wiki-log lib → no auto-loop, labeled) ---
import { readdirSync } from "node:fs";
for (const port of ["copilot", "cursor", "gemini"]) {
  test(`${port} agent-all honestly labels auto-wiki as unavailable and references no wiki-log`, () => {
    const skillDir = resolve(`plugins/harness-floor-${port}/skills/agent-all-${port}`);
    const notes = readFileSync(resolve(skillDir, "references/porting-notes.md"), "utf-8");
    assert.match(notes, /auto-loop[\s\S]{0,60}NOT on this port/i, `${port} porting-notes labels the auto-loop as not-on-this-port`);
    // No wiki-log helper is vendored to a prose port, so no phase doc may import it.
    const phaseDir = resolve(skillDir, "phases");
    for (const f of readdirSync(phaseDir)) {
      const body = readFileSync(resolve(phaseDir, f), "utf-8");
      assert.doesNotMatch(body, /wiki-log\.mjs/, `${port}/${f} must NOT import the un-vendored wiki-log.mjs`);
    }
  });
}
