import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
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

function snapshotFileName(tplRel, tag) {
  return `${tplRel.replace(/\//g, "_")}__${tag}.snap`;
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
  { tag: "operational-heavy", ctx: { purpose: "Operational app", stack: "typescript", deploy_targets: "vercel", operationalProfile: true, liteProfile: false, floorTheme: true, degradedFoundations: false, qa_personas: ["admin", "field operator"], agents: [{ name: "planner", when: "task docs and ambiguity control" }, { name: "orchestrator", when: "wave ownership and HOT file detection" }, { name: "verification-reviewer", when: "evidence and diff scope audit" }], constraints: "" } },
  { tag: "lite-profile", ctx: { purpose: "Lite app", stack: "javascript", deploy_targets: "", operationalProfile: false, liteProfile: true, floorTheme: false, degradedFoundations: true, agents: [{ name: "planner", when: "planning" }, { name: "dev", when: "implementation" }, { name: "reviewer", when: "review" }], constraints: "" } },
];

const LITE_PROFILE_TEMPLATES = new Set([
  "AGENTS.md.hbs",
  "CLAUDE.md.hbs",
]);

const EXPECTED_OPERATIONAL_TEMPLATES = [
  "AGENTS.md.hbs",
  "local-guides/CLAUDE.md.hbs",
  "local-guides/AGENTS.md.hbs",
  "task-ledger/CLAUDE.md.hbs",
  "task-ledger/index.md.hbs",
  "task-ledger/_template.md.hbs",
  "task-ledger/_handoff-template.md.hbs",
  "agents/orchestrator.md.hbs",
  "agents/integration-dev.md.hbs",
  "agents/quality-debt-reviewer.md.hbs",
  "agents/verification-reviewer.md.hbs",
  "agents/qa-reviewer.md.hbs",
  "agents/design-reviewer.md.hbs",
  "agents/security-reviewer.md.hbs",
  "agents/data-reviewer.md.hbs",
];

const LITE_FORBIDDEN_PATTERNS = [
  /docs\/tasks\//,
  /scripts\/agent-task-ledger-check\.mjs/,
  /operational policy checks/,
  /task[- ]ledger/i,
  /hard[- ]policy/i,
];

function listTemplates(dir, base = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = `${base}${e.name}`;
    return e.isDirectory() ? listTemplates(resolve(dir, e.name), `${p}/`) : [p];
  });
}

function fixturesForTemplate(tplRel) {
  return FIXTURES.filter(fx => fx.tag !== "lite-profile" || LITE_PROFILE_TEMPLATES.has(tplRel));
}

function assertLiteOutputClean(name, out) {
  for (const pattern of LITE_FORBIDDEN_PATTERNS) {
    assert.doesNotMatch(out, pattern, `${name} should not include ${pattern}`);
  }
}

test("includes operational Claude templates in render coverage", () => {
  const templates = new Set(listTemplates(TEMPLATES_DIR));
  for (const tplRel of EXPECTED_OPERATIONAL_TEMPLATES) {
    assert.ok(templates.has(tplRel), `missing template: ${tplRel}`);
  }
});

test("operational Claude root and QA reviewer templates publish orchestration gates and configured personas", () => {
  const fx = FIXTURES.find(f => f.tag === "operational-heavy");
  assert.ok(fx, "missing operational-heavy fixture");

  for (const tplRel of ["CLAUDE.md.hbs", "AGENTS.md.hbs"]) {
    const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
    const out = render(tpl, { interactionLang: "en", ...fx.ctx });
    assert.match(out, /## Orchestration Contract/);
    assert.match(out, /Main thread\/orchestrator owns task docs/);
    assert.match(out, /## Role Gate Matrix/);
    assert.match(out, /superpowers:brainstorming/);
    assert.match(out, /superpowers:writing-plans/);
    assert.match(out, /superpowers:dispatching-parallel-agents/);
    assert.match(out, /superpowers:subagent-driven-development/);
    assert.match(out, /superpowers:verification-before-completion/);
    assert.match(out, /UI or user-visible flow \| `design-reviewer` \+ `qa-reviewer`/);
    assert.match(out, /## Configured QA Personas/);
    assert.match(out, /- admin/);
    assert.match(out, /- field operator/);
  }

  const qaTpl = readFileSync(resolve(TEMPLATES_DIR, "agents/qa-reviewer.md.hbs"), "utf-8");
  const qaOut = render(qaTpl, fx.ctx);
  assert.match(qaOut, /## Configured QA Personas/);
  assert.match(qaOut, /- admin/);
  assert.match(qaOut, /- field operator/);

  const orchestratorTpl = readFileSync(resolve(TEMPLATES_DIR, "agents/orchestrator.md.hbs"), "utf-8");
  const orchestratorOut = render(orchestratorTpl, fx.ctx);
  assert.match(orchestratorOut, /## Role Gate Matrix/);
  assert.match(orchestratorOut, /UI or user-visible flow \| `design-reviewer` \+ `qa-reviewer`/);
  assert.match(orchestratorOut, /Frontend \+ backend\/API contract \| `integration-dev` \+ `verification-reviewer`/);
});

test("lite profile snapshots only templates lite mode renders", () => {
  const templates = listTemplates(TEMPLATES_DIR).filter(tplRel => tplRel.endsWith(".hbs"));
  const expectedSnapshots = new Set([...LITE_PROFILE_TEMPLATES].map(tplRel => snapshotFileName(tplRel, "lite-profile")));
  const actualSnapshots = new Set(
    readdirSync(resolve(here, "__snapshots__"))
      .filter(file => file.endsWith("__lite-profile.snap"))
  );

  assert.deepEqual(
    templates.filter(tplRel => fixturesForTemplate(tplRel).some(fx => fx.tag === "lite-profile")).sort(),
    [...LITE_PROFILE_TEMPLATES].sort(),
  );
  assert.deepEqual(actualSnapshots, expectedSnapshots);

  for (const tplRel of templates) {
    if (LITE_PROFILE_TEMPLATES.has(tplRel)) continue;
    assert.equal(
      fixturesForTemplate(tplRel).some(fx => fx.tag === "lite-profile"),
      false,
      `lite-profile should not snapshot non-lite template: ${tplRel}`
    );
    assert.equal(
      existsSync(resolve(here, "__snapshots__", snapshotFileName(tplRel, "lite-profile"))),
      false,
      `stale lite-profile snapshot should not exist for non-lite template: ${tplRel}`
    );
  }

  assert.equal(
    fixturesForTemplate("CLAUDE.md.hbs").some(fx => fx.tag === "lite-profile"),
    true,
    "lite-profile should still snapshot root CLAUDE.md.hbs"
  );
  assert.equal(
    fixturesForTemplate("AGENTS.md.hbs").some(fx => fx.tag === "lite-profile"),
    true,
    "lite-profile should still snapshot root AGENTS.md.hbs"
  );
});

test("lite rendered outputs omit operational hooks and task ledger guidance", () => {
  const fx = FIXTURES.find(f => f.tag === "lite-profile");
  assert.ok(fx, "missing lite-profile fixture");

  for (const tplRel of LITE_PROFILE_TEMPLATES) {
    const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
    const out = render(tpl, { title: "Rendered Task", guidePath: "src", interactionLang: "en", ...fx.ctx, persona: "auth" });
    assertLiteOutputClean(tplRel, out);
  }

  const claudeTpl = readFileSync(resolve(TEMPLATES_DIR, "CLAUDE.md.hbs"), "utf-8");
  const out = render(claudeTpl, { title: "Rendered Task", guidePath: "src", interactionLang: "en", ...fx.ctx, persona: "auth" });

  assert.doesNotMatch(out, /^## Hooks$/m);
  assert.doesNotMatch(out, /policy hooks/);
  assert.doesNotMatch(out, /task ledger/i);
  assert.match(out, /\.agent-skill\/specs\//);
  assert.match(out, /\.agent-skill\/plans\//);
});

test("settings template wires operational policy hook only for operational profile", () => {
  const tpl = readFileSync(resolve(TEMPLATES_DIR, "settings.local.json.hbs"), "utf-8");

  const operational = JSON.parse(render(tpl, { operationalProfile: true }));
  const operationalPreToolCommands = operational.hooks.PreToolUse
    .flatMap(group => group.hooks)
    .map(hook => hook.command);
  assert.ok(
    operationalPreToolCommands.some(command => command.includes(".claude/hooks/context-mode-router.mjs")),
    "operational settings should keep the context-mode router",
  );
  assert.ok(
    operationalPreToolCommands.some(command => command.includes(".claude/hooks/agent-policy-hook.mjs")),
    "operational settings should register the policy hook on fresh installs",
  );
  const operationalTaskPre = operational.hooks.PreToolUse.find(group => group.matcher === "Task");
  assert.ok(operationalTaskPre, "operational settings should register Task PreToolUse policy hook");
  assert.ok(
    operationalTaskPre.hooks.some(hook => hook.command.includes("agent-policy-hook.mjs") && hook.command.includes("PreToolUse")),
    "operational Task PreToolUse should route through the project-local policy hook",
  );
  const operationalTaskPost = operational.hooks.PostToolUse.find(group => group.matcher === "Task");
  assert.ok(operationalTaskPost, "operational settings should register Task PostToolUse policy hook");
  assert.ok(
    operationalTaskPost.hooks.some(hook => hook.command.includes("agent-policy-hook.mjs") && hook.command.includes("PostToolUse")),
    "operational Task PostToolUse should route through the project-local policy hook",
  );

  const lite = JSON.parse(render(tpl, { operationalProfile: false, liteProfile: true }));
  const litePreToolCommands = lite.hooks.PreToolUse
    .flatMap(group => group.hooks)
    .map(hook => hook.command);
  assert.ok(
    litePreToolCommands.some(command => command.includes(".claude/hooks/context-mode-router.mjs")),
    "lite settings should keep the context-mode router",
  );
  assert.ok(
    !litePreToolCommands.some(command => command.includes(".claude/hooks/agent-policy-hook.mjs")),
    "lite settings should not register a policy hook file it does not install",
  );
  assert.ok(lite.hooks.PostToolUse, "lite settings should have PostToolUse (wiki-capture advisory)");
  assert.ok(
    !lite.hooks.PostToolUse.some(group => group.matcher === "Task"),
    "lite settings should not register Task PostToolUse hooks",
  );
  assert.ok(
    lite.hooks.PostToolUse.some(group => group.matcher === "Write|Edit" && group.hooks.some(h => h.command.includes("wiki-capture.mjs"))),
    "lite settings should register Write|Edit wiki-capture advisory hook",
  );
});

test("task ledger check rejects active index entries pointing to missing task docs", () => {
  const project = mkdtempSync(resolve(tmpdir(), "agent-task-ledger-check-"));
  try {
    mkdirSync(resolve(project, "scripts"), { recursive: true });
    mkdirSync(resolve(project, "docs", "tasks"), { recursive: true });
    copyFileSync(
      resolve(TEMPLATES_DIR, "task-ledger", "agent-task-ledger-check.mjs"),
      resolve(project, "scripts", "agent-task-ledger-check.mjs")
    );
    writeFileSync(resolve(project, "docs", "tasks", "_template.md"), "# Template\n");
    writeFileSync(resolve(project, "docs", "tasks", "index.md"), [
      "# Task Ledger",
      "",
      "## Active",
      "",
      "- [ ] [Missing task](docs/tasks/1-missing.md)",
      "- [ ] docs/tasks/_handoff-template.md",
      "- [ ] docs/tasks/not-markdown.txt",
      "- [ ] docs/tasks/ignored.md.bak",
      "",
      "## Done",
      "",
      "- [x] docs/tasks/2-archived-missing.md",
      "",
    ].join("\n"));
    writeFileSync(resolve(project, "docs", "tasks", "1-valid.md"), [
      "# Valid",
      "",
      "## Goal",
      "",
      "## Acceptance",
      "",
      "## Phases",
      "",
      "## Decision Matrix",
      "",
      "## Ambiguity Log",
      "",
      "## Progress Snapshot",
      "",
      "## Verification",
      "",
      "## Cost Telemetry",
      "",
    ].join("\n"));

    const result = spawnSync(process.execPath, ["scripts/agent-task-ledger-check.mjs", "docs/tasks/1-valid.md"], {
      cwd: project,
      encoding: "utf-8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing active task.*docs\/tasks\/1-missing\.md/s);
    assert.doesNotMatch(result.stderr, /docs\/tasks\/2-archived-missing\.md/);
    assert.doesNotMatch(result.stderr, /docs\/tasks\/ignored\.md/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("task ledger check resolves relative active links from docs/tasks index", () => {
  const project = mkdtempSync(resolve(tmpdir(), "agent-task-ledger-check-"));
  try {
    mkdirSync(resolve(project, "scripts"), { recursive: true });
    mkdirSync(resolve(project, "docs", "tasks"), { recursive: true });
    copyFileSync(
      resolve(TEMPLATES_DIR, "task-ledger", "agent-task-ledger-check.mjs"),
      resolve(project, "scripts", "agent-task-ledger-check.mjs")
    );
    writeFileSync(resolve(project, "docs", "tasks", "_template.md"), "# Template\n");
    writeFileSync(resolve(project, "docs", "tasks", "index.md"), [
      "# Task Ledger",
      "",
      "## Active",
      "",
      "- [ ] 1-plain-missing.md",
      "- [ ] ./2-dot-missing.md",
      "- [ ] [Relative missing](3-link-missing.md)",
      "- [ ] [Dot relative missing](./4-dot-link-missing.md)",
      "",
    ].join("\n"));
    writeFileSync(resolve(project, "docs", "tasks", "1-valid.md"), [
      "# Valid",
      "",
      "## Goal",
      "",
      "## Acceptance",
      "",
      "## Phases",
      "",
      "## Decision Matrix",
      "",
      "## Ambiguity Log",
      "",
      "## Progress Snapshot",
      "",
      "## Verification",
      "",
      "## Cost Telemetry",
      "",
    ].join("\n"));

    const result = spawnSync(process.execPath, ["scripts/agent-task-ledger-check.mjs", "docs/tasks/1-valid.md"], {
      cwd: project,
      encoding: "utf-8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing active task.*docs\/tasks\/1-plain-missing\.md/s);
    assert.match(result.stderr, /missing active task.*docs\/tasks\/2-dot-missing\.md/s);
    assert.match(result.stderr, /missing active task.*docs\/tasks\/3-link-missing\.md/s);
    assert.match(result.stderr, /missing active task.*docs\/tasks\/4-dot-link-missing\.md/s);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("task ledger template progress snapshot includes current git state", () => {
  const tpl = readFileSync(resolve(TEMPLATES_DIR, "task-ledger", "_template.md.hbs"), "utf-8");
  const out = render(tpl, { title: "Rendered Task" });

  assert.match(out, /## Progress Snapshot/);
  assert.match(out, /^Current git state:/m);
});

for (const tplRel of listTemplates(TEMPLATES_DIR)) {
  if (!tplRel.endsWith(".hbs")) continue;
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
  for (const fx of fixturesForTemplate(tplRel)) {
    test(`snapshot: ${tplRel} × ${fx.tag}`, () => {
      const out = render(tpl, { title: "Rendered Task", guidePath: "src", interactionLang: "en", ...fx.ctx, persona: "auth" });
      if (fx.tag === "lite-profile") assertLiteOutputClean(tplRel, out);
      snapshot(snapshotFileName(tplRel, fx.tag).replace(/\.snap$/, ""), out);
    });
  }
}
