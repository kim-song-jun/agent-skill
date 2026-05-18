import { test } from "node:test";
import assert from "node:assert/strict";

import {
  where,
  deps,
  summarize,
} from "../../plugins/harness-explore/skills/explore/lib/query-engine.mjs";

function fixtureMap() {
  return {
    schemaVersion: "1.0.0",
    sha: "abc12345",
    generatedAt: "2026-05-18T00:00:00Z",
    root: "/repo",
    totalFiles: 5,
    totalLines: 320,
    sizeCategory: "small",
    languages: { ts: 5 },
    publicEntryPoints: ["src/index.ts"],
    dirs: [
      {
        dir: "src/auth",
        fileCount: 3,
        totalLines: 120,
        entries: [
          {
            path: "src/auth/session.ts",
            kind: "module",
            lines: 80,
            exports: ["createSession", "destroySession", "Session"],
            symbols: [
              { name: "createSession", kind: "function", line: 10 },
              { name: "destroySession", kind: "function", line: 30 },
              { name: "Session", kind: "interface", line: 4 },
              { name: "privateHelper", kind: "function", line: 50 },
            ],
          },
          {
            path: "src/auth/oauth.ts",
            kind: "module",
            lines: 40,
            exports: ["googleOAuth"],
            symbols: [{ name: "googleOAuth", kind: "function", line: 5 }],
          },
        ],
      },
      {
        dir: "src",
        fileCount: 2,
        totalLines: 200,
        entries: [
          { path: "src/index.ts", kind: "module", lines: 10, exports: ["main"], symbols: [] },
          { path: "src/legacy.ts", kind: "module", lines: 190, exports: [], symbols: [] },
        ],
      },
    ],
    depGraph: {
      schemaVersion: "1.0.0",
      supportedLanguages: ["ts"],
      imports: {
        "src/auth/session.ts": ["src/db/index.ts"],
        "src/index.ts": ["src/auth/session.ts", "src/auth/oauth.ts"],
      },
      importedBy: {
        "src/auth/session.ts": ["src/index.ts"],
        "src/auth/oauth.ts": ["src/index.ts"],
        "src/db/index.ts": ["src/auth/session.ts"],
      },
      orphans: ["src/legacy.ts"],
      skipped: false,
    },
  };
}

// ---------- where ----------

test("where: exact export match → pass 1 'exports'", () => {
  const r = where(fixtureMap(), "createSession");
  assert.equal(r.fallback, "exports");
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].file, "src/auth/session.ts");
  assert.equal(r.matches[0].source, "exports");
});

test("where: symbol-only match (not exported) → pass 2 'symbols'", () => {
  const r = where(fixtureMap(), "privateHelper");
  assert.equal(r.fallback, "symbols");
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].file, "src/auth/session.ts");
  assert.equal(r.matches[0].line, 50);
});

test("where: fuzzy match (Levenshtein ≤ 2) → pass 3 'fuzzy'", () => {
  const r = where(fixtureMap(), "createSeasion"); // 1 edit from createSession
  assert.equal(r.fallback, "fuzzy");
  assert.ok(r.matches.length >= 1);
  assert.equal(r.matches[0].suggested, "createSession");
});

test("where: no cache hit + ripgrep fn → pass 4 'ripgrep'", () => {
  const rg = (sym) => [{ file: "scripts/legacy.sh", line: 1, context: `echo ${sym}` }];
  const r = where(fixtureMap(), "totallyMissingSymbol", { ripgrep: rg });
  assert.equal(r.fallback, "ripgrep");
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].source, "ripgrep");
  assert.equal(r.matches[0].file, "scripts/legacy.sh");
});

test("where: no match + no ripgrep → empty matches, fallback null", () => {
  const r = where(fixtureMap(), "zzzNoSuchSymbol");
  assert.equal(r.fallback, null);
  assert.equal(r.matches.length, 0);
});

// ---------- deps ----------

test("deps: known file → imports + importedBy from depGraph", () => {
  const r = deps(fixtureMap(), "src/auth/session.ts");
  assert.equal(r.ok, true);
  assert.deepEqual(r.imports, ["src/db/index.ts"]);
  assert.deepEqual(r.importedBy, ["src/index.ts"]);
});

test("deps: file not in map → ok:false reason:not-in-map", () => {
  const r = deps(fixtureMap(), "src/totally-missing.ts");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-in-map");
});

test("deps: no depGraph → ok:false reason:no-dep-graph", () => {
  const m = fixtureMap();
  m.depGraph = { skipped: "no-typed-languages" };
  const r = deps(m, "src/auth/session.ts");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no-dep-graph");
});

// ---------- summarize ----------

test("summarize: respects maxBytes budget", () => {
  const m = fixtureMap();
  // Pad dirs to force truncation
  for (let i = 0; i < 100; i++) {
    m.dirs.push({ dir: `pkg${i}`, fileCount: 5, totalLines: 50, purpose: "filler ".repeat(20), entries: [] });
  }
  const out = summarize(m, { maxBytes: 512 });
  assert.ok(Buffer.byteLength(out, "utf-8") <= 512, `summary should be ≤ 512 bytes, got ${Buffer.byteLength(out)}`);
});

test("summarize: includes header + language line", () => {
  const out = summarize(fixtureMap());
  assert.match(out, /Codebase map \(sha=abc12345\)/);
  assert.match(out, /ts:5/);
  assert.match(out, /src\/auth\//);
});
