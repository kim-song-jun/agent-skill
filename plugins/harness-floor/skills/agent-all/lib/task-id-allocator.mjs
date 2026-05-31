function idsFromIndex(indexText) {
  return [...String(indexText || "").matchAll(/docs\/tasks\/0*([0-9]+)-[^)\s]+\.md/g)].map((m) => Number(m[1]));
}

function idsFromFiles(filenames) {
  return filenames
    .map((name) => /^0*([0-9]+)-.+\.md$/.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

export function allocateTaskId({ indexText = "", filenames = [], requestedId = null } = {}) {
  const used = new Set([...idsFromIndex(indexText), ...idsFromFiles(filenames)]);
  if (requestedId != null) {
    const n = Number(requestedId);
    if (!Number.isInteger(n) || n < 1) throw new Error("--task-id must be a positive integer");
    if (used.has(n)) throw new Error(`task id ${n} collides with an existing task`);
    return n;
  }
  return used.size === 0 ? 1 : Math.max(...used) + 1;
}
