import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inputBisect,
  buildGitBisectPlan,
  parseFirstBadCommit,
  gitBisect,
} from "../../plugins/harness-debug/skills/debug/lib/bisector.mjs";

// ---------- inputBisect (ddmin) ----------

test("bisector: inputBisect shrinks to the single failing element", () => {
  // Predicate: subset reproduces iff it contains the value 42.
  const input = [1, 2, 42, 3, 4, 5, 6, 7, 8, 9];
  const predicate = (subset) => subset.includes(42);
  const r = inputBisect({ input, predicate });
  assert.deepEqual(r.minimal, [42]);
  assert.ok(r.calls > 0);
});

test("bisector: inputBisect handles multi-element minimal failure", () => {
  // Failure requires both 'a' AND 'z' present.
  const input = ["a", "b", "c", "d", "e", "f", "g", "z"];
  const predicate = (subset) => subset.includes("a") && subset.includes("z");
  const r = inputBisect({ input, predicate });
  assert.ok(r.minimal.includes("a"));
  assert.ok(r.minimal.includes("z"));
  assert.ok(r.minimal.length <= input.length);
});

test("bisector: inputBisect short-circuits when full input does not reproduce", () => {
  const input = [1, 2, 3];
  const predicate = () => false;
  const r = inputBisect({ input, predicate });
  assert.equal(r.calls, 1);
  assert.match(r.error, /predicate\(full input\) is false/);
});

test("bisector: inputBisect handles empty input", () => {
  const r = inputBisect({ input: [], predicate: () => true });
  assert.deepEqual(r.minimal, []);
  assert.equal(r.iterations, 0);
});

test("bisector: inputBisect rejects non-array input", () => {
  assert.throws(() => inputBisect({ input: "not an array", predicate: () => true }),
    /input must be an array/);
});

test("bisector: inputBisect rejects non-function predicate", () => {
  assert.throws(() => inputBisect({ input: [1, 2], predicate: "nope" }),
    /predicate must be a function/);
});

// ---------- buildGitBisectPlan ----------

test("bisector: buildGitBisectPlan returns ordered start/bad/good/run/reset steps", () => {
  const plan = buildGitBisectPlan({
    command: "pytest -x",
    knownGood: "v1.0.0",
    knownBad: "HEAD",
    scriptPath: "./run.sh",
  });
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.map((s) => s.purpose),
    ["start", "mark-bad", "mark-good", "run", "reset"]);
  assert.deepEqual(plan[1].args, ["bisect", "bad", "HEAD"]);
  assert.deepEqual(plan[2].args, ["bisect", "good", "v1.0.0"]);
  assert.deepEqual(plan[3].args, ["bisect", "run", "./run.sh"]);
});

test("bisector: buildGitBisectPlan requires command, knownGood, knownBad", () => {
  assert.throws(() => buildGitBisectPlan({}), /command required/);
  assert.throws(() => buildGitBisectPlan({ command: "x" }), /knownGood required/);
  assert.throws(() => buildGitBisectPlan({ command: "x", knownGood: "v1" }), /knownBad required/);
});

// ---------- parseFirstBadCommit ----------

test("bisector: parseFirstBadCommit extracts SHA from 'is the first bad commit' line", () => {
  const out = `Bisecting: 5 revisions left to test
abc1234567890abcdef is the first bad commit
commit abc1234567890abcdef
Author: x`;
  assert.equal(parseFirstBadCommit(out), "abc1234567890abcdef");
});

test("bisector: parseFirstBadCommit returns null when SHA line missing", () => {
  assert.equal(parseFirstBadCommit("nothing relevant here"), null);
  assert.equal(parseFirstBadCommit(""), null);
  assert.equal(parseFirstBadCommit(null), null);
});

// ---------- gitBisect with stubbed spawn ----------

test("bisector: gitBisect drives full plan via spawn stub and returns firstBad", () => {
  const calls = [];
  const spawn = (bin, args) => {
    calls.push({ bin, args: args.join(" ") });
    if (args[0] === "bisect" && args[1] === "run") {
      return {
        status: 0,
        stdout: "deadbeef0000000000000000000000000000000 is the first bad commit\n",
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const tmp = mkdtempSync(join(tmpdir(), "bisect-full-"));
  let r;
  try {
    r = gitBisect({
      command: "make test",
      knownGood: "v1.0.0",
      knownBad: "HEAD",
      spawn,
      cwd: tmp,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(r.ok, true);
  assert.equal(r.firstBad, "deadbeef0000000000000000000000000000000");
  // Verify start/bad/good/run + reset were each invoked.
  const seq = calls.map((c) => c.args);
  assert.ok(seq.some((s) => s === "bisect start"));
  assert.ok(seq.some((s) => s === "bisect bad HEAD"));
  assert.ok(seq.some((s) => s === "bisect good v1.0.0"));
  assert.ok(seq.some((s) => s.startsWith("bisect run")));
  assert.ok(seq.some((s) => s === "bisect reset"), "reset must run in finally");
});

test("bisector: gitBisect always runs bisect reset even if an early step errors", () => {
  const calls = [];
  const spawn = (bin, args) => {
    calls.push(args.join(" "));
    if (args.join(" ") === "bisect bad HEAD") {
      return { status: 128, stdout: "", stderr: "bad input" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const tmp = mkdtempSync(join(tmpdir(), "bisect-reset-"));
  let r;
  try {
    r = gitBisect({
      command: "x",
      knownGood: "v1",
      knownBad: "HEAD",
      spawn,
      cwd: tmp,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(r.ok, false);
  assert.ok(calls.includes("bisect reset"), `reset missing; calls=${calls.join("|")}`);
});

// ---------- gitBisect materialises + cleans up the run script (regression) ----------

test("bisector: gitBisect writes an executable run script before 'run' and removes it after", () => {
  const tmp = mkdtempSync(join(tmpdir(), "bisect-script-"));
  const scriptPath = join(tmp, ".debug-bisect-script.sh");
  const observed = {};
  const spawn = (bin, args) => {
    if (args[0] === "bisect" && args[1] === "run") {
      // At the moment `git bisect run` fires, the script MUST exist on disk,
      // be executable, and contain the failing command — otherwise the real
      // git invocation errors file-not-found (the bug this guards against).
      observed.existedDuringRun = existsSync(scriptPath);
      if (observed.existedDuringRun) {
        observed.contents = readFileSync(scriptPath, "utf-8");
        observed.mode = statSync(scriptPath).mode & 0o777;
      }
      return {
        status: 0,
        stdout: "abc1230000000000000000000000000000000000 is the first bad commit\n",
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  let r;
  try {
    r = gitBisect({
      command: "npm test -- --runInBand",
      knownGood: "v1.0.0",
      knownBad: "HEAD",
      spawn,
      cwd: tmp,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  assert.equal(r.ok, true);
  assert.equal(observed.existedDuringRun, true, "script must exist on disk when 'bisect run' fires");
  assert.match(observed.contents, /^#!\/usr\/bin\/env bash/, "script needs a bash shebang");
  assert.match(observed.contents, /npm test -- --runInBand/, "script must carry the failing command");
  assert.ok((observed.mode & 0o100) !== 0, "script must be owner-executable");
  assert.equal(existsSync(scriptPath), false, "script must be removed after bisect completes");
});
