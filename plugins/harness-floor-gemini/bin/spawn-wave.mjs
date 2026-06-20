#!/usr/bin/env node
// harness-floor-gemini — Phase 3 wave dispatcher for /agent-all.
//
// Spawns N parallel headless `gemini -p` subprocesses (one per wave task),
// awaits them via PID wait OR tmp-file polling, then aggregates results.
//
// Usage:
//   node plugins/harness-floor-gemini/bin/spawn-wave.mjs \
//     --wave <path/to/wave.json> \
//     --tmp /tmp/agent-all/wave-N \
//     [--timeout 1800] \
//     [--gemini-bin gemini] \
//     [--dry-run]
//
// Wave JSON shape:
//   {
//     "index": 0,
//     "tasks": [
//       { "id": 1, "title": "...", "role": "dev", "body": "<rendered task prompt>" },
//       ...
//     ]
//   }
//
// Output: JSON to stdout with per-task results:
//   {
//     "index": 0,
//     "tasks": [
//       { "id": 1, "agentId": "...", "status": "completed" | "blocked" | "failed",
//         "commits": [...], "costUSD": <number>, "exitCode": <number>, "errors": [...] }
//     ],
//     "status": "completed" | "incomplete"
//   }

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runFleet } from "../skills/agent-all-gemini/lib/subprocess-fleet.mjs";

function parseArgs(argv) {
  const args = {
    wavePath: null,
    tmpDir: null,
    timeout: 1800,
    geminiBin: "gemini",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--wave") args.wavePath = argv[++i];
    else if (a === "--tmp") args.tmpDir = argv[++i];
    else if (a === "--timeout") args.timeout = parseInt(argv[++i], 10);
    else if (a === "--gemini-bin") args.geminiBin = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
  }
  if (!args.wavePath || !args.tmpDir) {
    console.error("Usage: spawn-wave.mjs --wave <wave.json> --tmp <tmp-dir> [--timeout 1800] [--gemini-bin gemini] [--dry-run]");
    process.exit(1);
  }
  return args;
}

function loadWave(path) {
  const text = readFileSync(path, "utf-8");
  const wave = JSON.parse(text);
  if (!Number.isInteger(wave.index)) throw new Error("wave.index must be integer");
  if (!Array.isArray(wave.tasks)) throw new Error("wave.tasks must be array");
  return wave;
}

function collectResults(wave, outputFiles) {
  const results = [];
  for (let i = 0; i < wave.tasks.length; i++) {
    const task = wave.tasks[i];
    const file = outputFiles[i];
    if (!existsSync(file)) {
      results.push({ id: task.id, agentId: null, status: "failed", errors: ["subprocess output missing"], exitCode: -1 });
      continue;
    }
    try {
      const payload = JSON.parse(readFileSync(file, "utf-8"));
      if (payload.error && typeof payload.error === "object") {
        results.push({
          id: task.id,
          agentId: payload.session_id ?? payload.sessionId ?? null,
          status: "failed",
          commits: [],
          costUSD: 0,
          exitCode: Number.isFinite(payload.error.code) ? payload.error.code : 1,
          errors: [payload.error.message ?? payload.error.type ?? "Gemini CLI error"],
        });
        continue;
      }
      results.push({
        id: task.id,
        agentId: payload.agentId ?? `synthetic-${task.id}`,
        status: payload.status ?? "completed",
        commits: payload.commits ?? [],
        costUSD: payload.costUSD ?? 0,
        exitCode: payload.exitCode ?? 0,
        errors: payload.errors ?? [],
      });
    } catch (e) {
      results.push({ id: task.id, agentId: null, status: "failed", errors: [`parse failed: ${e.message}`], exitCode: -2 });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const wave = loadWave(args.wavePath);
  mkdirSync(args.tmpDir, { recursive: true });

  const outputFiles = wave.tasks.map((t) => resolve(args.tmpDir, `task-${t.id}.json`));
  const fleetTasks = wave.tasks.map((t, i) => ({
    id: t.id,
    body: t.body,
    outputFile: outputFiles[i],
    meta: { title: t.title, role: t.role },
  }));
  const spawned = await runFleet(fleetTasks, {
    geminiBin: args.geminiBin,
    timeoutMs: args.timeout * 1000,
    dryRun: args.dryRun,
  });

  if (args.dryRun) {
    // Simulate completion by writing stub output files so collectResults works.
    for (let i = 0; i < wave.tasks.length; i++) {
      writeFileSync(outputFiles[i], JSON.stringify({
        agentId: `dry-${wave.tasks[i].id}`,
        status: "completed",
        commits: [],
        costUSD: 0,
        exitCode: 0,
      }));
    }
  }

  const results = collectResults(wave, outputFiles);
  const incomplete = results.filter((r) => r.status !== "completed").length;
  const out = {
    index: wave.index,
    tasks: results,
    status: incomplete === 0 ? "completed" : "incomplete",
    dryRun: args.dryRun,
    spawned: args.dryRun ? spawned.map((s) => s.command) : spawned.map((s) => s.pid),
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(`spawn-wave error: ${e.message}`);
  process.exit(1);
});
