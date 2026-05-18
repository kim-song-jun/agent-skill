// Dir-subagent prompt — renders the per-directory scanning prompt
// for the Phase 1 parallel fan-out.
//
// IMPORTANT — DISPATCH RESPONSIBILITY:
//   This module returns the PROMPT STRING ONLY. It does NOT dispatch
//   any subagent. Actual dispatch happens at the orchestrator level
//   (the `/explore` skill walks the work list, calls
//   `render(dir, root, opts)` for each, and invokes the platform
//   `Task` tool — or the equivalent dispatching-parallel-agents
//   primitive — itself). Keeping dispatch out of the lib keeps the
//   module pure (and testable without spawning agents).
//
// Contract:
//   render(dir, root, options) → string
//     `dir`     — repo-relative directory name (e.g., "src/auth").
//     `root`    — absolute repo root (for the subagent's CWD context).
//     `options` —
//       tokenBudget: number      (default 4000)
//       ignorePatterns: string[] (default [])
//       depth: number            (default 3 — beyond this, summarise)
//       templatePath: string?    (override for tests)
//
// The orchestrator's RESULT-AGGREGATION CONTRACT is:
//   - Subagent returns ONE JSON object matching the schema baked into
//     the prompt template (`dir-summary-prompt.md.hbs`).
//   - Orchestrator JSON.parse()s the reply. On parse failure → mark
//     dir `incomplete: true` with reason "malformed-json".
//   - Required fields: `dir`, `fileCount`, `entries`. Missing →
//     `incomplete: true` with reason "missing-required-field".
//   - The orchestrator does NOT trust subagent-reported `incomplete`
//     status; it sets that flag itself based on validation outcome.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render as renderTemplate } from "./_render-shim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE = resolve(here, "..", "templates", "dir-summary-prompt.md.hbs");

export function render(dir, root, options = {}) {
  if (!dir || typeof dir !== "string") {
    throw new Error("render: dir required");
  }
  if (!root || typeof root !== "string") {
    throw new Error("render: root required");
  }
  const tplPath = options.templatePath ?? DEFAULT_TEMPLATE;
  const tpl = readFileSync(tplPath, "utf-8");
  const ctx = {
    dir,
    root,
    tokenBudget: options.tokenBudget ?? 4000,
    depth: options.depth ?? 3,
    ignorePatterns: (options.ignorePatterns ?? []).map((p) => ({ pat: p })),
    hasIgnorePatterns: (options.ignorePatterns ?? []).length > 0,
  };
  return renderTemplate(tpl, ctx);
}
