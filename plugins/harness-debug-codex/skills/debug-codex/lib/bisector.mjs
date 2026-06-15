// bisector.mjs — two bisection modes used by Phase 2 (isolate).
//
// 1. inputBisect({input, predicate, granularity?}) — delta-debugging
//    ddmin-style shrinker. `input` is an array of "chunks" (lines,
//    test names, request body fragments). `predicate(subset) → bool`
//    returns true when the subset *still reproduces the failure*.
//    Returns the smallest subset such that further removal would make
//    predicate return false.
//
// 2. gitBisect({command, knownGood, knownBad, spawn?, cwd?}) — builds
//    the spawn arguments for `git bisect start/bad/good/run/reset` and
//    returns the offending commit SHA. `spawn` is injectable; tests
//    stub it. The function constructs the command + spawn arguments
//    but does not assume the actual git binary is callable from inside
//    a sandboxed test environment.
//
// Both functions are side-effect-free with respect to state; the caller
// is responsible for writing progress to `.debug-state.json`.

import { spawnSync as nodeSpawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// --- Delta-debugging ddmin ---
// Classic Zeller/Hildebrandt algorithm: try to reduce the input to a
// 1-minimal failing subset. Number of granularity levels doubles each
// round until removals no longer help.
export function inputBisect({ input, predicate, maxIter = 10000 }) {
  if (!Array.isArray(input)) throw new TypeError("input must be an array of chunks");
  if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
  if (input.length === 0) return { minimal: [], iterations: 0, calls: 0 };
  if (!predicate(input)) {
    // Caller's contract: full input must reproduce. Bail out clean.
    return { minimal: input.slice(), iterations: 0, calls: 1, error: "predicate(full input) is false" };
  }

  let current = input.slice();
  let granularity = 2;
  let iter = 0;
  let calls = 1; // initial sanity check
  while (current.length >= 2 && iter < maxIter) {
    iter++;
    const subsetSize = Math.max(1, Math.floor(current.length / granularity));
    let reduced = false;
    // 1. Try each chunk as a stand-alone candidate.
    for (let i = 0; i < current.length; i += subsetSize) {
      const candidate = current.slice(i, i + subsetSize);
      calls++;
      if (predicate(candidate)) {
        current = candidate;
        granularity = 2;
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    // 2. Try removing each chunk (complement).
    for (let i = 0; i < current.length; i += subsetSize) {
      const complement = current.slice(0, i).concat(current.slice(i + subsetSize));
      if (complement.length === 0) continue;
      calls++;
      if (predicate(complement)) {
        current = complement;
        granularity = Math.max(granularity - 1, 2);
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    // 3. Increase granularity (finer slices) until > input length.
    if (granularity >= current.length) break;
    granularity = Math.min(granularity * 2, current.length);
  }
  return { minimal: current, iterations: iter, calls };
}

// --- Git bisect plan / runner ---
// Produces the sequence of git invocations needed to bisect, then runs
// them via the injected spawn function. Each call to spawn must return
// `{status, stdout, stderr}` (compatible with node's spawnSync).
//
// Use buildGitBisectPlan() in tests; it returns the array of
// {bin, args} pairs without spawning anything.
export function buildGitBisectPlan({ command, knownGood, knownBad, scriptPath = "./.debug-bisect-script.sh" }) {
  if (!command) throw new TypeError("command required");
  if (!knownGood) throw new TypeError("knownGood required");
  if (!knownBad) throw new TypeError("knownBad required");
  return [
    { bin: "git", args: ["bisect", "start"], purpose: "start" },
    { bin: "git", args: ["bisect", "bad", knownBad], purpose: "mark-bad" },
    { bin: "git", args: ["bisect", "good", knownGood], purpose: "mark-good" },
    { bin: "git", args: ["bisect", "run", scriptPath], purpose: "run", inlineCommand: command },
    { bin: "git", args: ["bisect", "reset"], purpose: "reset" },
  ];
}

// Parse `git bisect run` output for the standard "first bad commit"
// line. Returns SHA or null.
export function parseFirstBadCommit(output) {
  if (typeof output !== "string") return null;
  const m = /^([0-9a-f]{7,40}) is the first bad commit/m.exec(output);
  return m ? m[1] : null;
}

export function gitBisect({
  command,
  knownGood,
  knownBad,
  spawn = nodeSpawnSync,
  cwd = process.cwd(),
  writeScript = true,
}) {
  const plan = buildGitBisectPlan({ command, knownGood, knownBad });
  const results = [];
  let firstBad = null;

  // `git bisect run <scriptPath>` executes a script file per revision — its
  // exit status decides good/bad. buildGitBisectPlan only NAMES the script;
  // it must actually exist on disk or `bisect run` fails file-not-found.
  // Materialise it here from the run step's inlineCommand, then remove it.
  const runStep = plan.find((s) => s.purpose === "run");
  const scriptRel = runStep.args[runStep.args.length - 1];
  const scriptPath = isAbsolute(scriptRel)
    ? scriptRel
    : join(cwd, scriptRel.replace(/^\.[\\/]/, ""));
  let scriptWritten = false;

  try {
    if (writeScript) {
      writeFileSync(scriptPath, `#!/usr/bin/env bash\n${runStep.inlineCommand}\n`, {
        mode: 0o755,
      });
      scriptWritten = true;
    }
    for (const step of plan) {
      if (step.purpose === "reset") continue; // run in finally
      const res = spawn(step.bin, step.args, { cwd, encoding: "utf-8" });
      results.push({ step: step.purpose, status: res.status, stdout: res.stdout, stderr: res.stderr });
      if (res.status !== 0 && step.purpose !== "run") {
        // start/mark-bad/mark-good failures abort early; run can exit
        // non-zero when no bad commit found and still leave parseable
        // output.
        return { ok: false, firstBad: null, steps: results, reason: `${step.purpose} failed` };
      }
      if (step.purpose === "run") {
        firstBad = parseFirstBadCommit(res.stdout ?? "");
      }
    }
    return { ok: true, firstBad, steps: results };
  } finally {
    // Always attempt bisect reset to leave the repo in a clean state.
    try {
      const reset = spawn("git", ["bisect", "reset"], { cwd, encoding: "utf-8" });
      results.push({ step: "reset", status: reset.status });
    } catch {
      // non-fatal
    }
    // Remove the materialised run script so it never lingers in the worktree.
    if (scriptWritten) {
      try {
        rmSync(scriptPath, { force: true });
      } catch {
        // non-fatal
      }
    }
  }
}
