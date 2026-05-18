#!/usr/bin/env node
// harness-floor-gemini — Phase 3 wave dispatcher for /agent-all-gemini.
//
// Spawns N parallel `gemini chat` subprocesses (one per wave task),
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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";

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

function spawnTask(geminiBin, task, outputFile, timeout, dryRun) {
  const args = ["chat", "-p", task.body, "--output-json", "--output-file", outputFile, "--timeout", String(timeout)];
  if (dryRun) {
    return { pid: -task.id, command: `${geminiBin} ${args.map(a => JSON.stringify(a)).join(" ")}`, dryRun: true };
  }
  const child = spawn(geminiBin, args, { detached: true, stdio: "ignore" });
  // Swallow spawn-time errors (e.g., ENOENT) so the awaiter handles it.
  child.on("error", () => {});
  child.unref();
  return { pid: child.pid ?? -1, command: null, dryRun: false };
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
  const spawned = wave.tasks.map((t, i) => spawnTask(args.geminiBin, t, outputFiles[i], args.timeout, args.dryRun));

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
  } else {
    const ok = await waitForOutputs(outputFiles, args.timeout * 1000 + 60000);
    if (!ok) {
      console.error(`timeout: ${args.timeout + 60}s exceeded; some subprocesses still running`);
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
