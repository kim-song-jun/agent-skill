// Honest-downgrade contract for the Gemini agent-all port (2026-06-22 adversarial
// round, defects #2 + #3): the Gemini port must NOT advertise capabilities it
// does not wire. adversarialVerify is off by default and the gate plan its config
// produces must not dispatch verification-reviewer-adversarial; --resume and the
// memory checkpoint recall are documented as unsupported (gemini-init installs no
// lib tree, so those CC/Codex/Copilot/Cursor features cannot run here).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../../plugins/harness-floor-gemini/bin/lib/render.mjs";
import { buildGatePlan } from "../../plugins/harness-floor-gemini/skills/agent-all-gemini/lib/gate-plan.mjs";

const G = (rel) => resolve("plugins/harness-floor-gemini/skills/agent-all-gemini", rel);
const read = (rel) => readFileSync(G(rel), "utf-8");
const renderCfg = () =>
  JSON.parse(
    render(read("templates/agent-all.config.json.hbs"), {
      language: "auto",
      maxIter: 10,
      maxCostUSD: 5,
      waveSize: "medium",
      breakCondition: "npm test",
    }),
  );

test("gemini honest downgrade: config gates set adversarialVerify:false explicitly", () => {
  const cfg = renderCfg();
  assert.equal(
    cfg.gates.adversarialVerify,
    false,
    "gemini config must set adversarialVerify:false — an absent key falls through to DEFAULT_GATES.adversarialVerify=true, falsely advertising an unwired gate",
  );
});

test("gemini honest downgrade: default gate plan does NOT dispatch verification-reviewer-adversarial", () => {
  const cfg = renderCfg();
  const plan = buildGatePlan({
    gates: cfg.gates,
    orchestration: { requiredAgents: [] },
    changedFiles: [],
    diffText: "",
  });
  const roles = (plan.dispatches || []).map((d) => d.role);
  assert.ok(
    !roles.includes("verification-reviewer-adversarial"),
    `gemini default gate plan must not dispatch the adversarial reviewer; got roles ${JSON.stringify(roles)}`,
  );
});

test("gemini honest downgrade: 4-gate.md documents the adversarial gate is unsupported", () => {
  const gate = read("phases/4-gate.md");
  assert.match(
    gate,
    /Adversarial verification is not supported on the Gemini port/,
    "gemini 4-gate.md must state adversarial verification is unsupported on this port",
  );
  assert.match(
    gate,
    /does NOT copy the `lib\//,
    "gemini 4-gate.md must disclose that gemini-init copies no lib tree (snippets are reference logic, not runnable)",
  );
  // The note must reconcile the sibling "vendored — use it" phrasing so the doc
  // set does not contradict itself about lib runnability (adversarial residual).
  assert.match(
    gate,
    /follow its logic, not execute it/,
    "gemini 4-gate.md note must reconcile the sibling 'vendored — use it' phrasing (follow logic, not execute from project cwd)",
  );
  assert.doesNotMatch(
    gate,
    /\(gate-plan, task-ledger, memory\)/,
    "gemini 4-gate.md must not list a non-existent 'memory' module as a reference-logic snippet",
  );
});

test("gemini honest downgrade: SKILL.md discloses /agent-handoff is not bundled on this port", () => {
  const skill = read("SKILL.md");
  assert.match(
    skill,
    /`\/agent-handoff` skill is not bundled on the Gemini port/,
    "gemini SKILL.md must disclose that /agent-handoff is not bundled here, so --resume only surfaces externally-produced handoff artifacts",
  );
});

test("gemini honest downgrade: 0-preflight.md documents the --resume limitation", () => {
  const pre = read("phases/0-preflight.md");
  assert.match(
    pre,
    /does NOT restore in-flight wave checkpoints/,
    "gemini 0-preflight must document that --resume does not restore in-flight checkpoints/handoff (memory recall is not installed on this port)",
  );
});
