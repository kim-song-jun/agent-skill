import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readPhase(name) {
  return readFileSync(
    resolve("plugins/harness-builder/skills/agent-init/phases", name),
    "utf-8",
  );
}

function readSkill() {
  return readFileSync(resolve("plugins/harness-builder/skills/agent-init/SKILL.md"), "utf-8");
}

function readTemplate(name) {
  return readFileSync(
    resolve("plugins/harness-builder/skills/agent-init/templates", name),
    "utf-8",
  );
}

function assertDryRunGuardBeforeMutation({ phaseFile, mutationPattern }) {
  const text = readPhase(phaseFile);
  const guardIndex = text.indexOf("If `--dry-run` is set");
  assert.notEqual(guardIndex, -1, `${phaseFile} must define an early dry-run guard`);

  const mutationMatch = text.match(mutationPattern);
  assert.ok(mutationMatch, `${phaseFile} must still describe the mutation step`);
  assert.ok(
    guardIndex < mutationMatch.index,
    `${phaseFile} dry-run guard must appear before mutation steps`,
  );
}

test("agent-init phase docs guard dry-run before phase 1 through 4 mutations", () => {
  assertDryRunGuardBeforeMutation({
    phaseFile: "1-discover.md",
    mutationPattern: /Update `\.claude\/\.agent-init-state\.json`/,
  });
  assertDryRunGuardBeforeMutation({
    phaseFile: "2-claude-md.md",
    mutationPattern: /\bWrite `CLAUDE\.md`/,
  });
  assertDryRunGuardBeforeMutation({
    phaseFile: "3-agents.md",
    mutationPattern: /\bFan out\b/,
  });
  assertDryRunGuardBeforeMutation({
    phaseFile: "4-hooks.md",
    mutationPattern: /`mkdir -p \.claude\/hooks`/,
  });
});

test("phase 5 dry-run summary covers all planned write and wiring categories", () => {
  const phase5 = readPhase("5-wire.md");
  const dryRunSectionStart = phase5.indexOf("If `--dry-run` is set");
  assert.notEqual(dryRunSectionStart, -1, "Phase 5 must describe dry-run output");
  const dryRunSection = phase5.slice(dryRunSectionStart, phase5.indexOf("\n5.", dryRunSectionStart));

  for (const phrase of [
    "planned root files",
    "local guide files",
    "agent files",
    "hook files",
    "settings changes",
    "task ledger files",
    "platform wiring",
    "planned global config patches",
    "foundation update plan",
    "post-install doctor plan",
    "commit plan",
  ]) {
    assert.match(dryRunSection, new RegExp(phrase), `Phase 5 dry-run summary must include ${phrase}`);
  }
});

test("phase 5 handles dry-run before reading persisted plugin scan state", () => {
  const phase5 = readPhase("5-wire.md");
  const dryRunIndex = phase5.indexOf("If `--dry-run` is set");
  assert.notEqual(dryRunIndex, -1, "Phase 5 must describe dry-run output");

  const stateReadMatch = phase5.match(/Re-read `plugin_scan` from `\.agent-init-state\.json`/);
  assert.ok(stateReadMatch, "Phase 5 must still describe the normal-mode plugin_scan state read");

  const dryRunSection = phase5.slice(dryRunIndex, phase5.indexOf("\n5.", dryRunIndex));
  const usesInMemoryPluginScan =
    /in-memory (?:dry-run )?context/.test(dryRunSection) &&
    /plugin_scan/.test(dryRunSection);

  assert.ok(
    dryRunIndex < stateReadMatch.index || usesInMemoryPluginScan,
    "Phase 5 dry-run must run before .agent-init-state.json reads or explicitly use in-memory plugin_scan context",
  );
});

test("phase 5 creates docs tasks directory before writing task ledger files", () => {
  const phase5 = readPhase("5-wire.md");
  const docsTasksIndex = phase5.indexOf("docs/tasks/");
  assert.notEqual(docsTasksIndex, -1, "Phase 5 must mention docs/tasks/");
  const mkdirIndex = phase5.indexOf("`mkdir -p`", docsTasksIndex);
  assert.notEqual(mkdirIndex, -1, "Phase 5 must explicitly create docs/tasks/ with mkdir -p");

  const taskLedgerMatch = phase5.match(/write task ledger files/i);
  assert.ok(taskLedgerMatch, "Phase 5 must still describe task ledger writes");
  assert.ok(
    mkdirIndex < taskLedgerMatch.index,
    "Phase 5 must create docs/tasks/ before writing task ledger files",
  );
});

test("agent-init root guidance covers both CLAUDE.md and AGENTS.md", () => {
  const skill = readSkill();
  const phase2 = readPhase("2-claude-md.md");
  const phase5 = readPhase("5-wire.md");

  assert.match(skill, /CLAUDE\.md[\s\S]{0,80}AGENTS\.md/);
  assert.match(phase2, /templates\/CLAUDE\.md\.hbs/);
  assert.match(phase2, /templates\/AGENTS\.md\.hbs/);
  assert.match(phase2, /Root files:[^\n]*`CLAUDE\.md`[^\n]*`AGENTS\.md`/);
  assert.match(phase2, /Write `CLAUDE\.md` and `AGENTS\.md`/);
  assert.match(phase5, /planned root files \(`CLAUDE\.md`, `AGENTS\.md`, `\.gitignore`/);
  assert.match(phase5, /git add -- CLAUDE\.md AGENTS\.md/);
  assert.match(phase5, /git commit .* -- CLAUDE\.md AGENTS\.md/);
});

test("agent-init local guidance covers both folder-level CLAUDE.md and AGENTS.md", () => {
  const phase2 = readPhase("2-claude-md.md");
  const phase5 = readPhase("5-wire.md");

  assert.match(phase2, /templates\/local-guides\/CLAUDE\.md\.hbs/);
  assert.match(phase2, /templates\/local-guides\/AGENTS\.md\.hbs/);
  assert.match(phase2, /Local guide files:[^\n]*`CLAUDE\.md`[^\n]*`AGENTS\.md`/);
  assert.match(phase2, /render `CLAUDE\.md` and `AGENTS\.md` local guides/i);
  assert.match(phase2, /mergeSentinelSection[\s\S]{0,160}local guide/);
  assert.match(phase5, /local guide files[\s\S]{0,220}explicit pathspecs/i);
});

test("theme context is resolved before phase 2 rendering and phase 5 does not backfill it", () => {
  const phase1 = readPhase("1-discover.md");
  const phase2 = readPhase("2-claude-md.md");
  const phase5 = readPhase("5-wire.md");

  assert.match(
    phase1,
    /Resolve theme[\s\S]*floorTheme[\s\S]*Build the discovery context object/,
    "Phase 1 must resolve theme/floorTheme before building discovery context",
  );
  assert.match(
    phase2,
    /floorTheme[\s\S]*render\(tpl, \{[\s\S]*floorTheme/,
    "Phase 2 must include floorTheme in the CLAUDE.md render context",
  );
  assert.doesNotMatch(
    phase5,
    /Set Phase 2 context flag `floorTheme: true`/,
    "Phase 5 must not set a Phase 2 render flag after CLAUDE.md has already rendered",
  );
  assert.match(
    phase5,
    /use[s]? Phase 1[^\n]*theme/i,
    "Phase 5 must consume the already-resolved Phase 1 theme decision",
  );
});

test("phase 1 resolves legacy visual-qa before default floor theme", () => {
  const phase1 = readPhase("1-discover.md");
  const liteIndex = phase1.indexOf("If `lite` is true");
  const legacyIndex = phase1.indexOf("`--visual-qa` was passed without `--theme=*`");
  const floorIndex = phase1.indexOf("`--theme=floor` was passed OR no theme flag was passed");

  assert.notEqual(liteIndex, -1, "Phase 1 must resolve the lite theme first");
  assert.notEqual(legacyIndex, -1, "Phase 1 must preserve legacy --visual-qa without --theme=*");
  assert.notEqual(floorIndex, -1, "Phase 1 must resolve explicit/default floor theme");
  assert.ok(liteIndex < legacyIndex, "Phase 1 must check lite before legacy --visual-qa");
  assert.ok(
    legacyIndex < floorIndex,
    "Phase 1 must check legacy --visual-qa before the default floor branch",
  );
});

test("agent-init skill presents operational default and rejects unsupported theme flags", () => {
  const skill = readSkill();
  assert.match(skill, /Default \(no theme flag\)[\s\S]{0,180}operational\/heavy/);
  assert.match(skill, /`--lite`[\s\S]{0,180}canonical lightweight/);
  assert.doesNotMatch(skill, /--theme=thrift|no-op stub|design pending|Theme B planned/i);

  const phase1 = readPhase("1-discover.md");
  assert.match(phase1, /Unsupported `--theme=` value/);
  assert.match(phase1, /Use `\/thrift` after `\/agent-init`/);
  assert.doesNotMatch(phase1, /--theme=thrift/i);
});

test("agent-init --lang contract persists into root guidance and agent-all config", () => {
  const skill = readSkill();
  const phase1 = readPhase("1-discover.md");
  const phase2 = readPhase("2-claude-md.md");
  const phase5 = readPhase("5-wire.md");
  const claudeTemplate = readTemplate("CLAUDE.md.hbs");
  const agentAllTemplate = readFileSync(
    resolve("plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs"),
    "utf-8",
  );

  assert.match(skill, /--lang=ko\|en\|auto[\s\S]{0,260}downstream commands/);
  assert.match(skill, /--lang=auto[\s\S]{0,260}(locale|`LANG`|`LC_ALL`|`LC_MESSAGES`)/i);
  assert.match(phase1, /--lang=auto[\s\S]{0,220}(locale|LANG|LC_ALL|LC_MESSAGES)/i);
  assert.match(phase1, /ctx\.interactionLang/);
  assert.match(phase2, /interactionLang[\s\S]{0,160}templates\/CLAUDE\.md\.hbs/);
  assert.match(phase5, /language:\s*ctx\.interactionLang/);
  assert.match(claudeTemplate, /^## Language$/m);
  assert.match(claudeTemplate, /{{interactionLang}}/);
  assert.match(agentAllTemplate, /"language": "{{language}}"/);
});

test("agent-init degraded foundation guidance points at the approved updater", () => {
  const phase1 = readPhase("1-discover.md");
  const phase2 = readPhase("2-claude-md.md");
  const claudeTemplate = readTemplate("CLAUDE.md.hbs");

  assert.match(phase1, /foundationUpdateCommand/);
  assert.match(phase2, /foundationUpdateCommand/);
  assert.match(claudeTemplate, /foundationUpdateCommand/);
  assert.match(claudeTemplate, /Manual fallback/);
});

test("agent-init phase 5 runs doctor before committing the scaffold", () => {
  const phase5 = readPhase("5-wire.md");
  const doctorIndex = phase5.indexOf("Post-install doctor");
  const commitIndex = phase5.indexOf("Single git commit");

  assert.notEqual(doctorIndex, -1, "Phase 5 must run a post-install doctor check");
  assert.notEqual(commitIndex, -1, "Phase 5 must still describe the bootstrap commit");
  assert.ok(doctorIndex < commitIndex, "Phase 5 must validate the scaffold before committing it");
  assert.match(phase5, /bin\/doctor\.mjs[\s\S]{0,220}--platform=claude/);
  assert.match(phase5, /scripts\/doctor\.mjs[\s\S]{0,220}(equivalent|compatibility wrapper)/i);
  assert.match(phase5, /--profile=<operational\|builder\|lite>/);
  assert.match(phase5, /non-zero exit[\s\S]{0,180}abort/i);
});

test("agent-init root guidance carries domain-neutral execution discipline", () => {
  for (const templateName of ["CLAUDE.md.hbs", "AGENTS.md.hbs"]) {
    const body = readTemplate(templateName);

    assert.match(body, /## Execution Discipline/);
    assert.match(body, /No scope retreat/i);
    assert.match(body, /Self-Audit/);
    assert.match(body, /Tech-Debt Grep/);
    assert.match(body, /Decision Matrix/);
    assert.match(body, /## Subagent Dispatch Contract/);
    assert.match(body, /superpowers:brainstorming/);
    assert.match(body, /superpowers:writing-plans/);
    assert.match(body, /superpowers:dispatching-parallel-agents/);
    assert.match(body, /superpowers:subagent-driven-development/);
    assert.match(body, /superpowers:verification-before-completion/);
    assert.match(body, /context-mode[\s\S]{0,160}(file-backed logs|bulk context|broad searches|long outputs)/i);
    assert.match(body, /working directory/i);
    assert.match(body, /owned files/i);
    assert.match(body, /forbidden files/i);
    assert.match(body, /Do not self-commit/i);
    assert.doesNotMatch(body, /POSCO|LIMS|MDS|Lot 번호|Outline DB|xlsx SSOT/);
  }
});
