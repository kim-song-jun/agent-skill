import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

function makeTmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runScript(script, args) {
  const path = resolve(`plugins/harness-floor-gemini/bin/${script}`);
  return spawnSync("node", [path, ...args], { encoding: "utf-8" });
}

test("spawn-wave: usage error without --wave/--tmp", () => {
  const res = runScript("spawn-wave.mjs", []);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage/);
});

test("spawn-wave: --dry-run with 3-task wave returns completed aggregate", () => {
  const dir = makeTmp("agent-skill-spawn-wave-");
  const wavePath = join(dir, "wave.json");
  const tmpDir = join(dir, "tmp");
  try {
    writeFileSync(wavePath, JSON.stringify({
      index: 0,
      tasks: [
        { id: 1, title: "T1", role: "dev", body: "implement X" },
        { id: 2, title: "T2", role: "dev", body: "implement Y" },
        { id: 3, title: "T3", role: "reviewer", body: "review Z" },
      ],
    }));
    const res = runScript("spawn-wave.mjs", ["--wave", wavePath, "--tmp", tmpDir, "--dry-run"]);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.index, 0);
    assert.equal(out.tasks.length, 3);
    assert.equal(out.status, "completed");
    assert.equal(out.dryRun, true);
    assert.equal(out.tasks[0].status, "completed");
    assert.equal(out.tasks[0].agentId, "dry-1");
    assert.equal(out.spawned.length, 3);
    assert.match(out.spawned[0], /gemini.*chat/);
    // Tmp files should exist
    for (const id of [1, 2, 3]) {
      assert.ok(existsSync(join(tmpDir, `task-${id}.json`)));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("spawn-wave: --dry-run with empty tasks returns completed", () => {
  const dir = makeTmp("agent-skill-spawn-wave-");
  const wavePath = join(dir, "wave.json");
  const tmpDir = join(dir, "tmp");
  try {
    writeFileSync(wavePath, JSON.stringify({ index: 1, tasks: [] }));
    const res = runScript("spawn-wave.mjs", ["--wave", wavePath, "--tmp", tmpDir, "--dry-run"]);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.status, "completed");
    assert.equal(out.tasks.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("spawn-wave: invalid wave JSON aborts", () => {
  const dir = makeTmp("agent-skill-spawn-wave-");
  const wavePath = join(dir, "wave.json");
  try {
    writeFileSync(wavePath, JSON.stringify({ tasks: "not-an-array" }));
    const res = runScript("spawn-wave.mjs", ["--wave", wavePath, "--tmp", join(dir, "tmp"), "--dry-run"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /wave\.index|wave\.tasks/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("spawn-page-subagent: usage error without --pages/--tmp", () => {
  const res = runScript("spawn-page-subagent.mjs", []);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage/);
});

test("spawn-page-subagent: --dry-run with 2 pages returns perPageStatus", () => {
  const dir = makeTmp("agent-skill-spawn-page-");
  const pagesPath = join(dir, "pages.json");
  const tmpDir = join(dir, "tmp");
  try {
    writeFileSync(pagesPath, JSON.stringify({
      slugDir: "/tmp/slug",
      pages: [
        { name: "home", prompt: "capture home" },
        { name: "settings/account", prompt: "capture settings" },
      ],
    }));
    const res = runScript("spawn-page-subagent.mjs", ["--pages", pagesPath, "--tmp", tmpDir, "--dry-run"]);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.status, "completed");
    assert.equal(out.perPageStatus.length, 2);
    assert.equal(out.perPageStatus[0].page, "home");
    assert.equal(out.perPageStatus[0].status, "completed");
    // Sanitization for "settings/account" → "settings_account"
    assert.ok(existsSync(join(tmpDir, "page-settings_account.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("spawn-page-subagent: --max-parallel chunks correctly", () => {
  const dir = makeTmp("agent-skill-spawn-page-");
  const pagesPath = join(dir, "pages.json");
  const tmpDir = join(dir, "tmp");
  try {
    writeFileSync(pagesPath, JSON.stringify({
      slugDir: "/tmp/slug",
      pages: [
        { name: "p1", prompt: "..." },
        { name: "p2", prompt: "..." },
        { name: "p3", prompt: "..." },
        { name: "p4", prompt: "..." },
        { name: "p5", prompt: "..." },
      ],
    }));
    const res = runScript("spawn-page-subagent.mjs", [
      "--pages", pagesPath, "--tmp", tmpDir, "--max-parallel", "2", "--dry-run",
    ]);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.status, "completed");
    assert.equal(out.maxParallelUsed, 2);
    assert.equal(out.perPageStatus.length, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("spawn-page-subagent: missing output file marks page failed", () => {
  // Force not-dry-run path with a non-existent binary; subprocess exits quickly
  // and produces no output file, so collectResults should mark each page failed.
  const dir = makeTmp("agent-skill-spawn-page-");
  const pagesPath = join(dir, "pages.json");
  const tmpDir = join(dir, "tmp");
  try {
    writeFileSync(pagesPath, JSON.stringify({
      slugDir: "/tmp/slug",
      pages: [{ name: "x", prompt: "..." }],
    }));
    // 1s timeout so subprocess waiter exits quickly even with no output.
    const res = runScript("spawn-page-subagent.mjs", [
      "--pages", pagesPath, "--tmp", tmpDir,
      "--gemini-bin", "/nonexistent/gemini-binary",
      "--timeout", "1",
    ]);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.status, "incomplete");
    assert.equal(out.perPageStatus[0].status, "failed");
    assert.match(out.perPageStatus[0].errors[0], /subprocess output missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
