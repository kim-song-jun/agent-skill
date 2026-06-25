# Harness Routing Front Door (`/harness`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. The Release phase (Task 7) is controller-executed, not a subagent task.

**Goal:** Add `/harness` — an optional Claude-first front door that classifies free-form intent and routes (via an AskUserQuestion confirm) to the right skill — plus an orchestration-patterns doc, full docs update (README + CHANGELOG ×2 langs, incl back-documenting the shipped evolution-loop feature), and a release.

**Architecture:** New skill `plugins/harness-floor/skills/harness/` with a pure testable `lib/routing-map.mjs` (ROUTING_TABLE + rankRoutes) consumed by a markdown SKILL.md that presents a native AskUserQuestion decision and invokes the chosen Skill on confirm. Lives in the existing harness-floor plugin (no new plugin → pluginCount stays 19). Claude-first; other-runtime ports are a follow-up (selective-port precedent).

**Tech Stack:** Node ESM (`.mjs`), Node built-ins only, `node:test` + `node:assert/strict`. Markdown skills (model-driven). No new dependencies, no root package.json.

## Global Constraints

- ESM only, Node built-ins only, no new deps. Tests: `node --test <file>`, node:test + node:assert/strict, mkdtemp isolation where files are involved.
- `/harness` lives in `plugins/harness-floor/skills/harness/` (existing plugin; skills auto-discovered — no plugin.json skill-list edit). NOT a new plugin → `marketplace.json` pluginCount stays 19; `release-smoke.sh` `pluginCount: 19` assertion must stay green.
- Routing is ADVISORY: classify → AskUserQuestion confirm → invoke chosen Skill. Never silent auto-route. Topology (orchestration-patterns) stays fixed — documentation only, not selectable.
- Claude-first; do NOT create per-runtime ports in this plan (follow-up).
- Shared-tree git safety (rules 6-10): pathspec commits, no `git add -A`/stash/reset/branch.
- Routing targets (the locked set): `/agent-init`, `/agent-all`, `/debug`, `/explore`, `/thrift`, `/wiki`, `/visual-qa`, `/data-runner`, `/agent-handoff` (kind "skill"), `Workflow` (kind "tool").
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `plugins/harness-floor/skills/harness/lib/routing-map.mjs` | Create | `ROUTING_TABLE` + `rankRoutes(intent)` (pure) |
| `tests/lib/routing-map.test.mjs` | Create | rankRoutes behavior + target-coverage contract |
| `plugins/harness-floor/skills/harness/SKILL.md` | Create | `/harness` front-door behavior (confirm-before-invoke) |
| `plugins/harness-floor/skills/harness/references/routing-map.md` | Create | human-readable N-way routing table |
| `tests/agent-all/harness-skill-contract.test.mjs` | Create | SKILL.md + routing-map.md ↔ routing-map.mjs consistency |
| `plugins/harness-floor/skills/agent-all/references/orchestration-patterns.md` | Create | names patterns agent-all embodies (#4) |
| `README.md` | Modify | add `/harness` to quick block + detail section; back-document evolution-loop |
| `CHANGELOG.md`, `CHANGELOG.ko.md` | Modify | new version entry: evolution-loop + `/harness` |
| `plugins/harness-floor/.claude-plugin/plugin.json` | Modify | version bump (release phase) |

---

### Task 1: `routing-map.mjs` — ROUTING_TABLE + rankRoutes

**Files:**
- Create: `plugins/harness-floor/skills/harness/lib/routing-map.mjs`
- Test: `tests/lib/routing-map.test.mjs`

**Interfaces:**
- Produces: `ROUTING_TABLE` (array of `{target, kind, when, signals}`); `rankRoutes(intent)` → `[{target, kind, when, score}]` sorted by score desc (stable; ties keep table order).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lib/routing-map.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTING_TABLE, rankRoutes } from "../../plugins/harness-floor/skills/harness/lib/routing-map.mjs";

const top = (intent) => rankRoutes(intent)[0];

test("routes representative intents to the right target", () => {
  assert.equal(top("debug the failing flaky test").target, "/debug");
  assert.equal(top("this run costs too much, tighten the budget").target, "/thrift");
  assert.equal(top("screenshot the dashboard ui for visual regression").target, "/visual-qa");
  assert.equal(top("set up the harness on a new project").target, "/agent-init");
  assert.equal(top("implement the feature and ship a pr").target, "/agent-all");
  assert.equal(top("audit all the configs and write a research report").target, "Workflow");
  assert.equal(top("map the codebase, where is Foo defined").target, "/explore");
  assert.equal(top("write this decision to the project wiki knowledge base").target, "/wiki");
});

test("empty/garbage intent yields all-zero scores (skill then clarifies)", () => {
  const ranked = rankRoutes("");
  assert.ok(ranked.every((r) => r.score === 0));
  assert.equal(rankRoutes("xyzzy qwerty").every((r) => r.score === 0), true);
});

test("coverage contract: every supported target is in the table", () => {
  const targets = new Set(ROUTING_TABLE.map((r) => r.target));
  for (const t of ["/agent-init","/agent-all","/debug","/explore","/thrift","/wiki","/visual-qa","/data-runner","/agent-handoff","Workflow"]) {
    assert.ok(targets.has(t), `routing table must cover ${t}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/routing-map.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

```javascript
// plugins/harness-floor/skills/harness/lib/routing-map.mjs
// Front-door routing data + deterministic scorer for /harness.
// rankRoutes is a SEED for the model; the skill refines with judgment and always confirms via AskUserQuestion.

export const ROUTING_TABLE = [
  { target: "/agent-init",    kind: "skill", when: "start a new project / adopt the harness on a repo",        signals: ["init", "scaffold", "set up", "new project", "adopt", "onboard", "bootstrap"] },
  { target: "/agent-all",     kind: "skill", when: "ship a feature or bugfix as a gated PR",                   signals: ["feature", "implement", "build the", "ship", "pr", "add ", "bugfix"] },
  { target: "/debug",         kind: "skill", when: "investigate a failing command / flaky test / regression",  signals: ["debug", "failing", "flaky", "regression", "crash", "stack trace", "why does"] },
  { target: "/explore",       kind: "skill", when: "map / understand the codebase",                            signals: ["explore", "map the", "understand", "where is", "architecture", "overview", "codebase"] },
  { target: "/thrift",        kind: "skill", when: "control cost / manage a long session's context",           signals: ["cost", "budget", "token", "long session", "context window", "expensive", "summarize session"] },
  { target: "/wiki",          kind: "skill", when: "read/write/compile durable project knowledge",             signals: ["wiki", "knowledge base", "document this", "decision log", "project notes"] },
  { target: "/visual-qa",     kind: "skill", when: "capture screenshots / visual regression of a UI",          signals: ["screenshot", "visual", " ui", "browser", "playwright", "design review"] },
  { target: "/data-runner",   kind: "skill", when: "verify notebooks / SQL / ETL / dataset artifacts",         signals: ["notebook", "sql", "etl", "csv", "parquet", "dataset", "data pipeline", "metrics"] },
  { target: "/agent-handoff", kind: "skill", when: "hand off an in-progress /agent-all task to a new session", signals: ["handoff", "hand off", "new session", "resume the task", "dispatch task"] },
  { target: "Workflow",       kind: "tool",  when: "breadth-first evidence: audit/fact-check/research report",  signals: ["audit", "research", "fact-check", "review many", "map-reduce", "report", "findings", "investigate across"] },
];

export function rankRoutes(intent) {
  const text = String(intent ?? "").toLowerCase();
  return ROUTING_TABLE
    .map((route) => ({
      target: route.target,
      kind: route.kind,
      when: route.when,
      score: route.signals.reduce((n, sig) => n + (text.includes(sig) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score); // Array.prototype.sort is stable in Node → ties keep ROUTING_TABLE order
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/routing-map.test.mjs`
Expected: PASS (3 tests). If any intent mis-ranks, adjust that route's `signals` to include the discriminating phrase (the test intents are the contract; keep them and fix signals).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/harness/lib/routing-map.mjs tests/lib/routing-map.test.mjs
git commit -m "feat(harness): routing-map — ROUTING_TABLE + rankRoutes scorer"
```

---

### Task 2: `/harness` SKILL.md + human routing doc + contract test

**Files:**
- Create: `plugins/harness-floor/skills/harness/SKILL.md`
- Create: `plugins/harness-floor/skills/harness/references/routing-map.md`
- Test: `tests/agent-all/harness-skill-contract.test.mjs`

**Interfaces:**
- Consumes: `routing-map.mjs` (`ROUTING_TABLE`, `rankRoutes`) from Task 1.

- [ ] **Step 1: Write the failing contract test**

```javascript
// tests/agent-all/harness-skill-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTING_TABLE } from "../../plugins/harness-floor/skills/harness/lib/routing-map.mjs";

const skill = readFileSync(resolve("plugins/harness-floor/skills/harness/SKILL.md"), "utf-8");
const doc = readFileSync(resolve("plugins/harness-floor/skills/harness/references/routing-map.md"), "utf-8");

test("SKILL.md has frontmatter name harness and documents confirm-before-invoke", () => {
  assert.match(skill, /^---\nname: harness\n/);
  assert.match(skill, /AskUserQuestion/);
  assert.match(skill, /confirm/i);
  assert.match(skill, /rankRoutes/);
});

test("SKILL.md never claims silent auto-routing", () => {
  assert.doesNotMatch(skill, /auto-?invoke without|automatically run/i);
});

test("routing-map.md lists every ROUTING_TABLE target (human doc ↔ data parity)", () => {
  for (const route of ROUTING_TABLE) {
    assert.ok(doc.includes(route.target), `routing-map.md must list ${route.target}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/harness-skill-contract.test.mjs`
Expected: FAIL — SKILL.md / routing-map.md do not exist.

- [ ] **Step 3: Create `SKILL.md`**

```markdown
---
name: harness
description: Use when you are not sure which harness skill to run — describe your intent in plain language and /harness routes you to the right one (/agent-init, /agent-all, /debug, /explore, /thrift, /wiki, /visual-qa, /data-runner, /agent-handoff) or the built-in Workflow tool, via a confirm-first AskUserQuestion. Optional front door; direct skill invocation still works.
---

# /harness

The optional front door. You describe what you want in plain language; `/harness`
recommends the right skill and routes you there after you confirm. It never runs
work itself and never auto-routes silently.

## Usage

```
/harness "auth login is failing intermittently"
/harness "set up the harness on this repo"
/harness "ship the new export button as a PR"
```

## How it routes

1. Read the free-form intent (the argument).
2. Seed candidates with `rankRoutes(intent)` from `lib/routing-map.mjs`, then refine
   with judgment against the routing table in `references/routing-map.md`.
3. Present an **AskUserQuestion** decision: the recommended target first, plus 2-3
   alternatives, each labeled with its one-line "when". This is the repo's
   Decision-Surfacing Protocol — the user always confirms.
4. On the user's choice:
   - **kind "skill"** (e.g. `/agent-all`): invoke that Skill, passing the original intent.
   - **kind "tool"** (`Workflow`): it is the built-in Workflow tool, not a skill — do not
     invoke it as a skill; explain it is the right orchestrator for breadth-first
     evidence and how to run it (see agent-all `references/orchestrator-routing.md`).
   - **top score 0 or genuinely ambiguous**: ask ONE clarifying question first, then re-rank.
5. Never auto-run a high-risk target (a `/agent-all` PR run) without an explicit confirm.

## Non-goals

- Not a replacement for direct skill invocation — `/agent-all` etc. stay first-class.
- Not an executor — it routes and hands off.
- Claude-first; other-runtime ports are a follow-up.
```

- [ ] **Step 4: Create `references/routing-map.md`** (human-readable; must list every target)

```markdown
# Routing map — which skill for which intent

`/harness` uses this table (mirrored in `lib/routing-map.mjs`) to route free-form intent.
Direct invocation of any skill below still works; `/harness` is the optional front door.

| Intent | Route | Why |
|--------|-------|-----|
| Start a new project / adopt the harness | `/agent-init` | bootstrap memory, role agents, hooks |
| Ship a feature or bugfix as a gated PR | `/agent-all` | full intent→plan→implement→review→PR pipeline |
| A failing command / flaky test / regression | `/debug` | reproduce → bisect → hypothesis evidence |
| Map / understand the codebase | `/explore` | parallel codebase map + O(1) symbol lookup |
| Control cost / long-session context | `/thrift` | auto-summary + audit for affordable long runs |
| Read/write/compile project knowledge | `/wiki` | structured `.wiki/` knowledge base |
| Screenshots / visual regression of a UI | `/visual-qa` | browser capture + LLM design review |
| Verify notebooks / SQL / ETL / datasets | `/data-runner` | data-analysis verification |
| Hand off an in-progress task to a new session | `/agent-handoff` | durable handoff + session prompt |
| Breadth-first evidence: audit / research / report | built-in `Workflow` tool | fan-out evidence, not a durable code change |

Rule of thumb: a **durable, gated code change shipped as a PR** → `/agent-all`.
**Findings / specs / answers** → the built-in `Workflow` tool (see agent-all
`references/orchestrator-routing.md`).
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/agent-all/harness-skill-contract.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add plugins/harness-floor/skills/harness/SKILL.md plugins/harness-floor/skills/harness/references/routing-map.md tests/agent-all/harness-skill-contract.test.mjs
git commit -m "feat(harness): /harness front-door skill + human routing map + contract"
```

---

### Task 3: `orchestration-patterns.md` (#4)

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/references/orchestration-patterns.md`
- Test: `tests/agent-all/orchestration-patterns-contract.test.mjs`

- [ ] **Step 1: Write the failing contract test**

```javascript
// tests/agent-all/orchestration-patterns-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const doc = readFileSync(resolve("plugins/harness-floor/skills/agent-all/references/orchestration-patterns.md"), "utf-8");

test("names the patterns agent-all embodies and states the topology is fixed", () => {
  for (const pat of ["fan-out", "generate-verify", "supervisor", "pipeline"]) {
    assert.ok(doc.toLowerCase().includes(pat), `must name the ${pat} pattern`);
  }
  assert.match(doc, /not (selectable|configurable)/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/orchestration-patterns-contract.test.mjs`
Expected: FAIL — doc does not exist.

- [ ] **Step 3: Create the doc**

```markdown
# Orchestration patterns agent-all embodies

`/agent-all` is one opinionated pipeline. It already embodies several named
multi-agent patterns — this doc makes them legible so the design can be reasoned
about. **The topology is fixed by design; it is NOT selectable or configurable** —
a single enforced shape is what makes verification-independence and audit gates
hold (offering a menu would multiply the test matrix and weaken the guarantees).

| Pattern | Where in agent-all |
|---------|--------------------|
| **Pipeline** | the whole run: intent → plan → dispatch → gate → PR → loop |
| **Fan-out / fan-in** | Phase 3 dispatches implementer subagents per wave task (3a scope / 3b ask / 3c implement) and joins |
| **Generate-verify** | Phase 4 runs spec-reviewer + quality-reviewer + an adversarial judge over the generated change |
| **Supervisor split** | `references/orchestrator-routing.md` routes between `/agent-all` and the built-in `Workflow` tool by deliverable |

For the front-door router across all skills (not just within agent-all), see the
`harness` skill's `references/routing-map.md`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/orchestration-patterns-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/references/orchestration-patterns.md tests/agent-all/orchestration-patterns-contract.test.mjs
git commit -m "docs(agent-all): name the orchestration patterns it embodies (topology stays fixed)"
```

---

### Task 4: README — add `/harness` + back-document the evolution loop

**Files:**
- Modify: `README.md`

**Context:** README has (a) a quick-reference command block near the top (the lines with `/agent-init`, `/agent-all`, `/visual-qa`, `/thrift`, `/explore`, `/debug`) and (b) per-command detail sections (`### \`/agent-all\` — ship a feature`, etc.). Add `/harness` to BOTH, and add a short note documenting the evolution-loop feature (run-record/v1 + the `/agent-init` prior-run panel + record-then-reverify eval) which shipped but is undocumented.

- [ ] **Step 1: Add `/harness` to the quick-reference block**

After the `/debug` line in the top quick block, add:
```
/harness "not sure which to run"            # front door: describe intent → routes you to the right skill
```

- [ ] **Step 2: Add a `/harness` detail section**

After the `/agent-all` detail section (before `/visual-qa`), add a `### \`/harness\` — the front door` section: 2-3 sentences (optional router; describe intent → AskUserQuestion confirm → routes to the right skill or the Workflow tool; direct invocation still works) and the three usage examples from the SKILL.md.

- [ ] **Step 3: Back-document the evolution loop**

In the section that describes `/agent-init` scaffolding and/or `/agent-all` outputs, add a short paragraph: `/agent-all` runs now emit a `run-record/v1` to `.agent-skill/runs/records/`, and `/agent-init` surfaces an advisory "recent runs" panel (roster/profile/cost suggestions) derived from them; the skill-utility eval gained a record-then-reverify `--record` mode. Keep it to ~4 sentences.

- [ ] **Step 4: Verify README-related contracts still pass**

Run: `node --test tests/lib/release-doc-contract.test.mjs tests/lib/release-command-surface.test.mjs`
Expected: PASS. If either contract enumerates skills and now fails because `/harness` is missing somewhere it checks, add `/harness` to that location (the contract is the source of truth for where skills must be listed).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): add /harness front door + back-document the evolution loop"
```

---

### Task 5: CHANGELOG (both languages) — new version entry

**Files:**
- Modify: `CHANGELOG.md`, `CHANGELOG.ko.md`

**Context:** Both files open with `## Unreleased` then `## Agent-skill v0.7.10 — 2026-06-24`. Insert a NEW `## Agent-skill v0.7.11 — 2026-06-26` section directly under `## Unreleased` (above v0.7.10), in BOTH files, covering BOTH shipped features: (1) the evolution loop / measurable self-improvement, (2) `/harness` + orchestration-patterns doc.

- [ ] **Step 1: Add the English entry to `CHANGELOG.md`**

Under `## Unreleased`, insert:
```markdown
## Agent-skill v0.7.11 — 2026-06-26

### Measurable self-improvement — run-record evolution loop + `/harness` front door

- **`run-record/v1` evolution loop** — `/agent-all` runs emit one atomic per-run record to `.agent-skill/runs/records/`; `/agent-init` Phase 1 surfaces an advisory "recent runs" panel (roster / profile / cost suggestions) derived from them via `derive-priors`. Per-repo, advisory, user-gated.
- **Record-then-reverify eval** — executable eval fixtures (`taskPrompt` + `checkerCmd`) and a `--record` mode; hardcoded fixture-constant assertions retired for structural/relational ones.
- **Multi-session hook hardening** — context-mode-router routing-state write is atomic (tmp+rename); session-summary uses an atomic exclusive-create header (kills a TOCTOU). Both gained main-guards.
- **`/harness` front door** — describe intent in plain language; `/harness` routes you (confirm-first AskUserQuestion) to the right skill or the built-in Workflow tool. Optional; direct invocation still works.
- **`orchestration-patterns.md`** — names the patterns `/agent-all` embodies (pipeline / fan-out-fan-in / generate-verify / supervisor); topology stays fixed by design.
```

- [ ] **Step 2: Add the Korean entry to `CHANGELOG.ko.md`**

Under `## 미출시`, insert the parallel Korean section `## Agent-skill v0.7.11 — 2026-06-26` with `### 측정 가능한 자기개선 — run-record 진화 루프 + /harness 프론트도어` and the same 5 bullets translated.

- [ ] **Step 3: Verify the changelog contract**

Run: `node --test tests/lib/release-doc-contract.test.mjs`
Expected: PASS (it checks CHANGELOG structure/parity between the two languages — if it requires matching version headers, both files now have v0.7.11).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CHANGELOG.ko.md
git commit -m "docs(changelog): v0.7.11 — evolution loop + /harness (en + ko)"
```

---

### Task 6 (controller-executed): version bump + release + push

Not a subagent task — the controller runs this with full verification because it is release-contract-sensitive and outward-facing.

- [ ] Bump `plugins/harness-floor/.claude-plugin/plugin.json` version `0.7.10` → `0.7.11` (and any sibling manifest the release process requires — verify against `release-candidate.test.mjs` / `cross-platform-manifest.test.mjs` which assert version consistency).
- [ ] Run `bash scripts/release-smoke.sh --fast`; it asserts `pluginCount: 19` (unchanged — no new plugin) and a focused-contract test count. **Adding test files (routing-map, harness-skill-contract, orchestration-patterns-contract) changes counts**: update `tests/lib/release-smoke-script.test.mjs` expected `tests`/`pass` numbers to the new focused count IF any added test file is in the focused list in `scripts/release-smoke.sh`, and update the focused-list itself only if the release process expects new contract tests there.
- [ ] Create the release-candidate record if the process produces one under `.agent-skill/releases/` (follow `release-candidate.test.mjs`).
- [ ] Run the FULL `node --test` from repo root → 0 fail (controller-verified, not via a narrow glob).
- [ ] `git push origin main`.

---

## Self-Review

**1. Spec coverage:** routing-map (§4A) → Task 1. `/harness` skill behavior (§4B) → Task 2. human routing doc (§4C) → Task 2. orchestration-patterns (§4D, #4) → Task 3. docs update (§5) → Tasks 4-5 (README + CHANGELOG both langs, incl back-documenting evolution loop). Release (§9.6) → Task 6. Claude-first (decision #4) → no port tasks. Confirm-before-invoke (decision #3) → Task 2 SKILL.md + contract. ✓

**2. Placeholder scan:** No TBD/TODO. Task 4/5 give exact insertion points + exact text; Task 6 names the exact files/assertions to update.

**3. Type consistency:** `ROUTING_TABLE` / `rankRoutes` shape identical in Task 1 (def), Task 2 contract test (imports ROUTING_TABLE), and the SKILL.md (references rankRoutes). Target set identical across routing-map.mjs, the coverage test, routing-map.md, and Global Constraints.
