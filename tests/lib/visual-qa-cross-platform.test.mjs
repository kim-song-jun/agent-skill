import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLATFORMS = ["cursor", "copilot", "codex", "gemini"];
const PHASES = [
  "0-preflight.md",
  "1-config.md",
  "2-discover.md",
  "3-capture.md",
  "4-aggregate.md",
  "5-summary.md",
];

for (const platform of PLATFORMS) {
  const ROOT = `plugins/harness-floor-${platform}/skills/visual-qa-${platform}`;

  test(`visual-qa-${platform}: SKILL.md graduates to full pipeline`, () => {
    const md = readFileSync(resolve(ROOT, "SKILL.md"), "utf-8");
    assert.match(md, /^---\nname: visual-qa/);
    assert.match(md, /^## Pipeline$/m);
    assert.ok(md.includes("0-preflight"), "should reference 0-preflight phase file");
    assert.ok(md.includes("3-capture"), "should reference 3-capture phase file");
    assert.ok(md.includes("5-summary"), "should reference 5-summary phase file");
    assert.ok(
      !md.includes("Not implemented in this scaffold"),
      `${platform}: should NOT still claim Phase 3 unimplemented`,
    );
  });

  test(`visual-qa-${platform}: all 6 phase files exist`, () => {
    for (const phase of PHASES) {
      assert.ok(
        existsSync(resolve(ROOT, "phases", phase)),
        `${platform}: phase file missing: ${phase}`,
      );
    }
  });

  test(`visual-qa-${platform}: phase headings match contract`, () => {
    const cases = [
      ["0-preflight.md", "# Phase 0 — Preflight"],
      ["1-config.md", "# Phase 1 — Config + Matrix"],
      ["2-discover.md", "# Phase 2 — Prior-run Discovery + Slug Dir"],
      ["3-capture.md", "# Phase 3 — Capture + Analyze"],
      ["4-aggregate.md", "# Phase 4 — Aggregate + Diff + Report"],
      ["5-summary.md", "# Phase 5 — Summary"],
    ];
    for (const [file, heading] of cases) {
      const body = readFileSync(resolve(ROOT, "phases", file), "utf-8");
      assert.ok(
        body.startsWith(heading),
        `${platform}/${file} should start with "${heading}"`,
      );
    }
  });

  test(`visual-qa-${platform}: comprehensive verdict gates critical and major regressions`, () => {
    const aggregate = readFileSync(resolve(ROOT, "phases/4-aggregate.md"), "utf-8");
    const summary = readFileSync(resolve(ROOT, "phases/5-summary.md"), "utf-8");
    assert.match(aggregate, /lib\/verdict\.mjs/);
    assert.match(aggregate, /verdict\.json/);
    assert.match(aggregate, /\["critical", "major"\]/);
    assert.match(summary, /Comprehensive mode/);
    assert.match(summary, /verdict\.pass/);
    assert.match(summary, /\["critical", "major"\]/);
  });

  test(`visual-qa-${platform}: phase 3 documents platform dispatch primitive`, () => {
    const body = readFileSync(resolve(ROOT, "phases/3-capture.md"), "utf-8");
    const expectations = {
      cursor: ["is_background", "visual-qa-page", "@visual-qa-page"],
      copilot: ["task(", "list_agents", "subagentStop"],
      codex: ["sequential", ".codex/skills/visual-qa-page/SKILL.md"],
      gemini: ["run_shell_command", "gemini chat", "background: true"],
    }[platform];
    for (const needle of expectations) {
      assert.ok(
        body.includes(needle),
        `${platform}/phase 3 must include "${needle}"`,
      );
    }
  });

  test(`visual-qa-${platform}: page-prompt + analysis-prompt + report templates exist`, () => {
    for (const t of [
      "templates/page-prompt.md.hbs",
      "templates/analysis-prompt.md.hbs",
      "templates/report.md.hbs",
    ]) {
      // Cursor uses templates/agents/visual-qa-page.md.hbs instead of page-prompt
      if (platform === "cursor" && t === "templates/page-prompt.md.hbs") {
        assert.ok(
          existsSync(resolve(ROOT, "templates/agents/visual-qa-page.md.hbs")),
          `cursor: agents/visual-qa-page.md.hbs missing`,
        );
        continue;
      }
      assert.ok(
        existsSync(resolve(ROOT, t)),
        `${platform}: template missing: ${t}`,
      );
    }
  });

  test(`visual-qa-${platform}: porting-notes documents graduation`, () => {
    const body = readFileSync(resolve(ROOT, "references/porting-notes.md"), "utf-8");
    assert.match(body, /^## Graduation/m);
    assert.match(body, /6-phase/);
  });
}
