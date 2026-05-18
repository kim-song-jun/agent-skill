// Re-export of the vendored render() from this plugin's bin/lib so
// in-skill modules don't reach across the file tree. Single source of
// truth = `plugins/harness-explore/bin/lib/render.mjs` (kept in sync
// with the canonical `harness-builder/agent-init/lib/render.mjs` via
// `scripts/sync-lib.mjs`).
export { render } from "../../../bin/lib/render.mjs";
