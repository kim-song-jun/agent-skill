// subprocess-fleet.mjs — manages a pool of headless `gemini -p` subprocesses
// for agent-all-gemini's Phase 3 wave dispatch.
//
// Responsibilities:
//   - Bounded concurrency (--max-subprocesses cap; default 8 for agent-all).
//   - Per-task ENOENT/timeout/kill handling.
//   - SIGTERM after `timeoutMs`; SIGKILL after `timeoutMs + graceMs`.
//   - Best-effort rate-limit awareness (per-API-plan; user-tunable via
//     `ratePerMinute` knob — informational throttle, not a hard cap).
//   - Dry-run mode that returns synthesised commands without spawning.
//
// Contract (Task shape):
//   { id: string|number, body: string, outputFile: string, meta?: object }
//
// Returned per task (FleetResult):
//   { task, pid, exitCode, signal, stdout, stderr, timedOut, errorCode, durationMs, command }
//
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULTS = {
  maxSubprocesses: 8,
  timeoutMs: 1800 * 1000,
  graceMs: 5000,
  geminiBin: "gemini",
  outputFormat: "json",
  skipTrust: true,
  ratePerMinute: null, // null = no throttle
};

function buildArgs(task, opts) {
  const args = ["-p", task.body, "--output-format", opts.outputFormat ?? "json"];
  if (opts.skipTrust !== false) args.push("--skip-trust");
  if (opts.model) args.push("--model", opts.model);
  if (Array.isArray(opts.extensions) && opts.extensions.length) {
    args.push("--extensions", opts.extensions.join(","));
  }
  return args;
}

function commandPreview(geminiBin, args) {
  const quoted = args.map((a) => JSON.stringify(a)).join(" ");
  return `${geminiBin} ${quoted}`;
}

// Sleep helper used by the rate-limit throttle.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeOutputFile(outputFile, text) {
  if (!outputFile) return;
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, text ?? "", "utf-8");
}

// Run a single task. Resolves with FleetResult; never rejects.
async function runOne(task, opts) {
  const args = buildArgs(task, opts);
  const cmd = commandPreview(opts.geminiBin, args);
  const start = Date.now();

  if (opts.dryRun) {
    return {
      task,
      pid: null,
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      errorCode: null,
      durationMs: 0,
      command: cmd,
      dryRun: true,
    };
  }

  return await new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let settled = false;
    let timedOut = false;
    let errorCode = null;
    let killTimer = null;
    let killForceTimer = null;

    let child;
    try {
      child = spawn(opts.geminiBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...(opts.env || {}) },
      });
    } catch (e) {
      // synchronous spawn failure (very rare on POSIX)
      resolve({
        task,
        pid: null,
        exitCode: -1,
        signal: null,
        stdout: "",
        stderr: e.message,
        timedOut: false,
        errorCode: e.code || "ESPAWN",
        durationMs: Date.now() - start,
        command: cmd,
      });
      return;
    }

    const finalize = (overrides) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (killForceTimer) clearTimeout(killForceTimer);
      if (opts.writeOutputFiles !== false && task.outputFile && (stdoutBuf.length > 0 || !errorCode)) {
        writeOutputFile(task.outputFile, stdoutBuf);
      }
      resolve({
        task,
        pid: child.pid ?? null,
        exitCode: null,
        signal: null,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        timedOut,
        errorCode,
        durationMs: Date.now() - start,
        command: cmd,
        ...overrides,
      });
    };

    child.on("error", (err) => {
      errorCode = err.code || "EUNKNOWN";
      finalize({ exitCode: -1, stderr: stderrBuf || err.message });
    });

    if (child.stdout) child.stdout.on("data", (chunk) => { stdoutBuf += chunk.toString(); });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderrBuf += chunk.toString(); });

    child.on("exit", (code, signal) => {
      finalize({ exitCode: code, signal });
    });

    // Timeout escalation: SIGTERM then SIGKILL.
    if (Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
        killForceTimer = setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
        }, Math.max(0, opts.graceMs));
      }, opts.timeoutMs);
    }
  });
}

// Run a pool of tasks with bounded concurrency and optional rate-limit.
// Returns array of FleetResult in the same order as `tasks`.
export async function runFleet(tasks, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const maxConcurrent = Math.max(1, Math.min(tasks.length || 1, opts.maxSubprocesses));
  const results = new Array(tasks.length);
  let cursor = 0;
  let launchedThisMinute = 0;
  let minuteStart = Date.now();

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;

      // Rate-limit throttle (best-effort window).
      if (opts.ratePerMinute && opts.ratePerMinute > 0) {
        const now = Date.now();
        if (now - minuteStart >= 60_000) {
          minuteStart = now;
          launchedThisMinute = 0;
        }
        if (launchedThisMinute >= opts.ratePerMinute) {
          const wait = 60_000 - (now - minuteStart);
          await sleep(Math.max(0, wait));
          minuteStart = Date.now();
          launchedThisMinute = 0;
        }
        launchedThisMinute += 1;
      }

      results[idx] = await runOne(tasks[idx], opts);
      if (typeof opts.onTaskComplete === "function") {
        try { opts.onTaskComplete(results[idx]); } catch { /* ignore */ }
      }
    }
  }

  const workers = [];
  for (let i = 0; i < maxConcurrent; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// Inspect-only helpers for tests.
export const __internal = { buildArgs, commandPreview, runOne, DEFAULTS };
