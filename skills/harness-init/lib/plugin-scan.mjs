export function scanPlugins({ installedPlugins, enabledPlugins, required }) {
  const installedKeys = new Set(Object.keys(installedPlugins?.plugins || {}));
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
  return { enabled, disabled, missing };
}
