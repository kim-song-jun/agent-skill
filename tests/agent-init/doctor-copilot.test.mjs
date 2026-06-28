import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctor, CONTRACTS } from "../../plugins/harness-builder/skills/agent-init/lib/doctor-core.mjs";

function scaffoldCopilot(dir, { preToolUseWired = true, omitHandler = false } = {}) {
  mkdirSync(join(dir, ".github/hooks"), { recursive: true });
  mkdirSync(join(dir, ".github/instructions"), { recursive: true });
  mkdirSync(join(dir, ".copilot/agent-all/lib/hooks"), { recursive: true });
  writeFileSync(join(dir, ".github/copilot-instructions.md"), "# copilot instructions\n");
  writeFileSync(join(dir, "AGENTS.md"), "# agents\n");
  for (const r of ["dev", "planner", "reviewer"]) {
    writeFileSync(join(dir, `.github/instructions/${r}.instructions.md`), "x\n");
  }
  writeFileSync(join(dir, ".agent-all.json"), "{}");
  writeFileSync(join(dir, ".visual-qa.json"), "{}");
  writeFileSync(join(dir, ".copilot/agent-all/lib/config-loader.mjs"), "export const x = 1;\n");
  if (!omitHandler) {
    writeFileSync(join(dir, ".copilot/agent-all/lib/hooks/pre-tool-use-policy.mjs"), "export {};\n");
    writeFileSync(join(dir, ".copilot/agent-all/lib/hooks/git-safety.mjs"), "export {};\n");
  }
  const bash = preToolUseWired
    ? "if [ -f .copilot/agent-all/lib/hooks/pre-tool-use-policy.mjs ]; then node .copilot/agent-all/lib/hooks/pre-tool-use-policy.mjs; fi"
    : "printf '{}'";
  writeFileSync(
    join(dir, ".github/hooks/preToolUse.json"),
    JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: "command", matcher: "bash|powershell", bash }] } }, null, 2),
  );
}

test("CONTRACTS includes copilot (so --platform=copilot is supported)", () => {
  assert.ok(CONTRACTS.copilot, "copilot contract must exist");
  assert.equal(CONTRACTS.copilot.label, "Copilot");
});

test("doctor --platform=copilot passes on a complete operational install", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-copilot-"));
  try {
    scaffoldCopilot(dir);
    const r = runDoctor({ target: dir, platform: "copilot", profile: "auto" });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    assert.equal(r.platform, "copilot");
    assert.equal(r.profile, "operational");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("doctor catches the #1 regression: a stub preToolUse.json (git-safety NOT wired) → FAIL", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-copilot-stub-"));
  try {
    scaffoldCopilot(dir, { preToolUseWired: false });
    const r = runDoctor({ target: dir, platform: "copilot", profile: "auto" });
    assert.equal(r.ok, false, "an allow-all stub preToolUse must fail doctor");
    assert.ok(
      r.failures.some((f) => /preToolUse\.json/.test(f.path ?? "") || /pre-tool-use-policy/.test(JSON.stringify(f))),
      `a failure must point at the unwired preToolUse hook: ${JSON.stringify(r.failures)}`,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("doctor flags a missing git-safety handler lib (operationalRequired)", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-copilot-nohandler-"));
  try {
    scaffoldCopilot(dir, { omitHandler: true });
    const r = runDoctor({ target: dir, platform: "copilot", profile: "auto" });
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /pre-tool-use-policy\.mjs/.test(f.path ?? "")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("doctor --platform=copilot no longer reports 'unknown platform'", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-copilot-known-"));
  try {
    scaffoldCopilot(dir);
    const r = runDoctor({ target: dir, platform: "copilot", profile: "auto" });
    assert.ok(!r.failures.some((f) => /unknown platform/.test(f.message ?? "")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
