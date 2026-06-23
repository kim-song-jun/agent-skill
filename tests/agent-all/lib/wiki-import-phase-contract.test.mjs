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
