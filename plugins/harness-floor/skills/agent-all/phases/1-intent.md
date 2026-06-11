# Phase 1 — Intent

## Inputs (from state)

- `taskPath` (if Phase 0 set it) OR `prompt`
- `requestedId` (legacy display sequence, if Phase 0 accepted `--task-id=<N>`)
- `requestedDisplayId` (if Phase 0 accepted `--display-id=T-YYYYMMDD-NNN`)
- `config.defaults.brainstormFirst`
- CLI: `--no-brainstorm`
- `state.iter` (for loop iterations)

## Branches

## Interaction contract

Any user-facing choice in this phase MUST be represented as
`agent-interaction/v1` before it is rendered:

- Branch C's orchestrator-routing choice ("use Workflow for
  evidence-producing work" vs "continue `/agent-all` for a durable code
  change") is `kind: "decision"` with option ids that can be logged and
  resumed.
- If brainstorming returns multiple viable task-doc directions or leaves a
  required ambiguity before the task ledger entry can be written, surface it as
  the same `AgentInteraction` shape instead of ad hoc prose.
- Claude uses `lib/interactions/renderer-claude.mjs` to render native
  `AskUserQuestion`; Codex, Copilot, Cursor, and Gemini use
  `renderer-codex.mjs`, `renderer-copilot.mjs`, `renderer-cursor.mjs`, and
  `renderer-gemini.mjs` over the same interaction object.
- Non-TTY runs call `resolveNonTtyInteraction()` and may only choose the
  recommended/default option for low/medium risk. High-risk choices pause as
  blocked and write `.agent-skill/runs/<run-id>/interactions.jsonl` before any
  task doc is created.

### Branch A — taskPath exists OR state.iter > 0

Skip brainstorming entirely. Use the existing `.agent-skill/tasks/<display-id>-<slug>.md` file as the task. During migration, also accept legacy `docs/tasks/<N>-<slug>.md` paths unchanged.

1. Read the task doc.
2. Validate it with `validateTaskDoc(text, { requireIdentity: !path.startsWith("docs/tasks/") })` from `lib/task-ledger.mjs`. If `ok === false`, abort and print each error so the task ledger can be repaired before work continues.
3. Parse frontmatter with `parseTaskFrontmatter(text)`. If `id` is present, use it as `task.id`; otherwise preserve legacy behavior with `task.id = basename(path).replace(/\.md$/, "")`.
4. Stash `task` in state with `{id, displayId, githubIssue, path, title}` (title from first `#` heading of the file).

### Branch B — prompt + (--no-brainstorm OR config.defaults.brainstormFirst === false)

Create a durable task ledger entry from the free-form prompt:

1. When Phase 0 allowed first-task scaffold creation, create `.agent-skill/tasks/`, seed `.agent-skill/tasks/index.md`, and seed `.agent-skill/tasks/_template.md` from the operational task ledger template before reading the index. Use the skill-bundled `templates/task-ledger/index.md.hbs` and `_template.md.hbs` as the source templates (vendored from harness-builder; do not reach into another plugin's install dir).
2. Read `.agent-skill/tasks/index.md` as `indexText`, list existing filenames under `.agent-skill/tasks/`, and read `.agent-skill/registry/tasks.json` if it exists. If this project only has legacy `docs/tasks/index.md`, read that path and preserve legacy task links for resume compatibility.
3. Compute `slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task"`.
4. Compute `identity = allocateTaskIdentity({ indexText, filenames, registry, requestedId, requestedDisplayId, slug, title, githubIssue, artifactRoot: config.artifactRoot ?? config.artifact?.root })` from `lib/task-id-allocator.mjs`. This returns a collision-resistant canonical `id` (`AS-TASK-<ULID>`), a human display id (`T-YYYYMMDD-NNN`), and the final `.agent-skill/tasks/<display-id>-<slug>.md` path.
5. Reserve the task in `.agent-skill/registry/tasks.json` with `{id, display_id, path, github_issue, status, artifact_root}` using `recordTask()` from `lib/task-registry.mjs`, then read the returned record with `findTaskRecord(registry, { id })`. Registry writes use a lock plus atomic rename; if another session already claimed the display id, `recordTask()` suffixes `display_id` and rewrites the task path. Treat the returned registry record as canonical for the remaining writes.
6. Write `.agent-skill/tasks/<display-id>-<slug>.md` using the reserved `path` by rendering the full task template with `id`, `displayId`, `githubIssue`, `status: "doing"`, and `artifactRoot` from the reserved record, then pass the rendered markdown through `writeTaskDocArtifact({ path: reserved.path, content, config, runId })` from `lib/task-doc-writer.mjs`. The document must include identity frontmatter plus the required task-ledger sections `Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, `Verification`, and `Cost Telemetry`; include a `Handoff` section for Phase 6 updates. If the redaction gate blocks, abort before writing the task doc.
7. Add the new task to `.agent-skill/tasks/index.md` under `Active` with a link to the reserved task path and display both IDs, e.g. `T-20260611-001 / AS-TASK-...`; write the updated index through `writeTaskDocArtifact({ path: ".agent-skill/tasks/index.md", content, config, runId })` so task-ledger metadata is redacted before storage.
8. Validate the rendered task doc with `validateTaskDoc(text, { requireIdentity: true })` and abort if identity or required sections are missing.
9. Stash `task = {id, displayId, githubIssue, path, title}` in state.

### Branch C — prompt + brainstormFirst true (default)

**0. Orchestrator routing check (do this first).** Judge the deliverable against `references/orchestrator-routing.md`. If the intent is *evidence-producing* — research, an audit across many units, a design/findings report, with no durable code change yet — the built-in `Workflow` (ultracode) tool is the correct orchestrator, **not** `/agent-all`. In that case: recommend it to the user; if they agree, STOP this pipeline and instruct them to run a `Workflow` sweep that writes a `validateTaskDoc`-compliant task doc under `.agent-skill/tasks/`, then re-enter with `/agent-all <taskdoc> --no-brainstorm` (resumes at Branch A — no double-planning). Decide at this brainstorming-scale gauge; only continue to step 1 below when the deliverable is a durable, gated code change that ships as a PR.

1. Invoke `Skill` with `superpowers:brainstorming` passing the prompt as `args`. Brainstorming output should be kept under `.agent-skill/specs/` by default; legacy `docs/superpowers/specs/` output remains readable during migration.
2. After it completes, locate the newest file under `.agent-skill/specs/`, falling back to `docs/superpowers/specs/` if no new-path spec exists (sort by mtime).
3. When Phase 0 allowed first-task scaffold creation, create `.agent-skill/tasks/`, seed `.agent-skill/tasks/index.md`, and seed `.agent-skill/tasks/_template.md` from the operational task ledger template before reading the index. Use the skill-bundled `templates/task-ledger/index.md.hbs` and `_template.md.hbs` as the source templates (vendored from harness-builder; do not reach into another plugin's install dir).
4. Read `.agent-skill/tasks/index.md` as `indexText`, list existing filenames under `.agent-skill/tasks/`, and read `.agent-skill/registry/tasks.json` if it exists.
5. Compute `slug` from the prompt, falling back to the spec title, then to `task`.
6. Compute `identity = allocateTaskIdentity({ indexText, filenames, registry, requestedId, requestedDisplayId, slug, title, githubIssue, artifactRoot: config.artifactRoot ?? config.artifact?.root })`.
7. Reserve `.agent-skill/registry/tasks.json` with `{id, display_id, path, github_issue, status, artifact_root}` using `recordTask()` from `lib/task-registry.mjs`; if display id suffixing occurs, use the returned record's `display_id` and `path`.
8. Render the reserved `.agent-skill/tasks/<display-id>-<slug>.md` from the full task template, including identity frontmatter and using the brainstorm output to populate `Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, `Verification`, `Cost Telemetry`, and `Handoff` instead of copying ad hoc markdown. Write the rendered task doc through `writeTaskDocArtifact({ path: reserved.path, content, config, runId })`; abort before storage if the redaction gate blocks.
9. Add the new task to `.agent-skill/tasks/index.md` under `Active`, and write the updated index through `writeTaskDocArtifact({ path: ".agent-skill/tasks/index.md", content, config, runId })`.
10. Validate the rendered task doc with `validateTaskDoc(text, { requireIdentity: true })` and abort if required sections are missing.
11. Stash `task = {id, displayId, githubIssue, path, title}` in state.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output to user

Print: `Task ready: <task.path> ("<task.title>")`.
