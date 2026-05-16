export function mergeSettings(current, additions) {
  const out = structuredClone(current ?? {});
  out.hooks = out.hooks ?? {};
  for (const [event, groups] of Object.entries(additions?.hooks ?? {})) {
    const existing = out.hooks[event] ?? [];
    const existingCommands = new Set(
      existing.flatMap(g => (g.hooks ?? []).map(h => h.command))
    );
    const deduped = groups.map(g => ({
      ...g,
      hooks: (g.hooks ?? []).filter(h => {
        if (existingCommands.has(h.command)) return false;
        existingCommands.add(h.command);
        return true;
      }),
    })).filter(g => g.hooks.length > 0);
    out.hooks[event] = [...existing, ...deduped];
  }
  return out;
}
