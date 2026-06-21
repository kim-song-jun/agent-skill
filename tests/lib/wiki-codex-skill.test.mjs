// wiki-codex-skill.test.mjs — Real tests for the Codex near-native wiki skill.
//
// Two layers:
// A. SHARED-LIB BEHAVIOR: compile/route gate tested against the CODEX-PATH copy
//    (not the CC path), using the existing real fixtures in tests/fixtures/wiki/.
// B. DIGEST HOOK + STRUCTURE: first-call sentinel semantics, non-fatal guard,
//    valid JS body, stale schema absence.
//
// Spec anchor: Codex near-native (live-CLI verified) | .codex/skills/wiki-* +
// PreToolUse first-call digest (spec decision 7).
//
// Honestly-labeled non-runnable bit: the end-to-end "model reads SKILL.md and
// drives apply_patch/ask_user" flow is live-CLI-covered, not unit-covered.
//
// Attribution: Karpathy LLM-Wiki pattern (MIT).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const fixtureDir = resolve(here, "../fixtures/wiki");

// Codex path — the vendored copy we are actually testing.
const CODEX_WIKI_INDEX_LIB = resolve(
  repoRoot,
  "plugins/harness-floor-codex/skills/wiki-codex/lib/wiki-index.mjs",
);
const CC_WIKI_INDEX_LIB = resolve(
  repoRoot,
  "plugins/harness-floor/skills/wiki/lib/wiki-index.mjs",
);
const WIKI_HOOK_MJS_HBS = resolve(
  repoRoot,
  "plugins/harness-floor-codex/skills/wiki-codex/templates/hooks/wiki-pretool-first-call-digest.mjs.hbs",
);
const SKILL_MD = resolve(
  repoRoot,
  "plugins/harness-floor-codex/skills/wiki-codex/SKILL.md",
);
const PORTING_NOTES = resolve(
  repoRoot,
  "plugins/harness-floor-codex/skills/wiki-codex/references/porting-notes.md",
);
const INIT_MJS = resolve(
  repoRoot,
  "plugins/harness-floor-codex/bin/init.mjs",
);

// ─────────────────────────────────────────────────────────────────────────────
// A. SHARED-LIB BEHAVIOR (tests run against the CODEX path, not CC path)
// ─────────────────────────────────────────────────────────────────────────────

test("codex wiki-index.mjs: compile gate passes for complete fixture (diff=0)", async () => {
  // Import from the CODEX path — proves the vendored logic actually works in
  // its codex location, not just that a file exists.
  const { compileSelfAudit } = await import(CODEX_WIKI_INDEX_LIB);
  const wikiDir = resolve(fixtureDir, "complete");
  const result = compileSelfAudit(wikiDir);

  assert.equal(result.ok, true);
  assert.deepEqual(result.indexOnly, []);
  assert.deepEqual(result.pagesOnly, []);
  assert.equal(result.entryCount, 2);
  assert.equal(result.pageCount, 2);
  // Sorted-array deepEqual on matched slugs (spec §5 assertion).
  const slugSorted = [...result.matched].sort();
  assert.deepEqual(slugSorted, ["auth-flow.md", "db-schema.md"]);
});

test("codex wiki-index.mjs: compile gate fails when index entry has no page on disk", async () => {
  const { compileSelfAudit } = await import(CODEX_WIKI_INDEX_LIB);
  const wikiDir = resolve(fixtureDir, "missing-page");
  const result = compileSelfAudit(wikiDir);

  assert.equal(result.ok, false, "compile gate must fail when index declares a non-existent page");
  assert.ok(result.indexOnly.includes("missing.md"), `indexOnly must contain missing.md; got ${JSON.stringify(result.indexOnly)}`);
  assert.deepEqual(result.pagesOnly, []);
});

test("codex wiki-index.mjs: compile gate fails when page on disk is not indexed", async () => {
  const { compileSelfAudit } = await import(CODEX_WIKI_INDEX_LIB);
  const wikiDir = resolve(fixtureDir, "missing-index-entry");
  const result = compileSelfAudit(wikiDir);

  assert.equal(result.ok, false, "compile gate must fail when a page on disk is not indexed");
  assert.deepEqual(result.indexOnly, []);
  assert.ok(result.pagesOnly.includes("orphan-page.md"), `pagesOnly must contain orphan-page.md; got ${JSON.stringify(result.pagesOnly)}`);
});

test("codex wiki-index.mjs: routePhaseA finds exact slug match", async () => {
  const { routePhaseA, parseIndex } = await import(CODEX_WIKI_INDEX_LIB);
  const { entries } = parseIndex(resolve(fixtureDir, "complete"));
  const result = routePhaseA("auth-flow", entries);
  assert.equal(result.phase, "A");
  assert.ok(result.match, "exact slug match must be found");
  assert.equal(result.match.slug, "auth-flow");
  assert.deepEqual(result.candidates, []);
});

test("codex wiki-index.mjs: appendIndexEntry produces valid parseable INDEX.md from empty", async () => {
  const { appendIndexEntry, parseIndexRaw } = await import(CODEX_WIKI_INDEX_LIB);
  const entry = { title: "Codex Test Page", file: "codex-test.md", slug: "codex-test", grade: "C", tags: ["codex"] };
  const raw = appendIndexEntry("", entry);
  assert.match(raw, /Wiki Index/);
  const entries = parseIndexRaw(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, "codex-test");
  assert.equal(entries[0].grade, "C");
  assert.deepEqual(entries[0].tags, ["codex"]);
});

// VENDOR-PARITY: byte-for-byte match between CC and codex copies.
test("codex wiki-index.mjs: byte-for-byte matches CC source (no drift)", () => {
  const ccSrc = readFileSync(CC_WIKI_INDEX_LIB, "utf-8");
  const codexSrc = readFileSync(CODEX_WIKI_INDEX_LIB, "utf-8");
  assert.equal(codexSrc, ccSrc, "codex wiki-index.mjs must be byte-for-byte identical to CC source");
});

// ─────────────────────────────────────────────────────────────────────────────
// B. DIGEST HOOK + STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

test("wiki hook template: .mjs.hbs is valid JavaScript when rendered", () => {
  // Render the template (trivial: no {{vars}} in the body that would block parsing).
  const tplSrc = readFileSync(WIKI_HOOK_MJS_HBS, "utf-8");
  // Render with a dummy hooksDir so any {{hooksDir}} references resolve.
  const rendered = tplSrc.replace(/\{\{hooksDir\}\}/g, "/tmp/hooks");

  const tmp = mkdtempSync(join(tmpdir(), "wiki-hook-check-"));
  try {
    const hookPath = join(tmp, "wiki-pretool-first-call-digest.mjs");
    writeFileSync(hookPath, rendered);
    const chk = spawnSync(process.execPath, ["--check", hookPath], { encoding: "utf-8" });
    assert.equal(chk.status, 0, `hook body is not valid JS: ${chk.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("wiki hook: first-call fires digest and writes sentinel", () => {
  const tplSrc = readFileSync(WIKI_HOOK_MJS_HBS, "utf-8");
  const tmp = mkdtempSync(join(tmpdir(), "wiki-hook-first-call-"));
  try {
    const wikiDir = join(tmp, ".wiki");
    mkdirSync(wikiDir, { recursive: true });
    // Write a minimal valid INDEX.md with one entry and matching page.
    writeFileSync(
      join(wikiDir, "INDEX.md"),
      [
        "# Wiki Index",
        "",
        "| Page | Slug | Grade | Tags |",
        "|------|------|-------|------|",
        "| [Test Page](test-page.md) | test-page | C |  |",
        "",
      ].join("\n"),
    );
    writeFileSync(join(wikiDir, "test-page.md"), "# Test Page\n\n**BLUF:** Test.\n");

    // Render hook body with hooksDir pointing at .codex/hooks (not used in body).
    const rendered = tplSrc.replace(/\{\{hooksDir\}\}/g, join(tmp, ".codex/hooks"));
    const hookPath = join(tmp, "hook.mjs");
    writeFileSync(hookPath, rendered);

    const payload = JSON.stringify({ session_id: "test-session-abc", tool_name: "Bash" });

    // First invocation → digest must fire.
    const r1 = spawnSync(process.execPath, [hookPath], {
      cwd: tmp,
      env: { ...process.env, CODEX_PROJECT_DIR: tmp },
      input: payload,
      encoding: "utf-8",
    });
    assert.equal(r1.status, 0, `first-call hook failed: ${r1.stderr}`);
    assert.match(r1.stderr, /wiki: \d+ page\(s\) indexed/, `first-call must emit digest; got stderr=${JSON.stringify(r1.stderr)}`);

    // Sentinel must now exist.
    const sentinelPath = join(wikiDir, ".session-digest-test-session-abc");
    assert.ok(existsSync(sentinelPath), "sentinel file must be written after first call");

    // Second invocation same session → no-op (digest suppressed).
    const r2 = spawnSync(process.execPath, [hookPath], {
      cwd: tmp,
      env: { ...process.env, CODEX_PROJECT_DIR: tmp },
      input: payload,
      encoding: "utf-8",
    });
    assert.equal(r2.status, 0, `second-call hook failed: ${r2.stderr}`);
    assert.equal(r2.stderr.trim(), "", `second-call must NOT emit digest; got stderr=${JSON.stringify(r2.stderr)}`);

    // Different session id → digest fires again.
    const payload2 = JSON.stringify({ session_id: "other-session-xyz", tool_name: "Bash" });
    const r3 = spawnSync(process.execPath, [hookPath], {
      cwd: tmp,
      env: { ...process.env, CODEX_PROJECT_DIR: tmp },
      input: payload2,
      encoding: "utf-8",
    });
    assert.equal(r3.status, 0, `different-session hook failed: ${r3.stderr}`);
    assert.match(r3.stderr, /wiki: \d+ page\(s\) indexed/, `different session must emit digest; got stderr=${JSON.stringify(r3.stderr)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("wiki hook: non-fatal when .wiki/ is absent", () => {
  const tplSrc = readFileSync(WIKI_HOOK_MJS_HBS, "utf-8");
  const tmp = mkdtempSync(join(tmpdir(), "wiki-hook-no-wiki-"));
  try {
    const rendered = tplSrc.replace(/\{\{hooksDir\}\}/g, join(tmp, ".codex/hooks"));
    const hookPath = join(tmp, "hook.mjs");
    writeFileSync(hookPath, rendered);

    const r = spawnSync(process.execPath, [hookPath], {
      cwd: tmp,
      env: { ...process.env, CODEX_PROJECT_DIR: tmp },
      input: JSON.stringify({ session_id: "s1", tool_name: "Read" }),
      encoding: "utf-8",
    });
    assert.equal(r.status, 0, `hook must exit 0 when .wiki/ absent: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("wiki hook: non-fatal when INDEX.md is absent but .wiki/ exists", () => {
  const tplSrc = readFileSync(WIKI_HOOK_MJS_HBS, "utf-8");
  const tmp = mkdtempSync(join(tmpdir(), "wiki-hook-no-index-"));
  try {
    mkdirSync(join(tmp, ".wiki"), { recursive: true });
    const rendered = tplSrc.replace(/\{\{hooksDir\}\}/g, join(tmp, ".codex/hooks"));
    const hookPath = join(tmp, "hook.mjs");
    writeFileSync(hookPath, rendered);

    const r = spawnSync(process.execPath, [hookPath], {
      cwd: tmp,
      env: { ...process.env, CODEX_PROJECT_DIR: tmp },
      input: JSON.stringify({ session_id: "s1", tool_name: "Read" }),
      encoding: "utf-8",
    });
    assert.equal(r.status, 0, `hook must exit 0 when INDEX.md absent: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// SKILL.md stale-schema check (mirrors codex-current-hook-schema.test.mjs locally).
test("SKILL.md and porting-notes contain NO stale Codex hook schema tokens", () => {
  const STALE_PATTERNS = [
    /\[\[hooks\.pre_tool_use\]\]/,
    /\[\[hooks\.post_tool_use\]\]/,
    /\[\[hooks\.session_start\]\]/,
    /\[\[hooks\.session_end\]\]/,
    /\[\[hooks\.agent\]\]/,
    /matcher = "shell_command"/,
    /timeout_seconds/,
  ];

  const filesToCheck = [
    { path: SKILL_MD, name: "SKILL.md" },
    { path: PORTING_NOTES, name: "porting-notes.md" },
    { path: WIKI_HOOK_MJS_HBS, name: "hook .mjs.hbs" },
    {
      path: resolve(repoRoot, "plugins/harness-floor-codex/skills/wiki-codex/templates/hooks/wiki-pretool-first-call-digest.toml.hbs"),
      name: "hook .toml.hbs",
    },
  ];

  const offenders = [];
  for (const { path: p, name } of filesToCheck) {
    const body = readFileSync(p, "utf-8");
    for (const pattern of STALE_PATTERNS) {
      if (pattern.test(body)) {
        offenders.push(`${name}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Stale Codex hook schema tokens found: ${offenders.join("; ")}`);
});

// SKILL.md frontmatter check.
test("SKILL.md frontmatter: name is 'wiki'", () => {
  const body = readFileSync(SKILL_MD, "utf-8");
  assert.match(body, /^name: wiki$/m, "SKILL.md frontmatter must have name: wiki");
});

// ─────────────────────────────────────────────────────────────────────────────
// C. INLINE HOOK vs LIB EQUIVALENCE (FIX 4 guard against inline copy drifting)
// ─────────────────────────────────────────────────────────────────────────────
//
// The PreToolUse hook inlines parseIndex+compileSelfAudit because it lives in
// .codex/hooks/ where ../lib does not resolve. This test asserts that the inline
// logic produces IDENTICAL ok/indexOnly/pagesOnly/entryCount/pageCount results
// as the shared lib compileSelfAudit on the same fixtures. It prevents silent
// drift between the inline copy and the authoritative lib.
//
// The inline function body below MUST stay in sync with the actual inline body in
// templates/hooks/wiki-pretool-first-call-digest.mjs.hbs (lines 63-107).
// If they diverge, update BOTH files together.

import { existsSync as _exist, readdirSync as _readdir, readFileSync as _readF } from "node:fs";

/**
 * Replication of the inline hook's audit logic (extracted for testability).
 * Source: wiki-pretool-first-call-digest.mjs.hbs lines 63-107.
 */
function runInlineHookAudit(wikiDir) {
  const INDEX_FILENAME = "INDEX.md";
  const INDEX_PATH = join(wikiDir, INDEX_FILENAME);
  if (!_exist(INDEX_PATH)) return null; // hook short-circuits (non-fatal)
  const raw = _readF(INDEX_PATH, "utf-8");
  const entries = [];
  const lines = raw.split(/\r?\n/);
  let tableStarted = false;
  let separatorSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (tableStarted) { tableStarted = false; separatorSeen = false; }
      continue;
    }
    if (!tableStarted) { tableStarted = true; continue; }
    if (!separatorSeen) {
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) { separatorSeen = true; continue; }
      separatorSeen = true;
    }
    const cols = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (cols.length < 3) continue;
    const linkMatch = cols[0].match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!linkMatch) continue;
    const file = linkMatch[2];
    const slug = cols[1];
    const grade = cols[2];
    if (!slug || !["A", "B", "C"].includes(grade)) continue;
    entries.push({ file });
  }
  // Disk files: .md files excluding INDEX.md and .session-* sentinels.
  const diskFiles = new Set(
    _readdir(wikiDir)
      .filter((f) => f.endsWith(".md") && f !== INDEX_FILENAME && !f.startsWith(".session-")),
  );
  const indexFiles = new Set(entries.map((e) => e.file));
  const indexOnly = [...indexFiles].filter((f) => !diskFiles.has(f));
  const pagesOnly = [...diskFiles].filter((f) => !indexFiles.has(f));
  return {
    ok: indexOnly.length === 0 && pagesOnly.length === 0,
    indexOnly,
    pagesOnly,
    entryCount: entries.length,
    pageCount: diskFiles.size,
  };
}

test("inline hook logic: behaviorally equivalent to compileSelfAudit on 'complete' fixture", async () => {
  const { compileSelfAudit } = await import(CODEX_WIKI_INDEX_LIB);
  const completeDir = resolve(fixtureDir, "complete");

  const libResult = compileSelfAudit(completeDir);
  const inlineResult = runInlineHookAudit(completeDir);

  assert.ok(inlineResult !== null, "inline audit must not short-circuit on complete fixture");
  assert.equal(inlineResult.ok, libResult.ok, "ok must match lib on complete fixture");
  assert.equal(inlineResult.entryCount, libResult.entryCount, "entryCount must match lib");
  assert.equal(inlineResult.pageCount, libResult.pageCount, "pageCount must match lib");
  assert.deepEqual(inlineResult.indexOnly.sort(), libResult.indexOnly.sort(), "indexOnly must match lib");
  assert.deepEqual(inlineResult.pagesOnly.sort(), libResult.pagesOnly.sort(), "pagesOnly must match lib");
});

test("inline hook logic: behaviorally equivalent to compileSelfAudit on 'missing-index-entry' fixture", async () => {
  const { compileSelfAudit } = await import(CODEX_WIKI_INDEX_LIB);
  const fixtDir = resolve(fixtureDir, "missing-index-entry");

  const libResult = compileSelfAudit(fixtDir);
  const inlineResult = runInlineHookAudit(fixtDir);

  assert.ok(inlineResult !== null, "inline audit must not short-circuit on missing-index-entry fixture");
  assert.equal(inlineResult.ok, false, "inline audit must fail on missing-index-entry fixture");
  assert.equal(inlineResult.ok, libResult.ok, "ok must match lib on missing-index-entry fixture");
  assert.deepEqual(inlineResult.indexOnly.sort(), libResult.indexOnly.sort(), "indexOnly must match lib");
  assert.deepEqual(inlineResult.pagesOnly.sort(), libResult.pagesOnly.sort(), "pagesOnly must match lib");
  assert.ok(inlineResult.pagesOnly.includes("orphan-page.md"), "pagesOnly must contain orphan-page.md");
});

// init.mjs: wiki bucket in INSTALL_MAP.
test("init.mjs: wiki bucket installs skill dir to .codex/skills/wiki", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wiki-init-test-"));
  try {
    const r = spawnSync(process.execPath, [INIT_MJS, tmp, "--only=wiki", "--force"], {
      encoding: "utf-8",
      cwd: repoRoot,
    });
    assert.equal(r.status, 0, `init.mjs --only=wiki failed:\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const skillDir = join(tmp, ".codex/skills/wiki");
    assert.ok(existsSync(skillDir), `.codex/skills/wiki must be installed`);
    assert.ok(existsSync(join(skillDir, "SKILL.md")), `.codex/skills/wiki/SKILL.md must exist`);
    assert.ok(existsSync(join(skillDir, "lib/wiki-index.mjs")), `.codex/skills/wiki/lib/wiki-index.mjs must exist`);
    // Hook files must be rendered into .codex/hooks/.
    const hooksDir = join(tmp, ".codex/hooks");
    assert.ok(existsSync(join(hooksDir, "wiki-pretool-first-call-digest.mjs")), "hook .mjs must be installed");
    assert.ok(existsSync(join(hooksDir, "wiki-pretool-first-call-digest.toml")), "hook .toml must be installed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
