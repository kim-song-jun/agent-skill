#!/usr/bin/env node
// harness-floor-gemini — Phase 3 page-subagent dispatcher for /visual-qa-gemini.
//
// Spawns one `gemini chat` subprocess per page-group with rendered
// page-prompt. Same await + collect pattern as spawn-wave.mjs but
// per-page instead of per-task.
//
// Usage:
//   node plugins/harness-floor-gemini/bin/spawn-page-subagent.mjs \
//     --pages <path/to/pages.json> \
//     --tmp /tmp/visual-qa \
//     [--max-parallel 8] \
//     [--timeout 1800] \
//     [--gemini-bin gemini] \
//     [--dry-run]
//
// Pages JSON shape:
//   {
//     "slugDir": "<path>",
//     "pages": [
//       { "name": "home", "prompt": "<rendered page-prompt body>" },
//       { "name": "settings", "prompt": "..." }
//     ]
//   }
//
// Output: JSON to stdout with per-page results:
//   {
//     "perPageStatus": [
//       { "page": "home", "captures": <n>, "analyses": <n>, "status": "...", "errors": [], "costUSD": <n> }
//     ],
//     "maxParallelUsed": <number>,
//     "status": "completed" | "incomplete"
//   }

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const args = {
    pagesPath: null,
    tmpDir: null,
    maxParallel: 8,
    timeout: 1800,
    geminiBin: "gemini",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pages") args.pagesPath = argv[++i];
    else if (a === "--tmp") args.tmpDir = argv[++i];
    else if (a === "--max-parallel") args.maxParallel = parseInt(argv[++i], 10);
    else if (a === "--timeout") args.timeout = parseInt(argv[++i], 10);
    else if (a === "--gemini-bin") args.geminiBin = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
  }
  if (!args.pagesPath || !args.tmpDir) {
    console.error("Usage: spawn-page-subagent.mjs --pages <pages.json> --tmp <tmp-dir> [--max-parallel 8] [--timeout 1800] [--gemini-bin gemini] [--dry-run]");
    process.exit(1);
  }
  return args;
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function spawnPage(geminiBin, page, outputFile, timeout, dryRun) {
  const args = ["chat", "-p", page.prompt, "--output-json", "--output-file", outputFile, "--timeout", String(timeout)];
  if (dryRun) {
    return { pid: -1, command: `${geminiBin} ${args.map(a => JSON.stringify(a)).join(" ")}`, dryRun: true };
  }
  const child = spawn(geminiBin, args, { detached: true, stdio: "ignore" });
  // Swallow spawn-time errors (e.g., ENOENT for missing binary) so the
  // awaiter can mark the page as failed via missing output file instead.
  child.on("error", () => {});
  child.unref();
  return { pid: child.pid ?? -1, command: null, dryRun: false };
}

async function chunkAndSpawn(geminiBin, pages, outputFiles, maxParallel, timeout, dryRun) {
  const spawned = [];
  let used = 0;
  for (let i = 0; i < pages.length; i += maxParallel) {
    const chunk = pages.slice(i, i + maxParallel);
    const chunkFiles = outputFiles.slice(i, i + maxParallel);
    used = Math.max(used, chunk.length);
    const chunkSpawns = chunk.map((p, idx) => spawnPage(geminiBin, p, chunkFiles[idx], timeout, dryRun));
    spawned.push(...chunkSpawns);
    if (!dryRun) {
      await waitForOutputs(chunkFiles, timeout * 1000 + 60000);
    }
  }
  return { spawned, maxParallelUsed: used };
}

async function waitForOutputs(outputFiles, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const present = outputFiles.filter(existsSync).length;
    if (present === outputFiles.length) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function collectResults(pages, outputFiles) {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const file = outputFiles[i];
    const page = pages[i];
    if (!existsSync(file)) {
      out.push({ page: page.name, status: "failed", errors: ["subprocess output missing"] });
      continue;
    }
    try {
      const payload = JSON.parse(readFileSync(file, "utf-8"));
      out.push({
        page: page.name,
        captures: payload.captures ?? 0,
        analyses: payload.analyses ?? 0,
        status: payload.status ?? "completed",
        errors: payload.errors ?? [],
        costUSD: payload.costUSD ?? 0,
      });
    } catch (e) {
      out.push({ page: page.name, status: "failed", errors: [`parse failed: ${e.message}`] });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = JSON.parse(readFileSync(args.pagesPath, "utf-8"));
  if (!Array.isArray(input.pages)) throw new Error("input.pages must be array");
  mkdirSync(args.tmpDir, { recursive: true });

  const outputFiles = input.pages.map((p) => resolve(args.tmpDir, `page-${sanitize(p.name)}.json`));

  const { spawned, maxParallelUsed } = await chunkAndSpawn(
    args.geminiBin, input.pages, outputFiles, args.maxParallel, args.timeout, args.dryRun,
  );

  if (args.dryRun) {
    for (let i = 0; i < input.pages.length; i++) {
      writeFileSync(outputFiles[i], JSON.stringify({
        page: input.pages[i].name,
        captures: 0,
        analyses: 0,
        status: "completed",
        errors: [],
        costUSD: 0,
      }));
    }
  }

  const perPageStatus = collectResults(input.pages, outputFiles);
  const incomplete = perPageStatus.filter((p) => p.status !== "completed").length;
  const out = {
    perPageStatus,
    maxParallelUsed,
    status: incomplete === 0 ? "completed" : "incomplete",
    dryRun: args.dryRun,
    spawned: args.dryRun ? spawned.map((s) => s.command) : spawned.map((s) => s.pid),
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(`spawn-page-subagent error: ${e.message}`);
  process.exit(1);
});
