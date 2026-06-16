// Integration: invoke `harness-floor-cursor/bin/init.mjs --only=agent-all`
// against a tmpdir and verify the kit (templates + lib modules) lands at
// the expected paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BIN = resolve("plugins/harness-floor-cursor/bin/init.mjs");

function runInit(args) {
  return spawnSync("node", [BIN, ...args], { encoding: "utf-8" });
}

test("agent-all install: ships template files + vendored lib modules", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-agent-all-install-"));
  try {
    const res = runInit([target, "--only=agent-all"]);
    assert.equal(res.status, 0, res.stderr);

    const expected = [
      ".agent-all.json",
      ".cursor/rules/agent-all.mdc",
      ".cursor/agents/agent-all-coordinator.md",
      ".cursor/agents/agent-all-implementer.md",
      ".cursor/agents/agent-all-reviewer.md",
      ".cursor/agent-all/lib/config-loader.mjs",
      ".cursor/agent-all/lib/plan-parser.mjs",
      ".cursor/agent-all/lib/state-rw.mjs",
    ];
    for (const f of expected) {
      assert.ok(existsSync(resolve(target, f)), `missing ${f}`);
    }

    // Templated files must have had their {{...}} placeholders replaced.
    const agentAllJson = readFileSync(resolve(target, ".agent-all.json"), "utf-8");
    assert.doesNotMatch(agentAllJson, /\{\{/, ".agent-all.json must have no unrendered placeholders");
    // Must be valid JSON and contain rendered values (not template literals).
    const agentAllParsed = JSON.parse(agentAllJson);
    assert.equal(typeof agentAllParsed.defaults.maxIter, "number", ".agent-all.json defaults.maxIter must be a rendered number");
    assert.equal(typeof agentAllParsed.defaults.maxCostUSD, "number", ".agent-all.json defaults.maxCostUSD must be a rendered number");

    const mdcContent = readFileSync(resolve(target, ".cursor/rules/agent-all.mdc"), "utf-8");
    assert.doesNotMatch(mdcContent, /\{\{/, ".cursor/rules/agent-all.mdc must have no unrendered placeholders");
    assert.match(mdcContent, /alwaysApply:\s*true/, ".cursor/rules/agent-all.mdc must contain alwaysApply: true");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("agent-all install: refuses overwrite without --force; succeeds with --force", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-agent-all-install-"));
  try {
    let res = runInit([target, "--only=agent-all"]);
    assert.equal(res.status, 0, res.stderr);

    // Second run without --force should bail.
    res = runInit([target, "--only=agent-all"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Refusing to overwrite/);

    // With --force succeeds.
    res = runInit([target, "--only=agent-all", "--force"]);
    assert.equal(res.status, 0, res.stderr);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("agent-all install: installed lib modules are runnable (round-trip)", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-agent-all-install-"));
  try {
    const res = runInit([target, "--only=agent-all"]);
    assert.equal(res.status, 0, res.stderr);

    // Use the installed config-loader against a non-existent file → DEFAULTS.
    const r = spawnSync("node", ["-e", `
      import("${resolve(target, ".cursor/agent-all/lib/config-loader.mjs")}").then(m => {
        const x = m.loadConfig("${resolve(target, "__nope__.json")}");
        process.stdout.write(JSON.stringify(x));
      });
    `], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.warning, true);
    // Verify the installed config-loader returns the real DEFAULTS shape, not just any truthy object.
    assert.equal(typeof parsed.config.defaults.maxIter, "number", "DEFAULTS.defaults.maxIter should be a number");
    assert.equal(typeof parsed.config.defaults.maxCostUSD, "number", "DEFAULTS.defaults.maxCostUSD should be a number");
    assert.ok(["small", "medium", "large"].includes(parsed.config.defaults.waveSize), "DEFAULTS.defaults.waveSize should be small|medium|large");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("agent-all install: state-rw lib drops .agent-all-state.json round-trip", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-agent-all-install-"));
  try {
    runInit([target, "--only=agent-all"]);
    const lib = resolve(target, ".cursor/agent-all/lib/state-rw.mjs");
    const statePath = resolve(target, ".agent-all-state.json");
    let r = spawnSync("node", [lib, "write", statePath, '{"iter":1}'], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
    r = spawnSync("node", [lib, "read", statePath], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { iter: 1 });
    assert.equal(JSON.parse(readFileSync(statePath, "utf-8")).iter, 1);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
