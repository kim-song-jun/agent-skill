import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scriptPath = "scripts/update.sh";
const script = readFileSync(scriptPath, "utf-8");

function indexOfRequired(text) {
  const index = script.indexOf(text);
  assert.notEqual(index, -1, `${scriptPath} must include ${text}`);
  return index;
}

test("update script supports dry-run, codex platform selection, and install-all delegation", () => {
  assert.match(script, /--dry-run/);
  assert.match(script, /--cli=codex/);
  assert.match(script, /exec bash "\$REPO_ROOT\/scripts\/install-all\.sh"/);
});

test("update script describes the foundation update plan before changing state", () => {
  const planIndex = indexOfRequired("foundation update plan");
  for (const mutation of [
    "git -C \"$REPO_ROOT\" pull",
    "claude plugin marketplace update",
    "claude plugin uninstall",
    "claude plugin install",
    "exec bash \"$REPO_ROOT/scripts/install-all.sh\"",
  ]) {
    const mutationIndex = indexOfRequired(mutation);
    assert.ok(
      planIndex < mutationIndex,
      `foundation update plan must be printed before ${mutation}`,
    );
  }
});

test("dry-run exits before git pull, marketplace update, uninstall, or install commands", () => {
  const dryRunIndex = indexOfRequired("DRY_RUN=0");
  const dryRunGuardIndex = indexOfRequired("Dry run requested; no git pull");
  const dryRunExitIndex = script.indexOf("exit 0", dryRunGuardIndex);
  assert.notEqual(dryRunExitIndex, -1, "dry-run guard must exit 0");
  assert.ok(dryRunIndex < dryRunGuardIndex, "dry-run must be parsed before the guard");

  for (const mutation of [
    "git -C \"$REPO_ROOT\" pull",
    "claude plugin marketplace update",
    "claude plugin uninstall",
    "claude plugin install",
    "exec bash \"$REPO_ROOT/scripts/install-all.sh\"",
  ]) {
    const mutationIndex = indexOfRequired(mutation);
    assert.ok(dryRunExitIndex < mutationIndex, `dry-run exit must precede ${mutation}`);
  }
});

test("selected platform flags are passed through with sanitized PASSTHROUGH array", () => {
  assert.match(script, /PASSTHROUGH=\(\)/);
  for (const flag of [
    "--all",
    "--cli=codex",
    "--cli=copilot",
    "--cli=gemini",
    "--cli=cursor",
    "--claude-code",
  ]) {
    assert.match(script, new RegExp(flag.replace("=", "=")), `must preserve ${flag}`);
  }
  assert.match(script, /PASSTHROUGH\+=\("\$arg"\)/);
  assert.match(script, /"\$\{PASSTHROUGH\[@\]\}"/);
  assert.doesNotMatch(
    script,
    /install-all\.sh" "\$@"/,
    "install-all.sh delegation must not forward raw $@",
  );
});
