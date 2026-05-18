// dispatch-strategy.mjs — Phase 0 preflight detection of the `agent` hook
// for agent-all-codex.
//
// Decides between two dispatch strategies (see SKILL.md "Pipeline" + Phase 3):
//
//   "agent-hook" — Codex's `[[hooks.agent]]` matcher is registered for
//                  the `agent-all/wave/.*` task prefix, so we can fan-out
//                  in parallel via `codex agent dispatch` + `codex agent wait`.
//
//   "sequential" — Hook absent. We fall back to invoking
//                  `.codex/skills/<role>/SKILL.md` one task at a time.
//
// TODO: requires live Codex CLI to verify [[hooks.agent]] schema. The
// detection probes the *string shape* of the registered matcher block —
// if Codex's TOML accepts a different form (e.g. `[hooks] agent = [...]`),
// the regex below needs updating after the research spike completes.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const AGENT_ALL_MATCHER_PREFIX = "agent-all/wave/";

const VALID_STRATEGIES = new Set(["agent-hook", "sequential"]);

/**
 * Default location for Codex's user-level config.
 *
 * Codex also supports a project-level `.codex/config.toml`; callers may
 * pass an explicit `configPath` to probe that file instead.
 */
export function defaultCodexConfigPath() {
  return resolve(homedir(), ".codex", "config.toml");
}

/**
 * Inspect a TOML config string for an `[[hooks.agent]]` entry that
 * matches the agent-all wave matcher.
 *
 * We intentionally avoid pulling in a full TOML parser — the detection
 * is a string-shape probe (Phase 0 spec: "grep `\\[\\[hooks.agent\\]\\]`
 * `~/.codex/config.toml` or equivalent"). The installer (bin/install-hook.mjs)
 * is responsible for full TOML parsing and merge semantics.
 *
 * @param {string} tomlText
 * @returns {boolean}
 */
export function hasAgentHookInToml(tomlText) {
  if (typeof tomlText !== "string" || tomlText.length === 0) return false;
  // Look for a [[hooks.agent]] table-array header that is followed (within
  // a short window) by a matcher referencing the agent-all wave prefix.
  // We scan section-by-section to avoid cross-section bleed.
  const lines = tomlText.split(/\r?\n/);
  let inAgentHook = false;
  let sectionHasMatch = false;
  for (const raw of lines) {
    const line = raw.trim();
    // New table or table-array header resets the section state.
    if (/^\[\[?[^\]]+\]\]?$/.test(line)) {
      if (inAgentHook && sectionHasMatch) return true;
      inAgentHook = /^\[\[hooks\.agent\]\]$/.test(line);
      sectionHasMatch = false;
      continue;
    }
    if (!inAgentHook) continue;
    // Matcher line — TOML string after `matcher =`. Accept either the
    // exact wave-prefix string or a regex that would match it.
    const matcherMatch = line.match(/^matcher\s*=\s*(['"])(.*)\1\s*$/);
    if (matcherMatch) {
      const value = matcherMatch[2];
      if (value.includes(AGENT_ALL_MATCHER_PREFIX)) {
        sectionHasMatch = true;
      }
    }
  }
  return inAgentHook && sectionHasMatch;
}

/**
 * Read the Codex config (if present) and decide the dispatch strategy.
 *
 * @param {object} [opts]
 * @param {string} [opts.configPath] — path to the TOML config to probe
 * @param {string} [opts.override]   — `--dispatch=...` CLI override
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
      reason: `[[hooks.agent]] matcher for ${AGENT_ALL_MATCHER_PREFIX} found in ${configPath}`,
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
