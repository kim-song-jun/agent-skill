import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const W = resolve("plugins/harness-floor/skills/wiki");
const read = (f) => readFileSync(resolve(W, f), "utf-8");

test("Phase 4 import orchestrates a cheap scribe with a no-copy guardrail", () => {
  const body = read("phases/4-import.md");
  assert.match(body, /wiki-import\.mjs|importDoc/, "calls the import engine");
  assert.match(body, /wiki\.model|haiku/, "uses the cheap wiki.model scribe");
  assert.match(body, /summari[sz]e|do not copy|not a copy|never copy/i, "instructs reference-not-duplicate");
  assert.match(body, /sources?:/i, "records the source link");
});

test("SKILL documents /wiki import", () => {
  const body = read("SKILL.md");
  assert.match(body, /\/wiki import/, "usage lists /wiki import");
});

test("Phase 4 backfill is dry-run-first, configurable, cost-capped", () => {
  const body = read("phases/4-import.md");
  assert.match(body, /planBackfill/, "uses the pure planner");
  assert.match(body, /config\.wiki\.sources/, "reads configurable source roots");
  assert.match(body, /interactiv|multi-select|agent-interaction/i, "first-run interactive root selection");
  assert.match(body, /dry-run[\s\S]{0,200}(DEFAULT|no writes|NO writes)/i, "dry-run preview is the default");
  assert.match(body, /--apply/, "explicit apply gate");
  assert.match(body, /maxImportUSD/, "cost cap");
});

test("agent-all Phase 2 records the spec as a wiki source", () => {
  const W = resolve("plugins/harness-floor/skills/agent-all/phases");
  const body = readFileSync(resolve(W, "2-plan.md"), "utf-8");
  assert.match(body, /sources:[\s\S]{0,200}spec:/i, "Phase 2 writePage sources include spec:");
});
