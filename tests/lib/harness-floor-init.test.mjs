import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

function runInit(plugin, args) {
  const binPath = resolve(`plugins/harness-floor-${plugin}/bin/init.mjs`);
  return spawnSync("node", [binPath, ...args], { encoding: "utf-8" });
}

function makeTmp() {
  const dir = mkdtempSync(join(tmpdir(), "agent-skill-floor-init-"));
  return dir;
}

test("harness-floor-cursor: bin/init.mjs --help-like usage error", () => {
  const res = runInit("cursor", []);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage/);
});

test("harness-floor-cursor: installs all kits to target", () => {
  const target = makeTmp();
  try {
    const res = runInit("cursor", [target]);
    assert.equal(res.status, 0, res.stderr);
    // Required outputs
    for (const f of [
      ".visual-qa.json",
      ".agent-all.json",
      ".cursor/rules/agent-all.mdc",
      ".cursor/agents/visual-qa-page.md",
      ".cursor/agents/agent-all-coordinator.md",
      ".cursor/agents/agent-all-implementer.md",
      ".cursor/agents/agent-all-reviewer.md",
    ]) {
      assert.ok(
        existsSync(resolve(target, f)),
        `expected file ${f} after init`,
      );
    }
    // MCP snippet printed to stdout
    assert.match(res.stdout, /Merge the following into .cursor\/mcp.json/);
    assert.match(res.stdout, /@playwright\/mcp@latest/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-floor-cursor: refuses to overwrite without --force", () => {
  const target = makeTmp();
  try {
    writeFileSync(resolve(target, ".visual-qa.json"), "{}");
    const res = runInit("cursor", [target]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Refusing to overwrite/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-floor-cursor: --force overwrites", () => {
  const target = makeTmp();
  try {
    writeFileSync(resolve(target, ".visual-qa.json"), "{old:true}");
    const res = runInit("cursor", [target, "--force"]);
    assert.equal(res.status, 0, res.stderr);
    const out = readFileSync(resolve(target, ".visual-qa.json"), "utf-8");
    assert.ok(out.includes("baseUrl"), "should render fresh template");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-floor-cursor: --only=agent-all skips visual-qa kit", () => {
  const target = makeTmp();
  try {
    const res = runInit("cursor", [target, "--only=agent-all"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(resolve(target, ".agent-all.json")));
    assert.ok(!existsSync(resolve(target, ".visual-qa.json")),
      "visual-qa.json should NOT be created with --only=agent-all");
    assert.ok(!existsSync(resolve(target, ".cursor/agents/visual-qa-page.md")));
    // MCP snippet should NOT be printed in agent-all-only mode
    assert.ok(!res.stdout.includes("Merge the following"),
      "MCP snippet should not print in --only=agent-all");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-floor-cursor: --ctx supplies template variables", () => {
  const target = makeTmp();
  const ctxPath = join(target, "..", "ctx.json");
  try {
    writeFileSync(ctxPath, JSON.stringify({
      baseUrl: "https://staging.example.com",
      maxIter: 25,
      breakCondition: "pytest -q",
      language: "ko",
    }));
    const res = runInit("cursor", [target, "--ctx", ctxPath]);
    assert.equal(res.status, 0, res.stderr);
    const vqa = readFileSync(resolve(target, ".visual-qa.json"), "utf-8");
    assert.ok(vqa.includes("https://staging.example.com"));
    const aa = JSON.parse(readFileSync(resolve(target, ".agent-all.json"), "utf-8"));
    assert.equal(aa.defaults.maxIter, 25);
    assert.equal(aa.loop.breakCondition, "pytest -q");
    assert.equal(aa.language, "ko");
  } finally {
    rmSync(target, { recursive: true, force: true });
    try { rmSync(ctxPath); } catch {}
  }
});

for (const plugin of ["copilot", "codex", "gemini"]) {
  test(`harness-floor-${plugin}: bin/init.mjs installs visual-qa + agent-all config`, () => {
    const target = makeTmp();
    try {
      const res = runInit(plugin, [target]);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(existsSync(resolve(target, ".visual-qa.json")));
      assert.ok(existsSync(resolve(target, ".agent-all.json")));
      assert.match(res.stdout, /@playwright\/mcp@latest/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-floor-${plugin}: refuses overwrite without --force`, () => {
    const target = makeTmp();
    try {
      writeFileSync(resolve(target, ".visual-qa.json"), "{}");
      const res = runInit(plugin, [target]);
      assert.equal(res.status, 2);
      assert.match(res.stderr, /Refusing to overwrite/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-floor-${plugin}: --only=agent-all skips visual-qa`, () => {
    const target = makeTmp();
    try {
      const res = runInit(plugin, [target, "--only=agent-all"]);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(existsSync(resolve(target, ".agent-all.json")));
      assert.ok(!existsSync(resolve(target, ".visual-qa.json")));
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-floor-${plugin}: --ctx language persists to .agent-all.json`, () => {
    const target = makeTmp();
    const ctxPath = join(target, "..", `${plugin}-ctx-lang.json`);
    try {
      writeFileSync(ctxPath, JSON.stringify({ language: "ko" }));
      const res = runInit(plugin, [target, "--only=agent-all", "--ctx", ctxPath]);
      assert.equal(res.status, 0, res.stderr);

      const agentAll = JSON.parse(readFileSync(resolve(target, ".agent-all.json"), "utf-8"));
      assert.equal(agentAll.language, "ko");
    } finally {
      rmSync(target, { recursive: true, force: true });
      try { rmSync(ctxPath); } catch {}
    }
  });
}

test("harness-floor-codex: prints MCP snippet without legacy agent hooks", () => {
  const target = makeTmp();
  try {
    const res = runInit("codex", [target]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /\[mcp_servers\.playwright\]/);
    assert.match(res.stdout, /sequential dispatch/i);
    assert.doesNotMatch(res.stdout, /\[\[hooks\.agent\]\]/);
    assert.doesNotMatch(res.stdout, /timeout_seconds/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
