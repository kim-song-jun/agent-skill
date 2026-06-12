# Auto-detect Docker runtime and compose services (agent-init)

**Date:** 2026-05-18
**Status:** Draft (awaiting user review)
**Scope:** `plugins/harness-builder/skills/agent-init` only

## Problem

`agent-init` Phase 1 currently calls `detectStack(dir)` which returns a single
string from `{typescript, javascript, python, rust, go, unknown}`. The detector
has no awareness of Docker or compose, so projects whose primary runtime is a
container (the common case in Dockerized setups) lose that information when
`CLAUDE.md` and `.agent-init-state.json` are written. The brainstorming step
asks the user for `deploy_targets` as free text but never captures the runtime
layer underneath.

## Goal

Extend automatic discovery in `agent-init` so that:

1. Container runtime (Docker) is detected from project files.
2. `docker-compose` services (e.g., `postgres`, `redis`) are extracted as a
   sorted list when a compose file exists.
3. The detector still returns the existing language stack — runtime/services
   are **additive** fields, not a replacement.
4. Empty / minimal projects (e.g., a Python project that only contains
   `requirements.txt`) continue to detect correctly under the existing rules.

## Non-goals

- Inferring `deploy_targets` from `vercel.json`, `fly.toml`,
  `.github/workflows/`, etc. (explicitly out — too risky for auto-inference).
- Multi-language detection for monorepos. The detector keeps returning a single
  primary `stack` string under the existing precedence.
- Parsing Dockerfile `FROM` lines to infer base image / language.
- Supporting compose-alternative markers (`Procfile`, `Vagrantfile`, etc.).
- Changing how the existing language markers are detected. Rules and precedence
  are unchanged.

## Design

### API — `lib/detect-stack.mjs`

```javascript
export function detectProject(projectDir) → {
  stack:    "typescript" | "javascript" | "python" | "rust" | "go" | "unknown",
  runtime:  "docker" | null,
  services: string[]   // sorted, [] when no compose file
}

// Back-compat wrapper. No external callers were found in the repo, but the
// file is a public surface of the agent-init skill, so the wrapper is kept.
export function detectStack(projectDir) {
  return detectProject(projectDir).stack;
}
```

### Detection rules

| Field | Markers | Notes |
|---|---|---|
| `stack` | `tsconfig.json` + `package.json` → `typescript` · `package.json` → `javascript` · `pyproject.toml` OR `requirements.txt` OR `setup.py` → `python` · `Cargo.toml` → `rust` · `go.mod` → `go` | Unchanged from current implementation. Empty-ish projects (e.g., only `requirements.txt`) still detect correctly. |
| `runtime` | `Dockerfile` OR `docker-compose.yml` OR `docker-compose.yaml` OR `compose.yml` OR `compose.yaml` | Any one match → `"docker"`. Otherwise `null`. |
| `services` | Top-level `services:` keys in the first compose file found | Search order: `docker-compose.yml` → `docker-compose.yaml` → `compose.yml` → `compose.yaml`. Parser is regex-based using only Node standard library — no YAML dependency. Returns `[]` when no compose file, no services section, or parser cannot parse. Result is sorted. |

### Compose service parser

A regex parser exported as `parseComposeServices(text)` for unit testing:

- Find the `services:` line at column 0 (top-level).
- Scan subsequent lines while indentation level is one step (two spaces) or
  deeper. Capture keys that match `^  ([A-Za-z0-9_.-]+):` (exactly two-space
  indent — top-level service entries).
- Stop at the next top-level key or end of file.
- Return sorted keys. On any unexpected structure → `[]` (silent fallback, no
  throw).

This intentionally does not validate YAML. We only need the service names.

### Phase 1 (`phases/1-discover.md`) changes

Replace the Step 3 context assembly:

```javascript
const detected = detectProject(cwd);   // { stack, runtime, services }
const ctx = {
  purpose: "...",
  size: "medium",
  qa_personas: ["auth"],
  deploy_targets: "vercel",
  constraints: "",
  ...detected,
  services_str: detected.services.join(", "),  // pre-joined for template
};
```

Summary print at end of Phase 1 adds one line when `runtime` is non-null:

```
detected stack: typescript
runtime: docker (services: postgres, redis)   ← suppressed if runtime is null
chosen size: medium / QA: auth
```

### CLAUDE.md template (`templates/CLAUDE.md.hbs`)

Current line:
```handlebars
{{stack}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}
```

After:
```handlebars
{{stack}}{{#if runtime}} (on {{runtime}}{{#if services}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}
```

`services_str` is computed in Phase 1 as `services.join(", ")` and added to
`ctx`. This avoids requiring a `join` helper in `lib/render.mjs` (the mustache
subset engine may not support it). The implementation step verifies
`render.mjs` capability and adopts whichever path is cleaner — `services` array
+ `join` helper, or pre-joined `services_str`.

### `SKILL.md` doc update

One line:

```
- `lib/detect-stack.mjs` — `detectProject(projectDir)` → { stack, runtime, services }
  (`detectStack(projectDir)` kept as a back-compat wrapper)
```

### `.agent-init-state.json`

No schema migration. New fields appear automatically once Phase 1 runs with
the new detector. Re-runs overwrite prior state.

## Tests

### Fixtures (new, under `tests/fixtures/stacks/`)

| Fixture | Files | Expected `detectProject` result |
|---|---|---|
| `docker-only` | `Dockerfile` | `{ stack: "unknown", runtime: "docker", services: [] }` |
| `node-ts-docker` | `package.json`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml` with services `postgres`, `redis` | `{ stack: "typescript", runtime: "docker", services: ["postgres", "redis"] }` |
| `python-compose-only` | `pyproject.toml`, `compose.yaml` with service `db` | `{ stack: "python", runtime: "docker", services: ["db"] }` |
| `python-requirements-only` | `requirements.txt` only | `{ stack: "python", runtime: null, services: [] }` — covers the "empty Python project" question explicitly |

Existing fixtures (`go`, `monorepo`, `node-ts`, `python`, `rust`) are untouched.

### `tests/lib/detect-stack.test.mjs`

Existing 6 tests preserved unchanged (they call `detectStack`, which now goes
through the wrapper).

New tests:

```
detectProject — node-ts: no docker → runtime null
detectProject — docker-only: stack unknown, runtime docker
detectProject — node-ts-docker: services parsed and sorted
detectProject — python-compose-only: compose.yaml also detected
detectProject — python-requirements-only: minimal python project
detectProject — non-existent dir: all defaults
detectProject — Dockerfile present but malformed compose: services []
```

7 new tests in this group.

### Compose parser tests (same file)

```
parseComposeServices — standard 2-space indent → sorted keys
parseComposeServices — services section absent → []
parseComposeServices — services with comments and blank lines → keys only
parseComposeServices — irregular indentation → []
```

4 tests for the parser as a unit. Total in `tests/lib/detect-stack.test.mjs`:
6 existing + 7 detectProject + 4 parseComposeServices = 17.

### Snapshot tests

If `tests/snapshot/` contains CLAUDE.md template snapshots, add one new
snapshot for the `node-ts-docker` fixture. Do not create a new snapshot file
if the area does not already exist.

### Not tested

- Full YAML compliance of the compose parser (we only read service keys).
- Phase 1 orchestration end-to-end — that path runs inside the `Skill` tool
  and has no programmatic test surface.

## Files changed (implementation checklist)

| File | Change |
|---|---|
| `plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs` | Add `detectProject`, `parseComposeServices`; rewrite `detectStack` as wrapper |
| `plugins/harness-builder/skills/agent-init/phases/1-discover.md` | Update Step 2/3 code blocks; update summary print |
| `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs` | Update stack line to include `(on docker: ...)` |
| `plugins/harness-builder/skills/agent-init/SKILL.md` | Update lib doc line |
| `tests/fixtures/stacks/docker-only/` | New fixture |
| `tests/fixtures/stacks/node-ts-docker/` | New fixture |
| `tests/fixtures/stacks/python-compose-only/` | New fixture |
| `tests/fixtures/stacks/python-requirements-only/` | New fixture |
| `tests/lib/detect-stack.test.mjs` | Add 7 detectProject tests + 4 parser tests |
| `tests/snapshot/` (if present) | Add `node-ts-docker` snapshot case |
| `CHANGELOG.md`, `CHANGELOG.ko.md` | feat entry |

`lib/render.mjs` is touched only if the implementation chooses the `join`
helper path; otherwise it is unchanged.

## Compatibility & rollout

- `detectStack` export is preserved; no caller breaks.
- `discovery.stack` field shape preserved; existing templates and agent files
  are unaffected.
- `.agent-init-state.json` requires no migration — new fields appear on next
  Phase 1 run.
- Version bump for `harness-builder`: minor (`0.2.x` → `0.3.0`).
- Rollback: revert `detect-stack.mjs` and the one template line. Small blast
  radius, no data migration involved.

## Risks

- The regex compose parser may miss services in non-standard YAML formatting
  (tabs, deep nesting, anchors). Mitigation: silent fallback to `[]` — never
  throws, never blocks Phase 1. User can edit `CLAUDE.md` if needed.
- A user with `Dockerfile` in a non-language project still gets
  `stack: "unknown"`; the language stays unknown. This is correct behavior, not
  a regression — calling it out so reviewers do not expect language inference
  from Docker base images.
