// Executable adversarial-audit gate (2026-06-22 adversarial round, defect
// C2/C4): the block decision must be DETERMINISTIC CODE — a node process that
// exits non-zero on `VERIFICATION_AUDIT: failed` — not an LLM mentally evaluating
// adversarialAuditBlocks(...).blocked from a markdown code-fence. These tests run
// the real gate-check.mjs subprocess and assert exit codes, and confirm every
// vendored port copy is runnable (its sibling ./audit-tokens import resolves).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";

const GATE_CHECK = resolve(
  "plugins/harness-floor/skills/agent-all/lib/policy/gate-check.mjs",
);

function run(path, verdictText, { viaEnv = false } = {}) {
  const opts = { encoding: "utf-8", input: viaEnv ? "" : verdictText };
  if (viaEnv) opts.env = { ...process.env, GATE_VERDICT_TEXT: verdictText };
  return spawnSync("node", [path], opts);
}

test("gate-check: VERIFICATION_AUDIT: failed exits 2 (BLOCKS the wave)", () => {
  const r = run(GATE_CHECK, "noise\nVERIFICATION_AUDIT: failed\nmore");
  assert.equal(r.status, 2, `failed verdict must exit 2; got ${r.status} — ${r.stderr}`);
  assert.match(r.stderr, /BLOCKED/);
});

test("gate-check: passed / skipped / absent token all exit 0 (no block)", () => {
  for (const v of [
    "VERIFICATION_AUDIT: passed",
    "VERIFICATION_AUDIT: skipped",
    "a reviewer reply with no audit token at all",
  ]) {
    const r = run(GATE_CHECK, v);
    assert.equal(r.status, 0, `non-failed verdict "${v}" must exit 0; got ${r.status}`);
  }
});

test("gate-check: reads the verdict from $GATE_VERDICT_TEXT when set", () => {
  const r = run(GATE_CHECK, "x VERIFICATION_AUDIT: failed", { viaEnv: true });
  assert.equal(r.status, 2, `env-supplied failed verdict must exit 2; got ${r.status} — ${r.stderr}`);
});

test("gate-check: every vendored port copy is runnable and blocks on failed", () => {
  for (const p of ["codex", "copilot", "cursor"]) {
    const copy = resolve(
      `plugins/harness-floor-${p}/skills/agent-all-${p}/lib/policy/gate-check.mjs`,
    );
    const r = run(copy, "VERIFICATION_AUDIT: failed");
    assert.equal(
      r.status,
      2,
      `${p} vendored gate-check must exit 2 on failed (its sibling ./audit-tokens.mjs import must resolve); got ${r.status} — ${r.stderr}`,
    );
  }
});

// Doc-contract: run the LITERAL gate-check command from each port's 4-gate.md.
// The round-2 re-verification found the documented command used
// `node --input-type=module <file>` — invalid for a file path, so it CRASHED
// (ERR_INPUT_TYPE_NOT_ALLOWED, exit 1) on Node v24 instead of exiting 2. The
// other tests above used a flag-free form and stayed green, MASKING it. This
// test executes the exact phase-doc string so doc-vs-runtime drift cannot recur.
// Each port's 4-gate.md documents the command against ITS install layout: CC
// ships in place (run from the skill dir, "./lib/..."), while codex/copilot/cursor
// target the installed project subdir ("./.codex/skills/agent-all/lib/...", etc.).
// To execute the LITERAL command per port we (a) assert no --input-type on the
// file-path form, then (b) reproduce the exact layout the path expects and run it.
const GATE_DOC_PORTS = [
  { name: "harness-floor",         gate: "plugins/harness-floor/skills/agent-all/phases/4-gate.md",                 srcPolicy: "plugins/harness-floor/skills/agent-all/lib/policy",                 inPlaceCwd: "plugins/harness-floor/skills/agent-all" },
  { name: "harness-floor-codex",   gate: "plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md",     srcPolicy: "plugins/harness-floor-codex/skills/agent-all-codex/lib/policy" },
  { name: "harness-floor-copilot", gate: "plugins/harness-floor-copilot/skills/agent-all-copilot/phases/4-gate.md", srcPolicy: "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/policy" },
  { name: "harness-floor-cursor",  gate: "plugins/harness-floor-cursor/skills/agent-all-cursor/phases/4-gate.md",   srcPolicy: "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/policy" },
];

for (const port of GATE_DOC_PORTS) {
  test(`gate-check: the LITERAL ${port.name} 4-gate.md command exits 2 on a failed verdict`, () => {
    const body = readFileSync(resolve(port.gate), "utf-8");
    const line = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\|\s*node\b/.test(l) && /gate-check\.mjs/.test(l));
    assert.ok(line, `${port.name} 4-gate.md must document a runnable "... | node ... gate-check.mjs" command`);
    assert.doesNotMatch(
      line,
      /--input-type=module/,
      `${port.name} gate-check FILE-PATH invocation must NOT use --input-type=module (it crashes with ERR_INPUT_TYPE_NOT_ALLOWED on a file path)`,
    );
    const m = line.match(/node\s+(\.\/\S*gate-check\.mjs)/);
    assert.ok(m, `${port.name} command must invoke node on a "./...gate-check.mjs" path`);
    const relPath = m[1].replace(/^\.\//, "");

    let runCwd, tempRoot = null;
    if (port.inPlaceCwd) {
      runCwd = resolve(port.inPlaceCwd);
    } else {
      // Reproduce the installed layout: the anchored path is relative to the
      // user's project root, so lay gate-check.mjs + its sibling audit-tokens.mjs
      // there under a temp root and run the literal command from it.
      tempRoot = mkdtempSync(join(tmpdir(), "gate-doc-"));
      const destPolicy = dirname(resolve(tempRoot, relPath));
      mkdirSync(destPolicy, { recursive: true });
      copyFileSync(resolve(port.srcPolicy, "gate-check.mjs"), join(destPolicy, "gate-check.mjs"));
      copyFileSync(resolve(port.srcPolicy, "audit-tokens.mjs"), join(destPolicy, "audit-tokens.mjs"));
      runCwd = tempRoot;
    }
    try {
      const r = spawnSync("bash", ["-c", line], {
        cwd: runCwd,
        encoding: "utf-8",
        env: { ...process.env, ADV_AUDIT_TEXT: "VERIFICATION_AUDIT: failed" },
      });
      assert.equal(
        r.status,
        2,
        `the literal documented ${port.name} gate-check command must exit 2 (BLOCKED) on a failed verdict; got ${r.status} — ${r.stderr}`,
      );
    } finally {
      if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    }
  });
}
