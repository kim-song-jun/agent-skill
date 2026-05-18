// Unit tests for the DOM-hash cache: stable hashing under whitespace
// + auto-generated class noise, computed-styles inclusion, cache I/O,
// TTL eviction.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  hashComponent,
  normaliseDomString,
  readCache,
  writeCache,
  emptyCache,
  lookup,
  recordHit,
  evictStale,
} from "../../plugins/harness-floor/skills/visual-qa/lib/dom-hash.mjs";

function tmpfile(name) {
  const dir = mkdtempSync(resolve(tmpdir(), `dom-hash-${name}-`));
  return resolve(dir, "cache.json");
}

test("normaliseDomString: collapses whitespace, strips reactid noise, hashed classes", () => {
  const noisy = `
    <div    class="btn-primary _abc12345"   data-reactid="0.5">
      Click   me
    </div>
  `;
  const clean = `<div class="btn-primary _abc12345" data-reactid="0.5"> Click me </div>`;
  assert.equal(normaliseDomString(noisy), normaliseDomString(clean));
  assert.match(normaliseDomString(noisy), /_HASHED/);
  assert.doesNotMatch(normaliseDomString(noisy), /data-reactid/);
});

test("hashComponent: identical normalised input -> identical hash", () => {
  const a = hashComponent({ dom: "<button>Go</button>" });
  const b = hashComponent({ dom: "<button>Go</button>" });
  assert.equal(a, b);
});

test("hashComponent: different DOM -> different hash", () => {
  const a = hashComponent({ dom: "<button>Go</button>" });
  const b = hashComponent({ dom: "<button>Stop</button>" });
  assert.notEqual(a, b);
});

test("hashComponent: whitespace noise does NOT change hash", () => {
  const a = hashComponent({ dom: "<button>Go</button>" });
  const b = hashComponent({ dom: "\n   <button>   Go   </button>  \n" });
  assert.equal(a, b);
});

test("hashComponent: hashed class suffix noise does NOT change hash", () => {
  const a = hashComponent({ dom: '<div class="card_abc12345">Hi</div>' });
  const b = hashComponent({ dom: '<div class="card_xyz98765">Hi</div>' });
  assert.equal(a, b, "hashed classes should be normalised before hashing");
});

test("hashComponent: relevant computed style changes DO change hash", () => {
  const dom = "<button>Go</button>";
  const a = hashComponent({ dom, computedStyles: { color: "red" } });
  const b = hashComponent({ dom, computedStyles: { color: "blue" } });
  assert.notEqual(a, b);
});

test("hashComponent: irrelevant computed style changes do NOT change hash", () => {
  const dom = "<button>Go</button>";
  const a = hashComponent({ dom, computedStyles: { color: "red", "margin-top": "8px" } });
  const b = hashComponent({ dom, computedStyles: { color: "red", "margin-top": "100px" } });
  assert.equal(a, b);
});

test("emptyCache / readCache / writeCache round-trip", () => {
  const p = tmpfile("rw");
  const cache = recordHit(emptyCache(), "abc", { verdict: "ok" });
  writeCache(p, cache);
  const back = readCache(p);
  assert.deepEqual(back.entries.abc.priorAnalysis, { verdict: "ok" });
});

test("readCache: missing path → emptyCache", () => {
  const r = readCache(tmpfile("missing") + "-nope");
  assert.deepEqual(r, emptyCache());
});

test("readCache: corrupted JSON → emptyCache", () => {
  const p = tmpfile("bad");
  writeFileSync(p, "{not json");
  assert.deepEqual(readCache(p), emptyCache());
});

test("readCache: wrong version / shape → emptyCache", () => {
  const p = tmpfile("ver");
  writeFileSync(p, JSON.stringify({ version: 99, entries: {} }));
  assert.deepEqual(readCache(p), emptyCache());
});

test("lookup: returns null for unseen hash, entry for seen one", () => {
  let c = emptyCache();
  c = recordHit(c, "h1", { verdict: "pass" });
  assert.equal(lookup(c, "h2"), null);
  assert.deepEqual(lookup(c, "h1").priorAnalysis, { verdict: "pass" });
});

test("evictStale: drops entries older than ttlDays", () => {
  let c = emptyCache();
  const now = new Date("2026-05-19T00:00:00Z");
  c = recordHit(c, "recent", { v: 1 }, now);
  c = recordHit(c, "old",    { v: 2 }, new Date("2026-01-01T00:00:00Z"));
  const out = evictStale(c, 30, now);
  assert.ok(out.entries.recent);
  assert.equal(out.entries.old, undefined);
});

test("recordHit: bumps lastSeen on existing entry", () => {
  let c = emptyCache();
  c = recordHit(c, "h1", { v: 1 }, new Date("2026-01-01T00:00:00Z"));
  const first = c.entries.h1.lastSeen;
  c = recordHit(c, "h1", { v: 1 }, new Date("2026-05-19T00:00:00Z"));
  assert.notEqual(c.entries.h1.lastSeen, first);
});

test("writeCache: throws on falsy path", () => {
  assert.throws(() => writeCache(null, emptyCache()), /requires a path/);
});
