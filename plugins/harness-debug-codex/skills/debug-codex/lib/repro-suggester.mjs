// repro-suggester.mjs — heuristic for proposing a minimal repro
// command when the user supplies only a vague report.
//
// Public API:
//   suggestCommands({projectRoot, vague, readFile?}) →
//     {questions[], candidates[{command, why, source}]}
//
// Strategy:
//   1. Scan well-known project manifests (package.json, pyproject.toml,
//      Cargo.toml, Makefile, justfile) for a "test" or "ci" command.
//   2. Use keyword hints from the vague description ("login broken" →
//      grep test files for /login/i).
//   3. Surface at most 3 candidates ranked by specificity.
//
// `readFile` is injectable so tests can supply synthetic project trees
// without touching the disk.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "Makefile",
  "justfile",
  "go.mod",
];

function defaultReader(projectRoot) {
  return (name) => {
    const p = join(projectRoot, name);
    if (!existsSync(p)) return null;
    try { return readFileSync(p, "utf-8"); } catch { return null; }
  };
}

// Extract candidate test/lint/run commands from a single manifest's
// contents. Returns array of {command, why}.
export function extractFromManifest(name, contents) {
  if (!contents) return [];
  const out = [];
  if (name === "package.json") {
    try {
      const pkg = JSON.parse(contents);
      const scripts = pkg.scripts ?? {};
      for (const key of ["test", "test:unit", "test:integration", "ci"]) {
        if (typeof scripts[key] === "string") {
          out.push({ command: `npm run ${key}`, why: `package.json scripts.${key}`, source: "package.json" });
        }
      }
    } catch { /* malformed json — skip */ }
  } else if (name === "pyproject.toml") {
    // Lightweight: look for `[tool.pytest.ini_options]` or testpaths.
    if (/\[tool\.pytest\b/.test(contents) || /pytest/.test(contents)) {
      out.push({ command: "pytest -x", why: "pyproject.toml mentions pytest", source: "pyproject.toml" });
    }
  } else if (name === "Cargo.toml") {
    out.push({ command: "cargo test", why: "Cargo.toml present", source: "Cargo.toml" });
  } else if (name === "Makefile") {
    const targets = [...contents.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]);
    if (targets.includes("test")) {
      out.push({ command: "make test", why: "Makefile has test target", source: "Makefile" });
    }
    if (targets.includes("check")) {
      out.push({ command: "make check", why: "Makefile has check target", source: "Makefile" });
    }
  } else if (name === "justfile") {
    const recipes = [...contents.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]);
    if (recipes.includes("test")) {
      out.push({ command: "just test", why: "justfile has test recipe", source: "justfile" });
    }
  } else if (name === "go.mod") {
    out.push({ command: "go test ./...", why: "go.mod present", source: "go.mod" });
  }
  return out;
}

const VAGUE_QUESTIONS = [
  "Which command produced the failure? (paste exact)",
  "What was the last state where it worked? (commit / time / 'I don't know')",
  "Is the failure deterministic, flaky, or environment-dependent?",
];

export function suggestCommands({ projectRoot = process.cwd(), vague = "", readFile } = {}) {
  const read = readFile ?? defaultReader(projectRoot);
  const candidates = [];
  for (const m of MANIFEST_FILES) {
    const contents = read(m);
    if (contents == null) continue;
    candidates.push(...extractFromManifest(m, contents));
  }

  // Keyword hint: if vague mentions a noun, try to scope a test to it.
  const keyword = extractKeyword(vague);
  if (keyword) {
    // Promote a keyword-scoped version of the first js/py candidate.
    for (const c of candidates) {
      if (c.command.startsWith("npm run")) {
        candidates.push({
          command: `${c.command} -- --testNamePattern=${keyword}`,
          why: `narrowed by keyword "${keyword}" from vague report`,
          source: c.source,
        });
        break;
      }
      if (c.command === "pytest -x") {
        candidates.push({
          command: `pytest -x -k ${keyword}`,
          why: `narrowed by keyword "${keyword}" from vague report`,
          source: c.source,
        });
        break;
      }
    }
  }

  // De-duplicate by command string; cap at 3 strongest candidates.
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    if (seen.has(c.command)) continue;
    seen.add(c.command);
    unique.push(c);
    if (unique.length >= 3) break;
  }

  return {
    questions: unique.length === 0 ? VAGUE_QUESTIONS : VAGUE_QUESTIONS.slice(0, 1),
    candidates: unique,
  };
}

// Extract the first noun-like keyword (lowercase, length 3-20, alpha)
// from a vague failure description. Stopwords filtered.
const STOPWORDS = new Set([
  "the", "this", "that", "broken", "fails", "failed", "failing",
  "isnt", "isn", "doesnt", "doesn", "wont", "won", "cant", "can",
  "not", "working", "but", "and", "with", "from", "when", "what",
  "why", "how", "where",
]);
export function extractKeyword(text) {
  if (!text) return null;
  const words = String(text).toLowerCase().match(/[a-z][a-z_-]{2,19}/g) ?? [];
  for (const w of words) {
    if (!STOPWORDS.has(w)) return w;
  }
  return null;
}
