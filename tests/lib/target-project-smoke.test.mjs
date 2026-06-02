import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTargetProjectSmokeReport } from "../../scripts/target-project-smoke.mjs";

function makeTarget() {
  return mkdtempSync(resolve(tmpdir(), "target-project-smoke-"));
}

test("target project smoke runs no-write dry-runs and operational doctors for Claude and Codex", () => {
  const target = makeTarget();
  const calls = [];
  const report = buildTargetProjectSmokeReport({
    target,
    lang: "ko",
    runner(call) {
      calls.push(call);
      if (call.label === "target git probe") return { status: 0, stdout: "true\n", stderr: "" };
      if (call.label === "target git status") return { status: 0, stdout: "## main...origin/main\n M x\n", stderr: "" };
      if (call.label.endsWith("install-platform dry-run")) {
        return { status: 0, stdout: "DRY-RUN complete. No files were written.\n", stderr: "" };
      }
      if (call.label.endsWith("operational doctor")) {
        return { status: 0, stdout: JSON.stringify({ ok: true, summary: { passed: 40, total: 40 } }), stderr: "" };
      }
      throw new Error(`unexpected call: ${call.label}`);
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.targetGit.dirtyEntries, 1);
  assert.deepEqual(report.platforms.map((item) => item.platform), ["claude", "codex"]);
  assert.equal(calls.filter((call) => call.label.endsWith("install-platform dry-run")).length, 2);
  assert.equal(calls.filter((call) => call.label.endsWith("operational doctor")).length, 2);
  for (const call of calls.filter((item) => item.label.endsWith("install-platform dry-run"))) {
    assert.ok(call.args.includes("--dry-run"));
    assert.ok(call.args.includes("--no-update-foundations"));
    assert.ok(call.args.includes("--lang=ko"));
  }
});

test("target project smoke fails when the target doctor reports stale harness artifacts", () => {
  const target = makeTarget();
  const report = buildTargetProjectSmokeReport({
    target,
    platforms: ["claude"],
    runner(call) {
      if (call.label === "target git probe") return { status: 1, stdout: "", stderr: "" };
      if (call.label.endsWith("install-platform dry-run")) return { status: 0, stdout: "DRY-RUN\n", stderr: "" };
      if (call.label.endsWith("operational doctor")) {
        return {
          status: 1,
          stdout: JSON.stringify({
            ok: false,
            summary: { passed: 17, total: 32 },
            failures: [{ path: ".claude/agents/orchestrator.md", message: "missing" }],
          }),
          stderr: "",
        };
      }
      throw new Error(`unexpected call: ${call.label}`);
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.platforms[0].doctor.summary.passed, 17);
  assert.equal(report.platforms[0].doctor.failures[0].path, ".claude/agents/orchestrator.md");
  assert.match(report.platforms[0].recommendation, /install-platform\.sh/);
  assert.match(report.platforms[0].recommendation, /--force/);
});

test("target project smoke rejects unsupported platforms", () => {
  const target = makeTarget();
  assert.throws(
    () => buildTargetProjectSmokeReport({ target, platforms: ["gemini"] }),
    /unsupported platform\(s\): gemini/,
  );
});
