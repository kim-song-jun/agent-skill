import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { render } from "../../../plugins/harness-builder/skills/agent-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function snapshot(name, actual) {
  const snapPath = resolve(here, "__snapshots__", `${name}.snap`);
  mkdirSync(dirname(snapPath), { recursive: true });
  if (!existsSync(snapPath) || process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, "utf-8");
  assert.equal(actual, expected, `Snapshot mismatch for ${name}.`);
}

const TEMPLATES_DIR = resolve(here, "..", "..", "..", "plugins", "harness-floor", "skills", "agent-all", "templates");

const CONFIG_FIXTURES = [
  { tag: "minimal", ctx: { maxIter: 1, maxCostUSD: 50, waveSize: "medium", breakCondition: "npm test" } },
  { tag: "loop-large", ctx: { maxIter: 10, maxCostUSD: 200, waveSize: "large", breakCondition: "pytest && npm test" } },
  { tag: "small-tight", ctx: { maxIter: 1, maxCostUSD: 5, waveSize: "small", breakCondition: "make verify" } },
];

const PR_FIXTURES = [
  { tag: "single-wave-pass", ctx: { task: { title: "Fix login", path: "docs/tasks/12-fix-login.md" }, plan: { path: "docs/superpowers/plans/2026-05-17-fix-login.md" }, waves: [{ status: "completed", tasks: [{ id: 1, title: "Failing test" }, { id: 2, title: "Fix" }] }], loop: { breakCondition: "npm test" }, breakConditionPassed: true, testsPass: true, reviewClean: true, iter: 1, maxIter: 1, costUSD: "2.40", maxCostUSD: 50 } },
  { tag: "multi-wave-loop", ctx: { task: { title: "Refactor", path: "docs/tasks/13-refactor.md" }, plan: { path: "docs/superpowers/plans/p.md" }, waves: [{ status: "completed", tasks: [{ id: 1, title: "A" }] }, { status: "completed", tasks: [{ id: 2, title: "B" }] }], loop: { breakCondition: "pytest" }, breakConditionPassed: true, testsPass: true, reviewClean: true, iter: 3, maxIter: 5, costUSD: "12.00", maxCostUSD: 50 } },
  { tag: "incomplete", ctx: { task: { title: "X", path: "docs/tasks/x.md" }, plan: { path: "p.md" }, waves: [{ status: "incomplete", tasks: [{ id: 1, title: "A" }] }], loop: { breakCondition: "true" }, breakConditionPassed: false, testsPass: false, reviewClean: false, iter: 1, maxIter: 1, costUSD: "0.50", maxCostUSD: 50 } },
];

function listTemplates(dir) {
  return readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith(".hbs")).map(e => e.name);
}

for (const tplName of listTemplates(TEMPLATES_DIR)) {
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplName), "utf-8");
  const fixtures = tplName.startsWith("agent-all.config") ? CONFIG_FIXTURES : PR_FIXTURES;
  for (const fx of fixtures) {
    test(`snapshot: ${tplName} × ${fx.tag}`, () => {
      const out = render(tpl, { language: "auto", ...fx.ctx });
      snapshot(`${tplName}__${fx.tag}`, out);
    });
  }
}
