# Auto-detect Docker Runtime & Compose Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `agent-init` discovery so `detectProject(dir)` returns `{ stack, runtime, services }`, surfacing Docker runtime and compose services in `CLAUDE.md` and `.agent-init-state.json`.

**Architecture:** Add `detectProject` and a regex-based `parseComposeServices` helper to `lib/detect-stack.mjs`. Keep `detectStack` as a thin back-compat wrapper. Phase 1 spreads the new fields into the discovery context (plus a pre-joined `services_str` since the mustache-subset renderer has no `join` helper). `CLAUDE.md.hbs` gains an optional `(on docker: …)` clause.

**Tech Stack:** Node ESM, `node:fs`, `node:path`, `node:test`, regex-based compose parsing (no YAML dependency).

**Spec:** [`docs/superpowers/specs/2026-05-18-auto-detect-docker-stack-design.md`](../specs/2026-05-18-auto-detect-docker-stack-design.md)

---

## File Structure

| Path | Responsibility | Touched in |
|---|---|---|
| `plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs` | Detection logic: stack, runtime, compose services | Task 2, Task 3 |
| `plugins/harness-builder/skills/agent-init/phases/1-discover.md` | Step 2/3 code blocks + summary print | Task 4 |
| `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs` | Optional `(on docker: …)` clause | Task 5 |
| `plugins/harness-builder/skills/agent-init/SKILL.md` | lib doc line | Task 5 |
| `tests/fixtures/stacks/docker-only/` | Fixture: Dockerfile only | Task 1 |
| `tests/fixtures/stacks/node-ts-docker/` | Fixture: ts + Docker + compose w/ services | Task 1 |
| `tests/fixtures/stacks/python-compose-only/` | Fixture: python + compose.yaml | Task 1 |
| `tests/fixtures/stacks/python-requirements-only/` | Fixture: `requirements.txt` only | Task 1 |
| `tests/fixtures/stacks/dockerfile-bad-compose/` | Fixture: Dockerfile + malformed compose | Task 1 |
| `tests/lib/detect-stack.test.mjs` | Unit tests for `parseComposeServices` + `detectProject` (back-compat tests preserved) | Task 2, Task 3 |
| `tests/lib/render.test.mjs` | Add `ts-docker` snapshot fixture row | Task 6 |
| `tests/lib/__snapshots__/*.snap` | Generated snapshots for `ts-docker` × every template | Task 6 |
| `plugins/harness-builder/plugin.json` | Version bump `0.2.0` → `0.3.0` | Task 7 |
| `CHANGELOG.md`, `CHANGELOG.ko.md` | feat entry | Task 7 |

The test runner is Node's built-in `node:test`. Run individual files with `node --test tests/lib/detect-stack.test.mjs`. Run the whole suite with `node --test tests/`.

---

## Task 1: Add new fixture directories

**Files:**
- Create: `tests/fixtures/stacks/docker-only/Dockerfile`
- Create: `tests/fixtures/stacks/node-ts-docker/package.json`
- Create: `tests/fixtures/stacks/node-ts-docker/tsconfig.json`
- Create: `tests/fixtures/stacks/node-ts-docker/Dockerfile`
- Create: `tests/fixtures/stacks/node-ts-docker/docker-compose.yml`
- Create: `tests/fixtures/stacks/python-compose-only/pyproject.toml`
- Create: `tests/fixtures/stacks/python-compose-only/compose.yaml`
- Create: `tests/fixtures/stacks/python-requirements-only/requirements.txt`
- Create: `tests/fixtures/stacks/dockerfile-bad-compose/Dockerfile`
- Create: `tests/fixtures/stacks/dockerfile-bad-compose/docker-compose.yml`

- [ ] **Step 1: Create `docker-only/Dockerfile`**

```dockerfile
FROM alpine:3.19
CMD ["echo", "hi"]
```

- [ ] **Step 2: Create `node-ts-docker` fixture files**

`package.json`:
```json
{"name":"node-ts-docker","version":"0.0.0"}
```

`tsconfig.json`:
```json
{"compilerOptions":{"target":"ES2022"}}
```

`Dockerfile`:
```dockerfile
FROM node:20-alpine
CMD ["node","-e","1"]
```

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
  redis:
    image: redis:7
```

- [ ] **Step 3: Create `python-compose-only` fixture files**

`pyproject.toml`:
```toml
[project]
name = "python-compose-only"
version = "0.0.0"
```

`compose.yaml`:
```yaml
services:
  db:
    image: postgres:16
```

- [ ] **Step 4: Create `python-requirements-only/requirements.txt`**

```
requests==2.31.0
```

- [ ] **Step 5: Create `dockerfile-bad-compose` fixture files**

`Dockerfile`:
```dockerfile
FROM alpine
```

`docker-compose.yml` (intentionally non-standard — services exist but indentation is tab-based to provoke the parser fallback):
```yaml
version: "3"
services:
	postgres:
		image: postgres
```

(That file must contain literal tabs for indentation under `postgres:`. After creating, verify with `cat -A` that lines under `services:` start with `\t`.)

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/stacks/docker-only \
        tests/fixtures/stacks/node-ts-docker \
        tests/fixtures/stacks/python-compose-only \
        tests/fixtures/stacks/python-requirements-only \
        tests/fixtures/stacks/dockerfile-bad-compose
git commit -m "test(detect-stack): add fixtures for docker + compose detection"
```

---

## Task 2: TDD `parseComposeServices` helper

**Files:**
- Modify: `tests/lib/detect-stack.test.mjs` (add 4 parser tests + import)
- Modify: `plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs` (export `parseComposeServices`)

- [ ] **Step 1: Add failing tests at the top of the test file (after the existing imports)**

Edit `tests/lib/detect-stack.test.mjs`. Update the import line and append the parser tests. Replace:

```javascript
import { detectStack } from "../../plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs";
```

with:

```javascript
import {
  detectStack,
  parseComposeServices,
} from "../../plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs";
```

Append these tests at the end of the file:

```javascript
test("parseComposeServices: standard 2-space indent returns sorted keys", () => {
  const text = [
    "services:",
    "  redis:",
    "    image: redis:7",
    "  postgres:",
    "    image: postgres:16",
  ].join("\n");
  assert.deepEqual(parseComposeServices(text), ["postgres", "redis"]);
});

test("parseComposeServices: no services section returns []", () => {
  const text = "version: \"3\"\nnetworks:\n  default: {}\n";
  assert.deepEqual(parseComposeServices(text), []);
});

test("parseComposeServices: tolerates comments and blank lines", () => {
  const text = [
    "# top comment",
    "version: \"3\"",
    "",
    "services:",
    "  # leading comment",
    "  app:",
    "    image: myapp",
    "",
    "  worker:",
    "    image: myapp",
    "",
    "volumes:",
    "  data: {}",
  ].join("\n");
  assert.deepEqual(parseComposeServices(text), ["app", "worker"]);
});

test("parseComposeServices: tab-indented services falls back to []", () => {
  const text = "services:\n\tpostgres:\n\t\timage: postgres\n";
  assert.deepEqual(parseComposeServices(text), []);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: 4 new tests fail with `SyntaxError` or `ReferenceError` because `parseComposeServices` is not exported yet (import will fail). The existing 6 may also fail to run for the same reason — that is OK.

- [ ] **Step 3: Implement `parseComposeServices` in `lib/detect-stack.mjs`**

Open `plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs`. Add this function (do not remove anything else yet):

```javascript
export function parseComposeServices(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  // Find top-level `services:` line (column 0).
  while (i < lines.length && !/^services\s*:\s*$/.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++; // move past the `services:` line itself
  const out = [];
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === "" || /^\s*#/.test(raw)) continue;
    // A new top-level key at column 0 ends the services section.
    if (/^\S/.test(raw)) break;
    // Exactly two-space indent followed by a service name.
    const m = /^ {2}([A-Za-z0-9_.-]+)\s*:\s*$/.exec(raw);
    if (m) out.push(m[1]);
    // Lines deeper than 2 spaces (service body) are ignored.
    // Anything else (tabs, 4-space, etc.) is silently skipped.
  }
  return out.sort();
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: existing 6 tests still pass; 4 new parser tests pass. Total `pass 10`.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/detect-stack.test.mjs \
        plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs
git commit -m "feat(detect-stack): parseComposeServices regex helper"
```

---

## Task 3: TDD `detectProject` + back-compat wrapper

**Files:**
- Modify: `tests/lib/detect-stack.test.mjs` (add 7 `detectProject` tests + import)
- Modify: `plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs` (export `detectProject`, rewrite `detectStack` as wrapper)

- [ ] **Step 1: Add `detectProject` to the import and add failing tests**

Edit `tests/lib/detect-stack.test.mjs`. Replace the import block (modified in Task 2) with:

```javascript
import {
  detectStack,
  detectProject,
  parseComposeServices,
} from "../../plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs";
```

Append these 7 tests at the end of the file:

```javascript
test("detectProject: node-ts has no docker → runtime null", () => {
  assert.deepEqual(detectProject(fx("node-ts")),
    { stack: "typescript", runtime: null, services: [] });
});

test("detectProject: docker-only → stack unknown, runtime docker", () => {
  assert.deepEqual(detectProject(fx("docker-only")),
    { stack: "unknown", runtime: "docker", services: [] });
});

test("detectProject: node-ts-docker → services parsed and sorted", () => {
  assert.deepEqual(detectProject(fx("node-ts-docker")),
    { stack: "typescript", runtime: "docker", services: ["postgres", "redis"] });
});

test("detectProject: python-compose-only → compose.yaml is also detected", () => {
  assert.deepEqual(detectProject(fx("python-compose-only")),
    { stack: "python", runtime: "docker", services: ["db"] });
});

test("detectProject: python-requirements-only → minimal python project", () => {
  assert.deepEqual(detectProject(fx("python-requirements-only")),
    { stack: "python", runtime: null, services: [] });
});

test("detectProject: non-existent dir → all defaults", () => {
  assert.deepEqual(detectProject(fx("__nonexistent__")),
    { stack: "unknown", runtime: null, services: [] });
});

test("detectProject: Dockerfile + malformed compose → services []", () => {
  assert.deepEqual(detectProject(fx("dockerfile-bad-compose")),
    { stack: "unknown", runtime: "docker", services: [] });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: 7 new tests fail with `TypeError: detectProject is not a function` (or import error if `detectProject` not yet exported). Existing 10 still pass.

- [ ] **Step 3: Implement `detectProject` and rewrite `detectStack` as wrapper**

Open `plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs`. Replace the entire file content with:

```javascript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  { stack: "typescript", check: (d) => existsSync(join(d, "package.json")) && existsSync(join(d, "tsconfig.json")) },
  { stack: "javascript", check: (d) => existsSync(join(d, "package.json")) },
  { stack: "python",     check: (d) => existsSync(join(d, "pyproject.toml")) || existsSync(join(d, "requirements.txt")) || existsSync(join(d, "setup.py")) },
  { stack: "rust",       check: (d) => existsSync(join(d, "Cargo.toml")) },
  { stack: "go",         check: (d) => existsSync(join(d, "go.mod")) },
];

const COMPOSE_CANDIDATES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

function detectStackInner(projectDir) {
  for (const r of RULES) {
    if (r.check(projectDir)) return r.stack;
  }
  return "unknown";
}

function findComposeFile(projectDir) {
  for (const name of COMPOSE_CANDIDATES) {
    const p = join(projectDir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function parseComposeServices(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !/^services\s*:\s*$/.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++;
  const out = [];
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === "" || /^\s*#/.test(raw)) continue;
    if (/^\S/.test(raw)) break;
    const m = /^ {2}([A-Za-z0-9_.-]+)\s*:\s*$/.exec(raw);
    if (m) out.push(m[1]);
  }
  return out.sort();
}

export function detectProject(projectDir) {
  if (!existsSync(projectDir)) {
    return { stack: "unknown", runtime: null, services: [] };
  }
  const stack = detectStackInner(projectDir);
  const composePath = findComposeFile(projectDir);
  const hasDockerfile = existsSync(join(projectDir, "Dockerfile"));
  const runtime = (hasDockerfile || composePath) ? "docker" : null;
  let services = [];
  if (composePath) {
    try {
      services = parseComposeServices(readFileSync(composePath, "utf-8"));
    } catch {
      services = [];
    }
  }
  return { stack, runtime, services };
}

export function detectStack(projectDir) {
  return detectProject(projectDir).stack;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: all 17 tests pass (6 back-compat + 4 parser + 7 detectProject).

- [ ] **Step 5: Commit**

```bash
git add tests/lib/detect-stack.test.mjs \
        plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs
git commit -m "feat(detect-stack): detectProject() returns { stack, runtime, services }"
```

---

## Task 4: Update Phase 1 doc

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/phases/1-discover.md`

- [ ] **Step 1: Update Step 2 wording**

Open `plugins/harness-builder/skills/agent-init/phases/1-discover.md`. Find the line:

```
2. Run `detectStack(cwd)` from `lib/detect-stack.mjs`. Stash result.
```

Replace with:

```
2. Run `detectProject(cwd)` from `lib/detect-stack.mjs`. It returns `{ stack, runtime, services }`. Stash result.
```

- [ ] **Step 2: Replace the Step 3 code block**

In the same file, find the code block that begins with `const ctx = {` and ends at the closing `};`. Replace the entire block with:

```javascript
   const detected = detectProject(cwd);   // { stack, runtime, services }
   const ctx = {
     purpose: "...",                 // from brainstorming
     size: "medium",                 // from brainstorming or --size
     qa_personas: ["auth"],          // from brainstorming or --qa
     deploy_targets: "vercel",       // from brainstorming
     constraints: "",                // from brainstorming
     ...detected,                    // stack, runtime, services
     services_str: detected.services.join(", "), // pre-joined for template
   };
```

- [ ] **Step 3: Update the end-of-phase summary instructions**

Find the line that begins with `Print a 3-line summary`. Replace the surrounding paragraph with:

```
Print a summary and ask "proceed to Phase 2?" unless `--yes` was passed:

- Line 1: `detected stack: <stack>`
- Line 2 (skip if `runtime` is null): `runtime: <runtime>` followed by ` (services: <joined>)` only when `services` is non-empty
- Line 3: `chosen size: <size> / QA: <qa_personas joined>`
```

- [ ] **Step 4: Verify the file still mentions only `detectProject` (not stale `detectStack`)**

Run: `grep -n "detectStack\|detectProject" plugins/harness-builder/skills/agent-init/phases/1-discover.md`
Expected: every match references `detectProject`. (The `detectStack` symbol is no longer documented here — it remains in the codebase only as a back-compat wrapper.)

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/phases/1-discover.md
git commit -m "docs(agent-init): Phase 1 uses detectProject(); document runtime + services"
```

---

## Task 5: Update CLAUDE.md template & SKILL.md doc

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs` (line 7)
- Modify: `plugins/harness-builder/skills/agent-init/SKILL.md` (lib doc line)

- [ ] **Step 1: Update the template stack line**

Open `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs`. Find line 7:

```handlebars
{{stack}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}
```

Replace with:

```handlebars
{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}
```

- [ ] **Step 2: Update SKILL.md doc line**

Open `plugins/harness-builder/skills/agent-init/SKILL.md`. Find the line that documents `lib/detect-stack.mjs`:

```
- `lib/detect-stack.mjs` — `detectStack(projectDir)`
```

Replace with:

```
- `lib/detect-stack.mjs` — `detectProject(projectDir)` → `{ stack, runtime, services }` (`detectStack(projectDir)` kept as a back-compat wrapper returning the stack string)
```

- [ ] **Step 3: Run unit tests to confirm nothing else broke**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: all 17 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs \
        plugins/harness-builder/skills/agent-init/SKILL.md
git commit -m "feat(agent-init): surface docker runtime + services in CLAUDE.md template"
```

---

## Task 6: Add `ts-docker` snapshot fixture row

**Files:**
- Modify: `tests/lib/render.test.mjs` (add one fixture row)
- Generated: `tests/lib/__snapshots__/*ts-docker*.snap` (auto-written on first run)

The existing snapshot test in `render.test.mjs` iterates over a `FIXTURES` array. Adding one row generates snapshots for every template × the new fixture. Snapshots are auto-written when the file is missing, so the first run creates them; subsequent runs assert equality.

- [ ] **Step 1: Add the fixture row**

Open `tests/lib/render.test.mjs`. Inside the `FIXTURES` array, append after the `floor-theme` row (before the closing `];`):

```javascript
  { tag: "ts-docker", ctx: { purpose: "Docker-based service", stack: "typescript", deploy_targets: "fly.io", runtime: "docker", services: ["postgres", "redis"], services_str: "postgres, redis", agents: [{name:"planner",when:"plan"},{name:"backend-dev",when:"server"},{name:"reviewer",when:"review"}], constraints: "", floorTheme: false } },
```

- [ ] **Step 2: Run snapshot tests to generate the new snapshots**

Run: `node --test tests/lib/render.test.mjs`
Expected: tests pass; new `*.snap` files appear under `tests/lib/__snapshots__/` with the `ts-docker` tag.

- [ ] **Step 3: Spot-check the CLAUDE.md snapshot for the new fixture**

Inspect: `tests/lib/__snapshots__/CLAUDE.md.hbs__ts-docker.snap`
Expected to contain a line like:
```
typescript (on docker: postgres, redis) — deploys to fly.io
```

If the line is wrong, fix the template (Task 5 Step 1) and re-run with `UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs` to regenerate.

- [ ] **Step 4: Re-run the entire `tests/lib/` suite to make sure no other snapshot drifted**

Run: `node --test tests/lib/`
Expected: all tests pass with no snapshot mismatches.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/render.test.mjs tests/lib/__snapshots__/
git commit -m "test(snapshot): add ts-docker fixture covering runtime + services rendering"
```

---

## Task 7: Version bump + CHANGELOG

**Files:**
- Modify: `plugins/harness-builder/plugin.json` (version `0.2.0` → `0.3.0`)
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.ko.md`

- [ ] **Step 1: Bump `plugin.json` version**

Open `plugins/harness-builder/plugin.json`. Change:

```json
"version": "0.2.0",
```

to:

```json
"version": "0.3.0",
```

- [ ] **Step 2: Prepend a new entry to `CHANGELOG.md`**

Open `CHANGELOG.md`. Find the most recent version heading (likely `## 0.2.x` or similar) and insert a new section above it:

```markdown
## harness-builder 0.3.0 — 2026-05-18

### Added
- `detectProject(dir)` in `lib/detect-stack.mjs` returns `{ stack, runtime, services }`. Detects Docker runtime via `Dockerfile` or any `docker-compose.yml` / `compose.yaml` variant, and extracts top-level `services:` keys from compose YAML (regex parser, sorted).
- New fixtures: `docker-only`, `node-ts-docker`, `python-compose-only`, `python-requirements-only`, `dockerfile-bad-compose`.
- `CLAUDE.md` template now renders `(on docker: postgres, redis)` when runtime/services are present.

### Changed
- Phase 1 of `/agent-init` calls `detectProject` and spreads the result into the discovery context. Adds a pre-joined `services_str` for the template.

### Preserved
- `detectStack(dir)` remains as a thin back-compat wrapper returning the stack string. No callers were impacted.
```

- [ ] **Step 3: Mirror the entry in `CHANGELOG.ko.md`**

Open `CHANGELOG.ko.md`. Insert the same section structure, translated:

```markdown
## harness-builder 0.3.0 — 2026-05-18

### 추가됨
- `lib/detect-stack.mjs`에 `detectProject(dir)` 추가 — `{ stack, runtime, services }` 반환. `Dockerfile` 또는 `docker-compose.yml`/`compose.yaml` 계열을 감지하여 `runtime: "docker"`을 설정하고, compose YAML의 최상위 `services:` 키를 정렬된 배열로 추출(정규식 파서).
- 신규 픽스처: `docker-only`, `node-ts-docker`, `python-compose-only`, `python-requirements-only`, `dockerfile-bad-compose`.
- `CLAUDE.md` 템플릿이 runtime/services가 있을 때 `(on docker: postgres, redis)` 형식으로 렌더링.

### 변경됨
- `/agent-init`의 Phase 1이 `detectProject`를 호출하고 결과를 discovery 컨텍스트에 spread. 템플릿용 사전 조인 문자열 `services_str` 추가.

### 유지됨
- `detectStack(dir)`는 stack 문자열을 반환하는 후방호환 wrapper로 유지. 기존 호출부에 영향 없음.
```

- [ ] **Step 4: Final full test run**

Run: `node --test tests/`
Expected: every test file passes. No snapshot mismatches.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder/plugin.json CHANGELOG.md CHANGELOG.ko.md
git commit -m "chore(harness-builder): bump 0.3.0 — Docker runtime + compose services detection"
```

---

## Self-Review Notes

- **Spec coverage:**
  - API shape `{ stack, runtime, services }` → Task 3.
  - Compose parser → Task 2.
  - `detectStack` back-compat wrapper → Task 3.
  - Phase 1 ctx update + `services_str` → Task 4.
  - CLAUDE.md template `(on docker: …)` → Task 5.
  - SKILL.md doc line → Task 5.
  - Five new fixtures (incl. `python-requirements-only` for the "empty Python" case the user called out) → Task 1.
  - 7 detectProject tests + 4 parser tests → Tasks 2 + 3.
  - Snapshot coverage → Task 6.
  - Version bump + CHANGELOG (EN + KO) → Task 7.
- **Placeholder scan:** no TBDs, no "implement later", every step has concrete code/commands.
- **Type consistency:** `detectProject` returns the same shape in every reference; `services_str` is consistently produced in Phase 1 (Task 4) and consumed by the template (Task 5).
