/**
 * DEFECT G4 — Install-coverage invariant test.
 *
 * Asserts (no mocks):
 * 1. Every relative `./lib/...` import in CC phase docs resolves to a real file
 *    under the floor plugin's agent-all skill dir (the installed runtime bundle).
 * 2. NO phase import escapes to another plugin (harness-floor-copilot / cursor /
 *    codex / gemini) — CC is self-contained.
 * 3. NO phase import uses the source-checkout substring `./plugins/harness-floor`
 *    (proves the 4-gate.md:145 hardcoded repo path is gone).
 *
 * This test would have FAILED before the Defect C+E fixes:
 *   - phases/3-dispatch.md imported from "../../../harness-floor-copilot/..."
 *   - phases/4-gate.md imported from "./plugins/harness-floor/..."
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const SKILL_DIR = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  "../../plugins/harness-floor/skills/agent-all",
);
const PHASES_DIR = join(SKILL_DIR, "phases");

// Cross-plugin names that must NOT appear in any CC phase import
const CROSS_PLUGIN_SUBSTRINGS = [
  "harness-floor-copilot",
  "harness-floor-cursor",
  "harness-floor-codex",
  "harness-floor-gemini",
];

// Source-checkout path that must NOT appear (Defect E)
const SOURCE_CHECKOUT_SUBSTRINGS = ["./plugins/harness-floor"];

function extractImportSpecs(text) {
  const specs = [];
  // static imports: import ... from "spec"
  for (const m of text.matchAll(/\bimport\s+[^'"]*from\s+['"]([^'"]+)['"]/g)) {
    specs.push(m[1]);
  }
  // dynamic imports: import('spec') or import("spec")
  for (const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specs.push(m[1]);
  }
  // also catch backtick dynamic imports in code snippets
  for (const m of text.matchAll(/\bimport\s*\(\s*`([^`]+)`\s*\)/g)) {
    // Only collect if there are no template interpolations making it dynamic
    if (!m[1].includes("${")) specs.push(m[1]);
  }
  return specs;
}

function isNodeBuiltin(spec) {
  return spec.startsWith("node:") || /^(fs|path|url|os|child_process|util|crypto|stream|events|assert)$/.test(spec);
}

test("all CC phase docs have self-contained relative lib imports that exist on disk", () => {
  const phaseFiles = readdirSync(PHASES_DIR).filter((f) => f.endsWith(".md"));
  assert.ok(phaseFiles.length > 0, "Must find at least one phase .md file");

  const issues = [];

  for (const file of phaseFiles) {
    const text = readFileSync(join(PHASES_DIR, file), "utf-8");
    const specs = extractImportSpecs(text);

    for (const spec of specs) {
      if (isNodeBuiltin(spec)) continue;
      if (spec.startsWith("http://") || spec.startsWith("https://")) continue;

      // Check cross-plugin escapes
      for (const crossPlugin of CROSS_PLUGIN_SUBSTRINGS) {
        if (spec.includes(crossPlugin)) {
          issues.push(`${file}: cross-plugin import "${spec}" references ${crossPlugin} — CC must be self-contained`);
        }
      }

      // Check source-checkout paths
      for (const checkout of SOURCE_CHECKOUT_SUBSTRINGS) {
        if (spec.includes(checkout)) {
          issues.push(`${file}: source-checkout import "${spec}" — use ./lib/... relative path instead`);
        }
      }

      // For relative imports starting with ./lib or ./lib/ — verify file exists in skill dir
      if (spec.startsWith("./lib/") || spec.startsWith("./lib")) {
        const absPath = resolve(SKILL_DIR, spec);
        if (!existsSync(absPath)) {
          issues.push(`${file}: relative import "${spec}" does not exist at ${absPath}`);
        }
      }
    }
  }

  assert.deepEqual(
    issues,
    [],
    `Install-coverage failures:\n${issues.join("\n")}`,
  );
});

test("no CC phase imports reference other plugin directories", () => {
  const phaseFiles = readdirSync(PHASES_DIR).filter((f) => f.endsWith(".md"));

  const violations = [];
  for (const file of phaseFiles) {
    const text = readFileSync(join(PHASES_DIR, file), "utf-8");
    const specs = extractImportSpecs(text);
    for (const spec of specs) {
      for (const crossPlugin of CROSS_PLUGIN_SUBSTRINGS) {
        if (spec.includes(crossPlugin)) {
          violations.push(`${file}: "${spec}"`);
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Cross-plugin import violations (CC must be self-contained):\n${violations.join("\n")}`,
  );
});

test("no CC phase imports use ./plugins/harness-floor source-checkout path", () => {
  const phaseFiles = readdirSync(PHASES_DIR).filter((f) => f.endsWith(".md"));

  const violations = [];
  for (const file of phaseFiles) {
    const text = readFileSync(join(PHASES_DIR, file), "utf-8");
    const specs = extractImportSpecs(text);
    for (const spec of specs) {
      for (const checkout of SOURCE_CHECKOUT_SUBSTRINGS) {
        if (spec.includes(checkout)) {
          violations.push(`${file}: "${spec}"`);
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Source-checkout path violations (must use ./lib/... relative imports):\n${violations.join("\n")}`,
  );
});
