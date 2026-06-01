const FOUNDATIONS = [
  {
    key: "superpowers",
    match: /(^|[/@])superpowers(@|$)/,
    install: "/plugin install superpowers@claude-plugins-official",
  },
  {
    key: "context-mode",
    match: /(^|[/@])context-mode(@|$)/,
    install: "/plugin install context-mode@context-mode",
  },
];

const UPDATE_COMMAND =
  "bash <(curl -fsSL https://raw.githubusercontent.com/kim-song-jun/agent-skill/main/scripts/update.sh) --foundations-only";

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
