// page-result-collector.mjs — poll `<slugDir>/<page>/_result.json` files
// written by per-page `@visual-qa-page` background subagents.
//
// Cursor doesn't expose a "background chat finished" event, so the per-page
// subagent template writes a `_result.json` upon completion (success or
// failure). Phase 4 calls `awaitAllPages(...)` to know when to aggregate.
//
// Fallback (per spec, open question #1): if the timeout elapses with pages
// still pending, return them in `pending[]` so the coordinator can prompt
// the user for manual confirmation.
//
// API:
//   awaitAllPages({ slugDir, pageNames, timeoutMs, intervalMs })
//     → Promise<{ settled: [{page, result}...], pending: [name...] }>
//   readPageResult(slugDir, page)
//     → { ok: boolean, result?: object, missing?: true, error?: string }

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function isMain() {
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
}

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const DEFAULT_INTERVAL_MS = 5_000;
const MIN_INTERVAL_MS = 50;

function resultPath(slugDir, page) {
  return resolve(slugDir, page, "_result.json");
}

export function readPageResult(slugDir, page) {
  const path = resultPath(slugDir, page);
  if (!existsSync(path)) return { ok: false, missing: true };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return { ok: true, result: parsed };
  } catch (e) {
    return { ok: false, error: `unreadable: ${e.message}` };
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function awaitAllPages({
  slugDir,
  pageNames,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now(),
} = {}) {
  if (!slugDir) throw new Error("awaitAllPages: slugDir required");
  if (!Array.isArray(pageNames)) throw new Error("awaitAllPages: pageNames must be array");

  const interval = Math.max(MIN_INTERVAL_MS, intervalMs);
  const settledMap = new Map();
  const start = now();

  while (true) {
    for (const page of pageNames) {
      if (settledMap.has(page)) continue;
      const r = readPageResult(slugDir, page);
      if (r.ok) settledMap.set(page, r.result);
      else if (r.error) settledMap.set(page, { status: "failed", error: r.error });
    }
    if (settledMap.size === pageNames.length) break;
    if (now() - start >= timeoutMs) break;
    await sleep(interval);
  }

  const settled = [...settledMap.entries()].map(([page, result]) => ({ page, result }));
  const pending = pageNames.filter((p) => !settledMap.has(p));
  return { settled, pending };
}

// CLI:
//   node lib/page-result-collector.mjs await <slugDir> <page1,page2,...> [timeoutMs] [intervalMs]
// Prints JSON; exits 0 if all settled, 1 if any pending.
if (isMain()) {
  const [, , cmd, slugDir, csv, t, i] = process.argv;
  if (cmd !== "await" || !slugDir || !csv) {
    console.error("usage: page-result-collector.mjs await <slugDir> <page1,page2> [timeoutMs] [intervalMs]");
    process.exit(2);
  }
  const pageNames = csv.split(",").map((s) => s.trim()).filter(Boolean);
  const timeoutMs = t ? Number(t) : DEFAULT_TIMEOUT_MS;
  const intervalMs = i ? Number(i) : DEFAULT_INTERVAL_MS;
  awaitAllPages({ slugDir, pageNames, timeoutMs, intervalMs }).then((res) => {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    process.exit(res.pending.length === 0 ? 0 : 1);
  });
}
