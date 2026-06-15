export function scanPlugins({ installedPlugins, enabledPlugins, required }) {
  const records = installedPlugins?.plugins || {};
  const installedKeys = new Set(Object.keys(records));
  const enabled = [];
  const disabled = [];
  const missing = [];
  for (const key of required) {
    if (installedKeys.has(key)) {
      if (enabledPlugins?.[key]) enabled.push(key);
      else disabled.push(key);
    } else {
      missing.push(key);
    }
  }

  // Resolve the on-disk install path for EVERY installed plugin — not just the
  // required ones. Phase 5 needs a sibling plugin's path (e.g. harness-floor)
  // to read its bundled config templates, because in an installed layout that
  // plugin lives at ~/.claude/plugins/cache/<mkt>/<name>/<ver>/, NOT at a
  // source-checkout sibling `plugins/<name>/`. installed_plugins.json stores
  // each plugin as an array of install records carrying `installPath`.
  const installPaths = {};
  for (const [key, recs] of Object.entries(records)) {
    const rec = Array.isArray(recs) ? recs[0] : recs;
    if (rec && typeof rec.installPath === "string") installPaths[key] = rec.installPath;
  }

  return { enabled, disabled, missing, installPaths };
}

// Locate an installed plugin's root by its bare name (e.g. "harness-floor"),
// tolerating marketplace-suffix drift in the "<name>@<marketplace>" key.
// Returns the installPath string, or null when the plugin is not installed.
export function resolvePluginRoot(installPaths, name) {
  if (!installPaths) return null;
  if (installPaths[name]) return installPaths[name];
  const prefix = `${name}@`;
  for (const [key, path] of Object.entries(installPaths)) {
    if (key === name || key.startsWith(prefix)) return path;
  }
  return null;
}
