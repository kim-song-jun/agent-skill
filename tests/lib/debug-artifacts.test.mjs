import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildDebugLogContext,
  finishDebugSession,
  renderDebugLog,
  slugifyDebugSubject,
} from "../../plugins/harness-debug/skills/debug/lib/debug-artifacts.mjs";
import { decide, addHypothesis } from "../../plugins/harness-debug/skills/debug/lib/hypothesis-tracker.mjs";
import { pushCheckpoint, skeleton } from "../../plugins/harness-debug/skills/debug/lib/state-checkpoint.mjs";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function fixtureState() {
  const state = skeleton({
    command: "npm test -- --runInBand",
    description: "Checkout auth regression",
  });
  state.failure.lastExitCode = 1;
  state.failure.lastRunAt = "2026-06-01T11:55:00.000Z";
  state.failure.rawOutputRef = ".debug-artifacts/repro.log";
  state.failure.errorParsed = {
    kind: "node",
    rootException: { type: "TypeError", value: "Cannot read properties of undefined" },
    frames: [
      { file: "src/auth.js", line: 42, function: "login", message: "TypeError" },
    ],
  };
  const id = addHypothesis(state, "Auth token is not persisted before redirect");
  decide(state, id, {
    status: "verified",
    experiment: "add token persistence assertion",
    result: "fails before fix and passes after persistence",
  });
  pushCheckpoint(state, {
    phase: 4,
    hash: "sha256:" + "a".repeat(64),
    actionsTaken: ["ran focused auth test"],
  });
  return state;
}

test("debug-artifacts: slugifyDebugSubject is stable and bounded", () => {
  assert.equal(slugifyDebugSubject("Checkout auth regression!!"), "checkout-auth-regression");
  assert.equal(slugifyDebugSubject(""), "unknown");
  assert.equal(slugifyDebugSubject("a".repeat(100)), "a".repeat(40));
  assert.equal(slugifyDebugSubject("Auth: token + redirect / callback"), "auth-token-redirect-callback");
});

test("debug-artifacts: buildDebugLogContext derives slug date and verified root cause", () => {
  const ctx = buildDebugLogContext(fixtureState(), { now: NOW });
  assert.equal(ctx.slug, "checkout-auth-regression");
  assert.equal(ctx.date, "2026-06-01");
  assert.equal(ctx.resolution.rootCause, "Auth token is not persisted before redirect");
  assert.equal(ctx.failure.errorParsed.kind, "node");
});

test("debug-artifacts: renderDebugLog renders failure, hypotheses, frames, and checkpoints", () => {
  const template = readFileSync("plugins/harness-debug/skills/debug/templates/debug-log.md.hbs", "utf-8");
  const body = renderDebugLog(template, fixtureState(), { now: NOW });
  assert.match(body, /# Debug log — checkout-auth-regression/);
  assert.match(body, /Resolution:\*\* Auth token is not persisted before redirect/);
  assert.match(body, /Command:\*\* `npm test -- --runInBand`/);
  assert.match(body, /src\/auth\.js:42/);
  assert.match(body, /H1 — verified/);
  assert.match(body, /ran focused auth test/);
});

test("debug-artifacts: finishDebugSession writes log, index, and resolved state", () => {
  const dir = mkdtempSync(join(tmpdir(), "debug-artifacts-"));
  try {
    const state = fixtureState();
    const result = finishDebugSession({ projectRoot: dir, state, now: NOW });

    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.debugLogPath, "docs/debug/2026-06-01-checkout-auth-regression.md");
    assert.match(result.summary, /Debug complete: Auth token is not persisted before redirect/);
    assert.ok(existsSync(join(dir, result.debugLogPath)));
    assert.ok(existsSync(join(dir, ".debug-state.json")));

    const log = readFileSync(join(dir, result.debugLogPath), "utf-8");
    assert.match(log, /Debug-state:\*\* `.debug-state.json`/);
    assert.match(log, /Auth token is not persisted before redirect/);

    const index = readFileSync(join(dir, "docs/debug/index.md"), "utf-8");
    assert.match(index, /2026-06-01 - checkout-auth-regression - Auth token is not persisted before redirect/);

    const persisted = JSON.parse(readFileSync(join(dir, ".debug-state.json"), "utf-8"));
    assert.equal(persisted.resolution.debugLogPath, result.debugLogPath);
    assert.equal(persisted.resolution.finishedAt, NOW.toISOString());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("debug-artifacts: finishDebugSession preserves unresolved sessions with exit code 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "debug-artifacts-unresolved-"));
  try {
    const state = skeleton({ command: "pytest -x", description: "flaky checkout" });
    addHypothesis(state, "The fixture clock is unstable");
    const result = finishDebugSession({ projectRoot: dir, state, now: NOW, slug: "manual-slug" });

    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.rootCause, "abandoned — no verification");
    assert.equal(result.debugLogPath, "docs/debug/2026-06-01-manual-slug.md");
    assert.ok(existsSync(join(dir, result.debugLogPath)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
