// dispatch-strategy.mjs — Phase 0 dispatch selection for visual-qa-codex.
//
// Decides between two dispatch strategies (see SKILL.md "Pipeline" + Phase 3):
//
// Current Codex hooks expose command events such as PreToolUse and
// PostToolUse. The legacy agent-dispatch hook assumed by early scaffold
// notes is not available, so auto-detection always selects sequential.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const VISUAL_QA_MATCHER_PREFIX = "visual-qa/page/";

const VALID_STRATEGIES = new Set(["sequential"]);
const UNSUPPORTED_AGENT_HOOK_REASON = "agent-hook dispatch is unsupported by current Codex hooks; sequential dispatch is used";

export function defaultCodexConfigPath() {
  return resolve(homedir(), ".codex", "config.toml");
}

/**
 * Current Codex has no supported agent-dispatch hook table. Legacy
 * snippets are ignored so stale config cannot select a broken path.
 *
 * @param {string} tomlText
 * @returns {boolean}
 */
export function hasAgentHookInToml(tomlText) {
  void tomlText;
  return false;
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
      if (override === "agent-hook") {
        throw new Error(`dispatch-strategy: ${UNSUPPORTED_AGENT_HOOK_REASON}`);
      }
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
      strategy: "sequential",
      reason: UNSUPPORTED_AGENT_HOOK_REASON,
      probedPath: configPath,
      override: false,
    };
  }
  return {
    strategy: "sequential",
    reason: UNSUPPORTED_AGENT_HOOK_REASON,
    probedPath: configPath,
    override: false,
  };
}

export const __internal = { VALID_STRATEGIES };
