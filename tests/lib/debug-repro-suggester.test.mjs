import { test } from "node:test";
import assert from "node:assert/strict";

import {
  suggestCommands,
  extractFromManifest,
  extractKeyword,
} from "../../plugins/harness-debug/skills/debug/lib/repro-suggester.mjs";

// Build a synthetic project-tree reader so the test never touches disk.
function makeReader(map) {
  return (name) => (name in map ? map[name] : null);
}

// ---------- extractFromManifest unit ----------

test("repro-suggester: package.json test script → npm run test candidate", () => {
  const out = extractFromManifest("package.json", JSON.stringify({
    name: "x",
    scripts: { test: "vitest", "test:unit": "vitest --run", lint: "eslint ." },
  }));
  const commands = out.map((c) => c.command);
  assert.ok(commands.includes("npm run test"));
  assert.ok(commands.includes("npm run test:unit"));
});

test("repro-suggester: pyproject.toml with pytest section → pytest -x", () => {
  const out = extractFromManifest("pyproject.toml",
    `[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`);
  assert.equal(out.length, 1);
  assert.equal(out[0].command, "pytest -x");
});

test("repro-suggester: Cargo.toml → cargo test", () => {
  const out = extractFromManifest("Cargo.toml", `[package]\nname = "x"\n`);
  assert.equal(out[0].command, "cargo test");
});

test("repro-suggester: Makefile with test target → make test", () => {
  const out = extractFromManifest("Makefile", `test:\n\tpytest\ncheck:\n\tlint\nall: test check\n`);
  const commands = out.map((c) => c.command);
  assert.ok(commands.includes("make test"));
  assert.ok(commands.includes("make check"));
});

test("repro-suggester: go.mod → go test ./...", () => {
  const out = extractFromManifest("go.mod", "module example.com/x\n\ngo 1.20\n");
  assert.equal(out[0].command, "go test ./...");
});

// ---------- extractKeyword unit ----------

test("repro-suggester: extractKeyword skips stopwords and short tokens", () => {
  assert.equal(extractKeyword("login is broken"), "login");
  assert.equal(extractKeyword("the cache fails"), "cache");
  assert.equal(extractKeyword("doesn't work"), "work");
  assert.equal(extractKeyword(""), null);
  assert.equal(extractKeyword(null), null);
});

// ---------- suggestCommands integration ----------

test("repro-suggester: suggestCommands surfaces candidates from a node project", () => {
  const read = makeReader({
    "package.json": JSON.stringify({ name: "x", scripts: { test: "vitest", ci: "vitest --coverage" } }),
  });
  const r = suggestCommands({ projectRoot: "/fake", vague: "login broken", readFile: read });
  assert.ok(r.candidates.length >= 2);
  // keyword-scoped variant should be appended
  assert.ok(r.candidates.some((c) => c.command.includes("login")),
    `expected keyword-scoped variant; got ${JSON.stringify(r.candidates.map((c) => c.command))}`);
});

test("repro-suggester: suggestCommands surfaces candidates from a python project", () => {
  const read = makeReader({
    "pyproject.toml": "[tool.pytest.ini_options]\ntestpaths = ['tests']\n",
  });
  const r = suggestCommands({ projectRoot: "/fake", vague: "auth fails", readFile: read });
  assert.ok(r.candidates.some((c) => c.command === "pytest -x"));
  assert.ok(r.candidates.some((c) => c.command.includes("-k auth")),
    "expected keyword-scoped pytest variant");
});

test("repro-suggester: suggestCommands returns full questions when no manifest found", () => {
  const r = suggestCommands({ projectRoot: "/fake", vague: "something", readFile: () => null });
  assert.equal(r.candidates.length, 0);
  assert.ok(r.questions.length >= 3, `expected ≥3 questions; got ${r.questions.length}`);
});

test("repro-suggester: suggestCommands de-duplicates and caps at 3 candidates", () => {
  const read = makeReader({
    "package.json": JSON.stringify({
      name: "x",
      scripts: { test: "v", "test:unit": "v", "test:integration": "v", ci: "v" },
    }),
  });
  const r = suggestCommands({ projectRoot: "/fake", vague: "", readFile: read });
  assert.ok(r.candidates.length <= 3, `expected ≤3 candidates; got ${r.candidates.length}`);
  const commands = r.candidates.map((c) => c.command);
  assert.equal(new Set(commands).size, commands.length, "no duplicates");
});
