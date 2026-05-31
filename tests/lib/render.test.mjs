import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { render } from "../../plugins/harness-builder/skills/agent-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function snapshot(name, actual) {
  const snapPath = resolve(here, "__snapshots__", `${name}.snap`);
  mkdirSync(dirname(snapPath), { recursive: true });
  if (!existsSync(snapPath) || process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, "utf-8");
  assert.equal(actual, expected, `Snapshot mismatch for ${name}. Re-run with UPDATE_SNAPSHOTS=1 to update.`);
}

test("substitutes simple variables", () => {
  assert.equal(render("hello {{name}}", { name: "world" }), "hello world");
});

test("supports dotted paths", () => {
  assert.equal(render("{{user.email}}", { user: { email: "a@b" } }), "a@b");
});

test("renders #if block when truthy", () => {
  assert.equal(render("{{#if show}}yes{{/if}}", { show: true }), "yes");
});

test("skips #if block when falsy", () => {
  assert.equal(render("a{{#if show}}yes{{/if}}b", { show: false }), "ab");
});

test("renders #each block over arrays", () => {
  const out = render("{{#each items}}- {{this}}\n{{/each}}", { items: ["a", "b"] });
  assert.equal(out, "- a\n- b\n");
});

test("#each exposes @index", () => {
  const out = render("{{#each items}}{{@index}}:{{this}} {{/each}}", { items: ["x", "y"] });
  assert.equal(out, "0:x 1:y ");
});

test("missing variable renders as empty string", () => {
  assert.equal(render("hello {{name}}!", {}), "hello !");
});

test("ignores unknown helpers gracefully (passes through)", () => {
  assert.equal(render("{{#unknown}}x{{/unknown}}", {}), "{{#unknown}}x{{/unknown}}");
});

test("#each over objects exposes properties as variables", () => {
  const out = render(
    "{{#each agents}}- {{name}} ({{role}})\n{{/each}}",
    { agents: [{ name: "planner", role: "plan" }, { name: "dev", role: "code" }] }
  );
  assert.equal(out, "- planner (plan)\n- dev (code)\n");
});

test("#each primitives still work via {{this}}", () => {
  const out = render("{{#each items}}{{this}} {{/each}}", { items: ["a", "b"] });
  assert.equal(out, "a b ");
});

test("nested #each over object arrays renders inner loop correctly", () => {
  const tpl = "{{#each waves}}Wave {{@index}}:\n{{#each this.tasks}}- {{this.id}}: {{this.title}}\n{{/each}}\n{{/each}}";
  const ctx = { waves: [
    { tasks: [{ id: 1, title: "A" }, { id: 2, title: "B" }] },
    { tasks: [{ id: 3, title: "C" }] },
  ]};
  const out = render(tpl, ctx);
  assert.equal(out, "Wave 0:\n- 1: A\n- 2: B\n\nWave 1:\n- 3: C\n\n");
});

test("nested #if inside #if still renders correctly", () => {
  const tpl = "{{#if outer}}OUT-{{#if inner}}IN{{/if}}-END{{/if}}";
  assert.equal(render(tpl, { outer: true, inner: true }), "OUT-IN-END");
  assert.equal(render(tpl, { outer: true, inner: false }), "OUT--END");
});

const TEMPLATES_DIR = resolve(here, "..", "..", "plugins", "harness-builder", "skills", "agent-init", "templates");

const FIXTURES = [
  { tag: "ts-small", ctx: { purpose: "Demo app", stack: "typescript", deploy_targets: "vercel", agents: [{name:"planner",when:"all planning"},{name:"dev",when:"implementation"},{name:"reviewer",when:"final review"}], constraints: "", floorTheme: false } },
  { tag: "py-medium", ctx: { purpose: "API service", stack: "python", deploy_targets: "docker", agents: [{name:"planner",when:"all planning"},{name:"dev",when:"implementation"},{name:"designer",when:"UI"},{name:"qa-auth",when:"auth flow"},{name:"tester",when:"automated runs"},{name:"reviewer",when:"final review"}], constraints: "GDPR scope", floorTheme: false } },
  { tag: "rs-large", ctx: { purpose: "CLI tool", stack: "rust", deploy_targets: "github releases", agents: [{name:"planner",when:""},{name:"frontend-dev",when:""},{name:"backend-dev",when:""},{name:"qa-cli",when:""},{name:"tester",when:""},{name:"reviewer",when:""},{name:"doc-writer",when:""}], constraints: "", floorTheme: false } },
  { tag: "go-small", ctx: { purpose: "Worker", stack: "go", deploy_targets: "", agents: [{name:"planner",when:""},{name:"dev",when:""},{name:"reviewer",when:""}], constraints: "", floorTheme: false } },
  { tag: "mono-medium", ctx: { purpose: "Monorepo", stack: "javascript", deploy_targets: "cloudflare", agents: [{name:"planner",when:""},{name:"dev",when:""},{name:"designer",when:""},{name:"qa-general",when:""},{name:"tester",when:""},{name:"reviewer",when:""}], constraints: "", floorTheme: false } },
  { tag: "floor-theme", ctx: { purpose: "Floor test app", stack: "typescript", deploy_targets: "vercel", agents: [{name:"planner",when:"plan"},{name:"dev",when:"code"},{name:"reviewer",when:"review"}], constraints: "", floorTheme: true } },
  { tag: "ts-docker", ctx: { purpose: "Docker-based service", stack: "typescript", deploy_targets: "fly.io", runtime: "docker", services: ["postgres", "redis"], services_str: "postgres, redis", agents: [{name:"planner",when:"plan"},{name:"backend-dev",when:"server"},{name:"reviewer",when:"review"}], constraints: "", floorTheme: false } },
  { tag: "operational-heavy", ctx: { purpose: "Operational app", stack: "typescript", deploy_targets: "vercel", operationalProfile: true, liteProfile: false, floorTheme: true, degradedFoundations: false, agents: [{ name: "planner", when: "task docs and ambiguity control" }, { name: "orchestrator", when: "wave ownership and HOT file detection" }, { name: "verification-reviewer", when: "evidence and diff scope audit" }], constraints: "" } },
  { tag: "lite-profile", ctx: { purpose: "Lite app", stack: "javascript", deploy_targets: "", operationalProfile: false, liteProfile: true, floorTheme: false, degradedFoundations: true, agents: [{ name: "planner", when: "planning" }, { name: "dev", when: "implementation" }, { name: "reviewer", when: "review" }], constraints: "" } },
];

const EXPECTED_OPERATIONAL_TEMPLATES = [
  "local-guides/CLAUDE.md.hbs",
  "task-ledger/CLAUDE.md.hbs",
  "task-ledger/index.md.hbs",
  "task-ledger/_template.md.hbs",
  "task-ledger/_handoff-template.md.hbs",
  "agents/orchestrator.md.hbs",
  "agents/integration-dev.md.hbs",
  "agents/verification-reviewer.md.hbs",
  "agents/qa-reviewer.md.hbs",
  "agents/design-reviewer.md.hbs",
  "agents/security-reviewer.md.hbs",
  "agents/data-reviewer.md.hbs",
];

function listTemplates(dir, base = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = `${base}${e.name}`;
    return e.isDirectory() ? listTemplates(resolve(dir, e.name), `${p}/`) : [p];
  });
}

test("includes operational Claude templates in render coverage", () => {
  const templates = new Set(listTemplates(TEMPLATES_DIR));
  for (const tplRel of EXPECTED_OPERATIONAL_TEMPLATES) {
    assert.ok(templates.has(tplRel), `missing template: ${tplRel}`);
  }
});

for (const tplRel of listTemplates(TEMPLATES_DIR)) {
  if (!tplRel.endsWith(".hbs")) continue;
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
  for (const fx of FIXTURES) {
    test(`snapshot: ${tplRel} × ${fx.tag}`, () => {
      const out = render(tpl, { title: "Rendered Task", guidePath: "src", ...fx.ctx, persona: "auth" });
      snapshot(`${tplRel.replace(/\//g, "_")}__${fx.tag}`, out);
    });
  }
}
