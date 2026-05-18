// dispatch-strategy.mjs — Phase 0 preflight detection of the `agent` hook
// for visual-qa-codex. Parallel sibling of agent-all-codex's
// dispatch-strategy.mjs; differs only in the matcher prefix
// (`visual-qa/page/` vs `agent-all/wave/`).
//
// Decides between two dispatch strategies (see SKILL.md "Pipeline" + Phase 3):
//
//   "agent-hook" — Codex's `[[hooks.agent]]` matcher is registered for
//                  the `visual-qa/page/.*` task prefix, so we can fan-out
//                  one subagent per page via `codex agent dispatch` +
//                  `codex agent wait`.
//
//   "sequential" — Hook absent. We invoke `.codex/skills/visual-qa-page/SKILL.md`
//                  one page at a time.
//
// TODO: requires live Codex CLI to verify [[hooks.agent]] schema. The
// detection probes the *string shape* of the registered matcher block —
// if Codex's TOML accepts a different form (e.g. `[hooks] agent = [...]`),
// the regex below needs updating after the research spike completes.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const VISUAL_QA_MATCHER_PREFIX = "visual-qa/page/";

const VALID_STRATEGIES = new Set(["agent-hook", "sequential"]);

export function defaultCodexConfigPath() {
  return resolve(homedir(), ".codex", "config.toml");
}

/**
 * Probe TOML text for `[[hooks.agent]]` with a visual-qa matcher.
 *
 * Implementation note: we deliberately avoid pulling in a TOML parser
 * dependency here (Phase 0 spec calls for a `grep`-equivalent probe).
 * The `bin/install-hook.mjs` installer is where full TOML semantics live.
 *
 * @param {string} tomlText
 * @returns {boolean}
 */
export function hasAgentHookInToml(tomlText) {
  if (typeof tomlText !== "string" || tomlText.length === 0) return false;
  const lines = tomlText.split(/\r?\n/);
  let inAgentHook = false;
  let sectionHasMatch = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[\[?[^\]]+\]\]?$/.test(line)) {
      if (inAgentHook && sectionHasMatch) return true;
      inAgentHook = /^\[\[hooks\.agent\]\]$/.test(line);
      sectionHasMatch = false;
      continue;
    }
    if (!inAgentHook) continue;
    const matcherMatch = line.match(/^matcher\s*=\s*(['"])(.*)\1\s*$/);
    if (matcherMatch && matcherMatch[2].includes(VISUAL_QA_MATCHER_PREFIX)) {
      sectionHasMatch = true;
    }
  }
  return inAgentHook && sectionHasMatch;
}

/**
 * Decide the dispatch strategy for visual-qa-codex.
 *
 * @param {object} [opts]
 * @param {string} [opts.configPath]
 * @param {string} [opts.override] — `--dispatch=agent-hook|sequential`
 * @returns {{strategy: "agent-hook"|"sequential", reason: string,
 *           probedPath: string|null, override: boolean}}
 */
export function detectDispatchStrategy(opts = {}) {
  const override = opts.override ?? null;
  if (override) {
    if (!VALID_STRATEGIES.has(override)) {
      throw new Error(
        `dispatch-strategy: invalid --dispatch override "${override}" `
        + `(expected one of: ${[...VALID_STRATEGIES].join(", ")})`,
      );
    }
    return {
      strategy: override,
      reason: `--dispatch=${override} override`,
      probedPath: null,
      override: true,
    };
  }
  const configPath = opts.configPath ?? defaultCodexConfigPath();
  if (!existsSync(configPath)) {
    return {
      strategy: "sequential",
      reason: `${configPath} not found; agent hook unavailable`,
      probedPath: configPath,
      override: false,
    };
  }
  const tomlText = readFileSync(configPath, "utf-8");
  if (hasAgentHookInToml(tomlText)) {
    return {
      strategy: "agent-hook",
      reason: `[[hooks.agent]] matcher for ${VISUAL_QA_MATCHER_PREFIX} found in ${configPath}`,
      probedPath: configPath,
      override: false,
    };
  }
  return {
    strategy: "sequential",
    reason: `[[hooks.agent]] not registered in ${configPath}; falling back`,
    probedPath: configPath,
    override: false,
  };
}

export const __internal = { VALID_STRATEGIES };
