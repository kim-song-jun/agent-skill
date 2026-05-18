function filesOverlap(a, b) {
  const setA = new Set(a);
  return b.some(f => setA.has(f));
}

function roleAllowed(taskRole, allowed) {
  if (!taskRole) return true;
  return allowed.some(pattern => {
    if (pattern.endsWith("*")) return taskRole.startsWith(pattern.slice(0, -1));
    return pattern === taskRole;
  });
}

export function buildWaves(tasks, waveConfig) {
  const filtered = tasks.filter(t => roleAllowed(t.role, waveConfig.rolesAllowed));
  const waves = [];
  for (const task of filtered) {
    let placed = false;
    for (const wave of waves) {
      const conflict = wave.some(other => filesOverlap(task.files, other.files));
      if (!conflict && wave.length < waveConfig.maxParallel) {
        wave.push(task);
        placed = true;
        break;
      }
    }
    if (!placed) waves.push([task]);
  }
  return waves;
}
