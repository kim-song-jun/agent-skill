import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const RENDERER = resolve("plugins/harness-builder-cursor/bin/init.mjs");

test("cursor init.mjs renders templates into target dir", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-init-"));
  try {
    const ctxPath = join(target, "ctx.json");
    writeFileSync(ctxPath, JSON.stringify({
      purpose: "Demo",
      size: "small",
      qa_personas: ["auth"],
      deploy_targets: "fly.io",
      constraints: "",
    }));
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });

    const mdc = join(target, ".cursor/rules/agent-init.mdc");
    const planner = join(target, ".cursor/agents/planner.md");
    assert.ok(existsSync(mdc), `${mdc} should exist`);
    assert.ok(existsSync(planner), `${planner} should exist`);
    const mdcContent = readFileSync(mdc, "utf-8");
    assert.ok(mdcContent.includes("Demo"), "purpose substituted");
    assert.ok(mdcContent.includes("alwaysApply: true"), "frontmatter preserved");
    assert.ok(!mdcContent.includes("{{purpose}}"), "no unrendered placeholders");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cursor init.mjs refuses to overwrite without --force", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-init-"));
  try {
    const ctxPath = join(target, "ctx.json");
    writeFileSync(ctxPath, JSON.stringify({ purpose: "Demo", size: "small", qa_personas: ["a"], deploy_targets: "", constraints: "" }));
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });
    let threw = false;
    try {
      execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });
    } catch (err) {
      threw = true;
      assert.ok(err.status !== 0, "exit non-zero on overwrite");
    }
    assert.ok(threw, "expected execFileSync to throw on overwrite");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cursor init.mjs --force overwrites", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-init-"));
  try {
    const ctxPath = join(target, "ctx.json");
    writeFileSync(ctxPath, JSON.stringify({ purpose: "Demo", size: "small", qa_personas: ["a"], deploy_targets: "", constraints: "" }));
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath, "--force"], { stdio: "pipe" });
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
