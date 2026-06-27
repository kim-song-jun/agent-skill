import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { analyzeInstructionLeanness } from "../../plugins/harness-builder/skills/agent-init/lib/instruction-leanness.mjs";
import { SENTINEL } from "../../plugins/harness-builder/skills/agent-init/lib/sentinel-merge.mjs";

function tempProject() {
  return mkdtempSync(join(tmpdir(), "leanness-"));
}

function managed(body) {
  return `${SENTINEL.start}\n${body}\n${SENTINEL.end}\n`;
}

const TIGHT = { rootMaxLines: 5, rootMaxChars: 200, guideMaxLines: 3, guideMaxChars: 120, minRuleChars: 20 };

test("budget: flags an instruction file over the line/char budget, leaves a small one alone", () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, "CLAUDE.md"), Array.from({ length: 40 }, (_, i) => `rule line number ${i}`).join("\n"));
    writeFileSync(join(dir, "AGENTS.md"), "short file\n");
    const { warnings } = analyzeInstructionLeanness({ targetAbs: dir, config: { leanness: TIGHT } });
    assert.ok(warnings.some((w) => w.id === "leanness-budget" && w.path === "CLAUDE.md"), "over-budget CLAUDE.md flagged");
    assert.ok(!warnings.some((w) => w.id === "leanness-budget" && w.path === "AGENTS.md"), "small AGENTS.md not flagged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("duplicate: flags a rule restated across the global and project layers", () => {
  const dir = tempProject();
  const home = tempProject();
  try {
    mkdirSync(join(home, ".claude"), { recursive: true });
    const sharedRule = "Never use git stash on a shared worktree.";
    writeFileSync(join(home, ".claude/CLAUDE.md"), `# Global\n\n- ${sharedRule}\n- A global-only discipline that is plenty long.\n`);
    writeFileSync(join(dir, "CLAUDE.md"), `# Project\n\n- ${sharedRule}\n- A project-only rule unique to here and long enough.\n`);
    const { warnings } = analyzeInstructionLeanness({ targetAbs: dir, homeDir: home, config: { leanness: TIGHT } });
    const dup = warnings.find((w) => w.id === "leanness-duplicate");
    assert.ok(dup, "cross-layer duplicate flagged");
    assert.match(dup.message, /global/i);
    assert.match(dup.message, /project/i);
    // the unique lines must NOT be flagged as duplicates
    assert.ok(!warnings.some((w) => w.id === "leanness-duplicate" && /project-only/.test(w.message)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("orphan: flags a sentinel-managed folder guide whose dir is no longer a guide target", () => {
  const dir = tempProject();
  try {
    // oldmod: no marker, not a known folder name → detectGuideDirs will NOT return it
    mkdirSync(join(dir, "oldmod"), { recursive: true });
    writeFileSync(join(dir, "oldmod/CLAUDE.md"), managed("stale guide"));
    // src: a known folder name → detected → its guide is NOT an orphan
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/CLAUDE.md"), managed("live guide"));
    const { warnings } = analyzeInstructionLeanness({ targetAbs: dir, config: { leanness: TIGHT } });
    assert.ok(warnings.some((w) => w.id === "leanness-orphan" && w.path === "oldmod/CLAUDE.md"), "orphaned guide flagged");
    assert.ok(!warnings.some((w) => w.id === "leanness-orphan" && w.path.startsWith("src/")), "live guide not flagged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a user-authored (non-sentinel) folder guide is not flagged as orphan", () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, "handwritten"), { recursive: true });
    writeFileSync(join(dir, "handwritten/CLAUDE.md"), "# my own notes, not harness-managed\n");
    const { warnings } = analyzeInstructionLeanness({ targetAbs: dir, config: { leanness: TIGHT } });
    assert.ok(!warnings.some((w) => w.id === "leanness-orphan"), "only harness-managed (sentinel) guides are orphan-checked");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("clean project within budget, no dups, no orphans → zero warnings", () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, "CLAUDE.md"), "- one short rule\n");
    const { warnings } = analyzeInstructionLeanness({ targetAbs: dir, config: { leanness: TIGHT } });
    assert.deepEqual(warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
