import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  topLevelDirs,
  walk,
  applyIgnore,
  loadGitignore,
} from "../../plugins/harness-explore/skills/explore/lib/tree-walker.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "explore-tree-"));
}

function makeRepo(root, layout) {
  // layout: { "path/to/file": "content", "subdir/": null }
  for (const [path, content] of Object.entries(layout)) {
    const full = join(root, path);
    if (path.endsWith("/")) {
      mkdirSync(full, { recursive: true });
    } else {
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content ?? "");
    }
  }
}

test("topLevelDirs: returns only immediate subdirectories, sorted", () => {
  const root = tmp();
  try {
    makeRepo(root, {
      "src/": null,
      "tests/": null,
      "docs/": null,
      "README.md": "# x",
      "src/inner/": null,
    });
    const dirs = topLevelDirs(root);
    assert.deepEqual(dirs, ["docs", "src", "tests"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("topLevelDirs: excludes ignore-pattern matches (basename + glob)", () => {
  const root = tmp();
  try {
    makeRepo(root, {
      "src/": null,
      "node_modules/": null,
      "dist/": null,
      ".explore-cache/": null,
      "build123/": null,
    });
    const dirs = topLevelDirs(root, ["node_modules", "dist", ".explore-cache", "build*"]);
    assert.deepEqual(dirs, ["src"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("topLevelDirs: empty root → empty array", () => {
  const root = tmp();
  try {
    const dirs = topLevelDirs(root);
    assert.deepEqual(dirs, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("topLevelDirs: nonexistent root → empty array (no throw)", () => {
  const dirs = topLevelDirs("/tmp/definitely-not-here-explore-xyz");
  assert.deepEqual(dirs, []);
});

test("walk: respects maxDepth (default 10, override 1)", () => {
  const root = tmp();
  try {
    makeRepo(root, {
      "a.txt": "a",
      "lvl1/b.txt": "b",
      "lvl1/lvl2/c.txt": "c",
      "lvl1/lvl2/lvl3/d.txt": "d",
    });
    const shallow = [...walk(root, [], { maxDepth: 1 })].map((p) => p.slice(root.length));
    // depth 0 = root, depth 1 = lvl1, so we should see a.txt + lvl1/b.txt
    assert.ok(shallow.some((p) => p.endsWith("a.txt")));
    assert.ok(shallow.some((p) => p.endsWith("/lvl1/b.txt")));
    assert.ok(!shallow.some((p) => p.endsWith("c.txt")), "should not descend to depth 2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("walk: honours ignore patterns at every depth", () => {
  const root = tmp();
  try {
    makeRepo(root, {
      "src/a.ts": "//",
      "src/node_modules/x.js": "//",
      "node_modules/y.js": "//",
      "src/sub/node_modules/z.js": "//",
    });
    const files = [...walk(root, ["node_modules"])].map((p) => p.slice(root.length));
    assert.ok(files.some((p) => p.endsWith("/src/a.ts")));
    assert.ok(!files.some((p) => p.includes("node_modules")), `node_modules leaked: ${files.join(", ")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("walk: symlink cycles do not cause infinite recursion", () => {
  const root = tmp();
  try {
    makeRepo(root, { "a/b.txt": "b" });
    // Create a cycle: a/loop → a
    try {
      symlinkSync(join(root, "a"), join(root, "a", "loop"));
    } catch {
      // skip on filesystems that don't support symlinks
      return;
    }
    const files = [...walk(root, [], { maxDepth: 50 })];
    // Should terminate (and produce at least b.txt)
    assert.ok(files.length >= 1);
    assert.ok(files.some((p) => p.endsWith("b.txt")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadGitignore: reads .gitignore + .explore-ignore union", () => {
  const root = tmp();
  try {
    writeFileSync(join(root, ".gitignore"), "node_modules\ndist\n# comment\n\n");
    writeFileSync(join(root, ".explore-ignore"), "vendor\n");
    const patterns = loadGitignore(root);
    assert.deepEqual(patterns, ["node_modules", "dist", "vendor"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadGitignore: missing files → empty array (no throw)", () => {
  const root = tmp();
  try {
    const patterns = loadGitignore(root);
    assert.deepEqual(patterns, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyIgnore: filters basenames by pattern list", () => {
  const result = applyIgnore(
    ["src/foo.ts", "src/bar.test.ts", "src/baz.ts"],
    ["*.test.ts"],
  );
  assert.deepEqual(result, ["src/foo.ts", "src/baz.ts"]);
});
