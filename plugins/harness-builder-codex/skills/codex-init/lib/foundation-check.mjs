export const FOUNDATIONS = [
  {
    key: "superpowers",
    match: /(^|[/@])superpowers(@|$)/,
    plugin: "superpowers@claude-plugins-official",
    marketplace: "claude-plugins-official",
    install: "/plugin install superpowers@claude-plugins-official",
  },
  {
    key: "context-mode",
    match: /(^|[/@])context-mode(@|$)/,
    plugin: "context-mode@context-mode",
    marketplace: "context-mode",
    install: "/plugin install context-mode@context-mode",
  },
];

export const FOUNDATION_MARKETPLACES = [...new Set(FOUNDATIONS.map((foundation) => foundation.marketplace))];
export const FOUNDATION_PLUGINS = FOUNDATIONS.map((foundation) => foundation.plugin);

// Repo slug for the self-update command. Defaults to the canonical upstream,
// but is overridable via $AGENT_SKILL_REPO so forks / transfers / renames do
// not bake a dead `raw.githubusercontent.com` path into every scaffolded
// CLAUDE.md (the update command 404s otherwise).
export const UPDATE_REPO = process.env.AGENT_SKILL_REPO || "kim-song-jun/agent-skill";
export const UPDATE_COMMAND =
  `bash <(curl -fsSL https://raw.githubusercontent.com/${UPDATE_REPO}/main/scripts/update.sh) --foundations-only`;

export function scanFoundationState({ installedPluginIds = [] } = {}) {
  const missing = FOUNDATIONS
    .filter((foundation) => !installedPluginIds.some((id) => foundation.match.test(String(id))))
    .map((foundation) => foundation.key);
  const instructions = FOUNDATIONS
    .filter((foundation) => missing.includes(foundation.key))
    .map((foundation) => foundation.install);
  return {
    degraded: missing.length > 0,
    missing,
    updateCommand: UPDATE_COMMAND,
    instructions,
  };
}
