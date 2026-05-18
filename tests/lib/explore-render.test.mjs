import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "../../plugins/harness-explore/bin/lib/render.mjs";
import { render as renderDirPrompt } from "../../plugins/harness-explore/skills/explore/lib/dir-subagent-prompt.mjs";

const TEMPLATES = resolve(
  "plugins/harness-explore/skills/explore/templates",
);

function readTpl(name) {
  return readFileSync(resolve(TEMPLATES, name), "utf-8");
}

test("map.md.hbs renders with a minimal fixture", () => {
  const tpl = readTpl("map.md.hbs");
  const out = render(tpl, {
    sha: "abc12345",
    generatedAt: "2026-05-18T12:00:00Z",
    root: "/some/repo",
    sizeCategory: "small",
    totalFiles: 47,
    totalLines: 3210,
    dirs: [
      {
        dir: "src/auth",
        fileCount: 12,
        totalLines: 800,
        purpose: "Authentication primitives.",
        publicEntryPoints: ["src/auth/index.ts"],
        notableConventions: ["async/await throughout"],
        entries: [
          { path: "src/auth/session.ts", kind: "module", lines: 142, exports: "createSession, Session" },
        ],
      },
    ],
    languages: ["ts:40", "md:7"],
    publicEntryPoints: ["src/auth/index.ts"],
    depGraph: {
      supportedLanguages: "ts",
      orphans: ["src/legacy.ts"],
    },
  });

  assert.match(out, /# Codebase map — `abc12345`/);
  assert.match(out, /\*\*Generated:\*\* 2026-05-18T12:00:00Z/);
  assert.match(out, /\*\*47\*\* total files/);
  assert.match(out, /### `src\/auth\/`/);
  assert.match(out, /Authentication primitives\./);
  assert.match(out, /`src\/auth\/index\.ts`/);
  assert.match(out, /async\/await throughout/);
  assert.match(out, /`src\/legacy\.ts`/);
});

test("query-prompt.md.hbs renders 'where' fixture", () => {
  const tpl = readTpl("query-prompt.md.hbs");
  const out = render(tpl, {
    isWhere: true,
    symbol: "createSession",
    matchCount: 1,
    multipleMatches: false,
    source: "exports",
    hasFuzzy: false,
    matches: [
      { file: "src/auth/session.ts", line: 12, kind: "function" },
    ],
    noMatches: false,
  });
  assert.match(out, /Symbol `createSession` — 1 match/);
  assert.match(out, /`src\/auth\/session\.ts`:12 — function/);
});

test("query-prompt.md.hbs renders 'deps' fixture", () => {
  const tpl = readTpl("query-prompt.md.hbs");
  const out = render(tpl, {
    isDeps: true,
    file: "src/auth/session.ts",
    importCount: 2,
    importedByCount: 1,
    imports: ["src/db/index.ts", "src/util/time.ts"],
    importedBy: ["src/index.ts"],
    noImports: false,
    noImportedBy: false,
    notInMap: false,
  });
  assert.match(out, /File `src\/auth\/session\.ts` — imports \*\*2\*\*, used by \*\*1\*\*/);
  assert.match(out, /`src\/db\/index\.ts`/);
  assert.match(out, /`src\/index\.ts`/);
});

test("dir-subagent-prompt: render produces a prompt with dir + token budget + ignore patterns", () => {
  const prompt = renderDirPrompt("src/auth", "/abs/repo", {
    tokenBudget: 3000,
    ignorePatterns: ["node_modules", "dist"],
  });
  assert.match(prompt, /Repository root \(your CWD\): `\/abs\/repo`/);
  assert.match(prompt, /Target directory \(repo-relative\): `src\/auth`/);
  assert.match(prompt, /≤ 3000 tokens/);
  assert.match(prompt, /`node_modules`/);
  assert.match(prompt, /`dist`/);
  assert.match(prompt, /"dir": "src\/auth"/);
});

test("dir-subagent-prompt: no ignore patterns → no ignore section emitted", () => {
  const prompt = renderDirPrompt("docs", "/abs/repo", { tokenBudget: 4000, ignorePatterns: [] });
  assert.match(prompt, /Target directory \(repo-relative\): `docs`/);
  // The {{#if hasIgnorePatterns}} block should skip
  assert.ok(!/Ignore patterns/.test(prompt), "ignore section should be absent");
});
