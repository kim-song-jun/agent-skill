import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  hookSectionContainsMatcher,
  planMerge,
  buildSnippetsForMatcher,
  installHook,
  SNIPPETS,
  defaultConfigPath,
} from "../../plugins/harness-floor-codex/bin/install-hook.mjs";

const BIN = resolve("plugins/harness-floor-codex/bin/install-hook.mjs");

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "codex-install-hook-test-"));
}

// ---------------------------------------------------------------------------
// hookSectionContainsMatcher
// ---------------------------------------------------------------------------

test("install-hook: hookSectionContainsMatcher detects exact prefix", () => {
  const toml = `
[[hooks.agent]]
matcher = "agent-all/wave/.*"
command = "x"
`;
  assert.equal(hookSectionContainsMatcher(toml, "agent-all/wave/"), true);
  assert.equal(hookSectionContainsMatcher(toml, "visual-qa/page/"), false);
});

test("install-hook: hookSectionContainsMatcher ignores other table types", () => {
  const toml = `
[[hooks.preToolUse]]
matcher = "agent-all/wave/.*"
`;
  assert.equal(hookSectionContainsMatcher(toml, "agent-all/wave/"), false);
});

test("install-hook: hookSectionContainsMatcher walks multiple sections", () => {
  const toml = `
[[hooks.agent]]
matcher = "agent-all/wave/.*"

[[hooks.agent]]
matcher = "visual-qa/page/.*"
`;
  assert.equal(hookSectionContainsMatcher(toml, "agent-all/wave/"), true);
  assert.equal(hookSectionContainsMatcher(toml, "visual-qa/page/"), true);
});

test("install-hook: hookSectionContainsMatcher handles empty input", () => {
  assert.equal(hookSectionContainsMatcher("", "agent-all/wave/"), false);
  assert.equal(hookSectionContainsMatcher(null, "agent-all/wave/"), false);
});

// ---------------------------------------------------------------------------
// planMerge (pure function)
// ---------------------------------------------------------------------------

test("install-hook: planMerge creates content from empty config", () => {
  const snippets = buildSnippetsForMatcher("both");
  const { merged, applied, skipped } = planMerge("", snippets);
  assert.deepEqual(applied, ["agent-all", "visual-qa"]);
  assert.deepEqual(skipped, []);
  assert.ok(merged.includes("[[hooks.agent]]"));
  assert.ok(merged.includes("agent-all/wave/"));
  assert.ok(merged.includes("visual-qa/page/"));
});

test("install-hook: planMerge preserves existing user content", () => {
  const existing = `# user's existing config
[[hooks.preToolUse]]
matcher = "Bash.*"
command = "my-shell-checker"
`;
  const snippets = buildSnippetsForMatcher("agent-all");
  const { merged, applied } = planMerge(existing, snippets);
  assert.deepEqual(applied, ["agent-all"]);
  assert.ok(merged.includes("[[hooks.preToolUse]]"),
    "existing preToolUse section must survive");
  assert.ok(merged.includes("my-shell-checker"));
  assert.ok(merged.includes("agent-all/wave/"));
});

test("install-hook: planMerge is idempotent when matcher already present", () => {
  const existing = `[[hooks.agent]]
matcher = "agent-all/wave/.*"
command = "codex-agent-dispatch"
`;
  const snippets = buildSnippetsForMatcher("agent-all");
  const { merged, applied, skipped } = planMerge(existing, snippets);
  assert.deepEqual(applied, []);
  assert.deepEqual(skipped, ["agent-all"]);
  // Merged content should be unchanged when nothing applied.
  assert.equal(merged, existing);
});

test("install-hook: planMerge applies only the missing matcher in mixed state", () => {
  const existing = `[[hooks.agent]]
matcher = "agent-all/wave/.*"
command = "codex-agent-dispatch"
`;
  const snippets = buildSnippetsForMatcher("both");
  const { merged, applied, skipped } = planMerge(existing, snippets);
  assert.deepEqual(skipped, ["agent-all"]);
  assert.deepEqual(applied, ["visual-qa"]);
  assert.ok(merged.includes("agent-all/wave/"));
  assert.ok(merged.includes("visual-qa/page/"));
});

test("install-hook: planMerge marker comment present", () => {
  const snippets = buildSnippetsForMatcher("agent-all");
  const { merged } = planMerge("", snippets);
  assert.ok(merged.includes("Managed by harness-floor-codex/bin/install-hook.mjs"));
});

// ---------------------------------------------------------------------------
// buildSnippetsForMatcher
// ---------------------------------------------------------------------------

test("install-hook: buildSnippetsForMatcher both returns 2 entries", () => {
  const s = buildSnippetsForMatcher("both");
  assert.equal(s.length, 2);
  assert.equal(s[0].name, "agent-all");
  assert.equal(s[1].name, "visual-qa");
  assert.ok(s[0].snippet.includes("agent-all/wave/"));
  assert.ok(s[1].snippet.includes("visual-qa/page/"));
});

test("install-hook: buildSnippetsForMatcher single matcher", () => {
  const s = buildSnippetsForMatcher("visual-qa");
  assert.equal(s.length, 1);
  assert.equal(s[0].matcherPrefix, "visual-qa/page/");
});

test("install-hook: SNIPPETS table has both matchers", () => {
  assert.ok(SNIPPETS["agent-all"]);
  assert.ok(SNIPPETS["visual-qa"]);
  assert.match(SNIPPETS["agent-all"].snippetPath, /agent-all-codex/);
  assert.match(SNIPPETS["visual-qa"].snippetPath, /visual-qa-codex/);
});

// ---------------------------------------------------------------------------
// installHook (programmatic — writes to tmpdir)
// ---------------------------------------------------------------------------

test("install-hook: installHook creates new config", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    const r = installHook({ configPath: cfg, matcher: "both" });
    assert.deepEqual(r.applied, ["agent-all", "visual-qa"]);
    assert.equal(r.existed, false);
    const content = readFileSync(cfg, "utf-8");
    assert.ok(content.includes("agent-all/wave/"));
    assert.ok(content.includes("visual-qa/page/"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook: installHook idempotent on second call", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    installHook({ configPath: cfg, matcher: "both" });
    const first = readFileSync(cfg, "utf-8");
    const r2 = installHook({ configPath: cfg, matcher: "both" });
    assert.deepEqual(r2.applied, []);
    assert.deepEqual(r2.skipped, ["agent-all", "visual-qa"]);
    const second = readFileSync(cfg, "utf-8");
    assert.equal(first, second, "file unchanged on second call");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook: installHook preserves existing user TOML", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    const userToml = `# my config
model = "claude-sonnet-4-6"

[[hooks.preToolUse]]
matcher = "Bash.*"
command = "my-checker"
`;
    writeFileSync(cfg, userToml);
    const r = installHook({ configPath: cfg, matcher: "both" });
    assert.deepEqual(r.applied, ["agent-all", "visual-qa"]);
    const merged = readFileSync(cfg, "utf-8");
    assert.ok(merged.includes("my-checker"), "user content preserved");
    assert.ok(merged.includes('model = "claude-sonnet-4-6"'),
      "user model setting preserved");
    assert.ok(merged.includes("agent-all/wave/"));
    assert.ok(merged.includes("visual-qa/page/"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook: installHook creates parent directory", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "nested/deep/.codex/config.toml");
    const r = installHook({ configPath: cfg, matcher: "agent-all" });
    assert.equal(r.applied.length, 1);
    assert.ok(existsSync(cfg));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook: installHook dryRun does not write", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    const r = installHook({ configPath: cfg, matcher: "both", dryRun: true });
    assert.deepEqual(r.applied, ["agent-all", "visual-qa"]);
    assert.equal(existsSync(cfg), false, "file must NOT be created in dry-run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook: defaultConfigPath ends with ~/.codex/config.toml", () => {
  assert.match(defaultConfigPath(), /\.codex\/config\.toml$/);
});

// ---------------------------------------------------------------------------
// CLI smoke tests
// ---------------------------------------------------------------------------

test("install-hook CLI: prints usage on unknown arg", () => {
  const res = spawnSync("node", [BIN, "--bogus"], { encoding: "utf-8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Unknown argument/);
});

test("install-hook CLI: rejects bad --matcher value", () => {
  const res = spawnSync("node", [BIN, "--matcher", "nope"], { encoding: "utf-8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /--matcher must be/);
});

test("install-hook CLI: --dry-run prints preview", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    const res = spawnSync(
      "node",
      [BIN, "--config-toml", cfg, "--matcher", "agent-all", "--dry-run"],
      { encoding: "utf-8" },
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /dry-run/);
    assert.match(res.stdout, /agent-all/);
    assert.equal(existsSync(cfg), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook CLI: end-to-end install writes file", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    const res = spawnSync(
      "node",
      [BIN, "--config-toml", cfg, "--matcher", "both"],
      { encoding: "utf-8" },
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /applied:.*agent-all.*visual-qa/);
    const content = readFileSync(cfg, "utf-8");
    assert.ok(content.includes("agent-all/wave/"));
    assert.ok(content.includes("visual-qa/page/"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install-hook CLI: idempotent rerun reports skipped", () => {
  const dir = makeTmp();
  try {
    const cfg = join(dir, "config.toml");
    spawnSync("node", [BIN, "--config-toml", cfg, "--matcher", "both"],
      { encoding: "utf-8" });
    const res = spawnSync(
      "node",
      [BIN, "--config-toml", cfg, "--matcher", "both"],
      { encoding: "utf-8" },
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /skipped:.*agent-all.*visual-qa/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
