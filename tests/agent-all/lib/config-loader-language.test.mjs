import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveLanguage } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

test("default language is 'auto'", () => {
  const dir = mkdtempSync(join(tmpdir(), "lang-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify({ defaults: { maxIter: 1 } }));
  const r = loadConfig(p);
  assert.equal(r.ok, true);
  assert.equal(r.config.language, "auto");
});

test("explicit language overrides default", () => {
  const dir = mkdtempSync(join(tmpdir(), "lang-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify({ language: "ko" }));
  const r = loadConfig(p);
  assert.equal(r.config.language, "ko");
});

test("invalid language is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "lang-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify({ language: "klingon" }));
  const r = loadConfig(p);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /auto.*en.*ko/);
});

test("resolveLanguage passes through explicit en/ko", () => {
  assert.equal(resolveLanguage("en"), "en");
  assert.equal(resolveLanguage("ko"), "ko");
});

test("resolveLanguage('auto') reads $LANG: ko_KR.UTF-8 → ko", () => {
  const save = process.env.LANG;
  process.env.LANG = "ko_KR.UTF-8";
  try {
    assert.equal(resolveLanguage("auto"), "ko");
  } finally {
    if (save === undefined) delete process.env.LANG;
    else process.env.LANG = save;
  }
});

test("resolveLanguage('auto') falls back to 'en' when $LANG is not Korean", () => {
  const save = process.env.LANG;
  process.env.LANG = "en_US.UTF-8";
  try {
    assert.equal(resolveLanguage("auto"), "en");
  } finally {
    if (save === undefined) delete process.env.LANG;
    else process.env.LANG = save;
  }
});
