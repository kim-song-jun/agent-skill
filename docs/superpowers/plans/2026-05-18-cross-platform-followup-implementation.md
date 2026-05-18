# Cross-platform follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Bring `harness-builder-{codex,copilot,gemini}` to hook+MCP emission parity, replace Cursor's `install.sh` with a Node renderer, update tests + CHANGELOG. visual-qa/agent-all porting is decomposed into separate per-platform follow-up specs (not implemented here).

**Architecture:** Each platform plugin gains additional templates (`config.toml.hbs` / `hook JSON stubs` / `settings.json.hbs`) and an optional emit step in its SKILL.md orchestrator. Cursor's `bin/install.sh` becomes a deprecation shim; `bin/init.mjs` is the new automated entry point that reads vendored `lib/` for detection + rendering. Tests cover the new templates and the renderer.

**Tech Stack:** Same as cross-platform plugin family (Node ESM, vendored `render.mjs`, `node:test`).

**Spec:** [`docs/superpowers/specs/2026-05-18-cross-platform-followup-implementation-design.md`](../specs/2026-05-18-cross-platform-followup-implementation-design.md)

---

## File Structure

| Path | Plugin | Purpose |
|---|---|---|
| `plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs` | codex | TOML stub for hooks + MCP servers |
| `plugins/harness-builder-codex/skills/codex-init/SKILL.md` | codex | Add Phase 4 (optional hook/MCP emit) |
| `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/preToolUse.json` | copilot | Static stub |
| `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/postToolUse.json` | copilot | Static stub |
| `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/agentStop.json` | copilot | Static stub |
| `plugins/harness-builder-copilot/skills/copilot-init/templates/mcp-config.json.hbs` | copilot | Snippet for user's `~/.copilot/mcp-config.json` |
| `plugins/harness-builder-copilot/skills/copilot-init/SKILL.md` | copilot | Add Phase 4 |
| `plugins/harness-builder-gemini/skills/gemini-init/templates/gemini-settings.json.hbs` | gemini | Settings stub for hooks + MCP |
| `plugins/harness-builder-gemini/skills/gemini-init/SKILL.md` | gemini | Add Phase 4 |
| `plugins/harness-builder-cursor/bin/init.mjs` | cursor | New automated renderer |
| `plugins/harness-builder-cursor/bin/install.sh` | cursor | Deprecation shim (rewrite) |
| `plugins/harness-builder-cursor/skills/cursor-init/SKILL.md` | cursor | Reflect new entry point |
| `tests/lib/cross-platform-render.test.mjs` | repo | Extend with new templates |
| `tests/lib/cursor-renderer.test.mjs` | repo | New — exercises `init.mjs` against a temp dir |
| `CHANGELOG.md`, `CHANGELOG.ko.md` | repo | feat entries |
| `docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md` | repo | Mark items done; carry remaining ones forward |

---

## Task 1: Codex `.codex/config.toml` stub + Phase 4

**Files:**
- Create: `plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs`
- Modify: `plugins/harness-builder-codex/skills/codex-init/SKILL.md`

- [ ] **Step 1: Create the template**

`plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs`:

```handlebars
# Stub Codex config produced by /codex-init.
# Merge with your existing ~/.codex/config.toml or use as a starting point.

[hooks]
PreToolUse = [
  { matcher = "apply_patch", hooks = [{ type = "command", command = "{{hook_command_pretool}}" }] }
]
SessionStart = [
  { hooks = [{ type = "command", command = "{{hook_command_sessionstart}}" }] }
]
{{#if mcp_servers_block}}

{{mcp_servers_block}}
{{/if}}
```

Default values supplied by the orchestrator:
- `hook_command_pretool` = `"echo 'pre apply_patch'"`
- `hook_command_sessionstart` = `"echo 'session start'"`
- `mcp_servers_block` = pre-formatted TOML block (orchestrator builds it as a multi-line string; see Step 2)

- [ ] **Step 2: Extend `SKILL.md` with Phase 4**

In `plugins/harness-builder-codex/skills/codex-init/SKILL.md`, append a new section after Phase 3:

```markdown
## Phase 4 — Optional: emit Codex config stub

Ask the user via `ask_user` whether to also emit `.codex/config.toml` with
hook and MCP stubs. If yes:

1. Prompt for any MCP servers they want bundled. For each, capture
   `{ name, command, args }` (stdio) or `{ name, url }` (HTTP). Empty list is OK.
2. Build the `mcp_servers_block` as a TOML string:

   ```javascript
   const lines = [];
   for (const s of mcp_servers) {
     lines.push(`[mcp_servers.${s.name}]`);
     if (s.command) {
       lines.push(`command = ${JSON.stringify(s.command)}`);
       lines.push(`args = ${JSON.stringify(s.args ?? [])}`);
     } else if (s.url) {
       lines.push(`url = ${JSON.stringify(s.url)}`);
     }
     lines.push("");
   }
   const mcp_servers_block = lines.join("\n");
   ```

3. Extend the ctx:

   ```javascript
   ctx.hook_command_pretool = "echo 'pre apply_patch'";
   ctx.hook_command_sessionstart = "echo 'session start'";
   ctx.mcp_servers_block = mcp_servers_block;
   ```

4. Render `templates/codex-config.toml.hbs` and write to
   `.codex/config.toml` in the project root. Refuse to overwrite unless
   `--force`.

The hook commands are no-ops by default; users edit them.
```

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs \
        plugins/harness-builder-codex/skills/codex-init/SKILL.md
git commit -m "feat(harness-builder-codex): emit .codex/config.toml stub with hooks + MCP"
```

---

## Task 2: Copilot hook stubs + MCP snippet + Phase 4

**Files:**
- Create: `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/preToolUse.json`
- Create: `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/postToolUse.json`
- Create: `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/agentStop.json`
- Create: `plugins/harness-builder-copilot/skills/copilot-init/templates/mcp-config.json.hbs`
- Modify: `plugins/harness-builder-copilot/skills/copilot-init/SKILL.md`

- [ ] **Step 1: Create three hook JSON stubs**

`templates/hooks/preToolUse.json`:

```json
{
  "hooks": [
    { "matcher": "read_bash", "command": "echo 'pre read_bash'" }
  ]
}
```

`templates/hooks/postToolUse.json`:

```json
{
  "hooks": [
    { "matcher": "apply_patch", "command": "echo 'post apply_patch'" }
  ]
}
```

`templates/hooks/agentStop.json`:

```json
{
  "hooks": [
    { "command": "echo 'agent stopped'" }
  ]
}
```

These are static JSON (no .hbs) — they're literal stubs that get copied verbatim.

- [ ] **Step 2: Create the MCP config snippet template**

`templates/mcp-config.json.hbs`:

```handlebars
{
  "mcpServers": {
{{mcp_servers_json_body}}
  }
}
```

The orchestrator builds `mcp_servers_json_body` as a pre-formatted string (handles trailing commas correctly).

- [ ] **Step 3: Extend `SKILL.md` with Phase 4**

```markdown
## Phase 4 — Optional: emit hook + MCP stubs

Ask the user whether to also emit `.github/hooks/` stubs and an MCP
config snippet. If yes:

1. Copy these static stubs into the project:

   - `templates/hooks/preToolUse.json` → `.github/hooks/preToolUse.json`
   - `templates/hooks/postToolUse.json` → `.github/hooks/postToolUse.json`
   - `templates/hooks/agentStop.json` → `.github/hooks/agentStop.json`

   Refuse to overwrite unless `--force`.

2. Prompt for MCP servers (`name`, `command`, `args` — or `name`, `url`).

3. Build the MCP servers JSON body:

   ```javascript
   const entries = mcp_servers.map((s) => {
     const fields = s.command
       ? `      "command": ${JSON.stringify(s.command)},\n      "args": ${JSON.stringify(s.args ?? [])}`
       : `      "url": ${JSON.stringify(s.url)}`;
     return `    ${JSON.stringify(s.name)}: {\n${fields}\n    }`;
   });
   const mcp_servers_json_body = entries.join(",\n");
   ```

4. Render `templates/mcp-config.json.hbs` and PRINT it to stdout (do NOT
   write to `~/.copilot/mcp-config.json` automatically — the user merges
   it manually). Print also includes a header: `# Copy the following into ~/.copilot/mcp-config.json`.
```

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-builder-copilot/skills/copilot-init/templates/hooks \
        plugins/harness-builder-copilot/skills/copilot-init/templates/mcp-config.json.hbs \
        plugins/harness-builder-copilot/skills/copilot-init/SKILL.md
git commit -m "feat(harness-builder-copilot): emit .github/hooks stubs + MCP config snippet"
```

---

## Task 3: Gemini settings.json stub + Phase 4

**Files:**
- Create: `plugins/harness-builder-gemini/skills/gemini-init/templates/gemini-settings.json.hbs`
- Modify: `plugins/harness-builder-gemini/skills/gemini-init/SKILL.md`

- [ ] **Step 1: Create the template**

`templates/gemini-settings.json.hbs`:

```handlebars
{
  "hooks": {
    "BeforeTool": [
      { "matcher": "write_file", "command": "{{hook_command_beforetool}}" }
    ],
    "SessionStart": [
      { "command": "{{hook_command_sessionstart}}" }
    ]
  },
  "mcpServers": {
{{mcp_servers_json_body}}
  }
}
```

Same pre-joined-body strategy as Copilot.

- [ ] **Step 2: Extend `SKILL.md` with Phase 4**

```markdown
## Phase 4 — Optional: emit .gemini/settings.json stub

Ask the user whether to emit `.gemini/settings.json` with hook + MCP
stubs. If yes:

1. Default hook commands:
   ```javascript
   ctx.hook_command_beforetool = "echo 'before write_file'";
   ctx.hook_command_sessionstart = "echo 'session start'";
   ```

2. Build `mcp_servers_json_body` the same way as Copilot (Phase 4 step 3).

3. Render `templates/gemini-settings.json.hbs` and write to
   `.gemini/settings.json` in the project. Refuse to overwrite unless
   `--force`.

The hook commands are no-ops by default; users edit them.
```

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-builder-gemini/skills/gemini-init/templates/gemini-settings.json.hbs \
        plugins/harness-builder-gemini/skills/gemini-init/SKILL.md
git commit -m "feat(harness-builder-gemini): emit .gemini/settings.json stub with hooks + MCP"
```

---

## Task 4: Cursor `bin/init.mjs` Node renderer

**Files:**
- Create: `plugins/harness-builder-cursor/bin/init.mjs`
- Rewrite: `plugins/harness-builder-cursor/bin/install.sh` (deprecation shim)
- Modify: `plugins/harness-builder-cursor/skills/cursor-init/SKILL.md`

- [ ] **Step 1: Create `init.mjs`**

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../skills/cursor-init/lib/detect-stack.mjs";
import { render } from "../skills/cursor-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const templatesDir = resolve(pluginRoot, "skills/cursor-init/templates");

function parseArgs(argv) {
  const args = { target: null, ctxPath: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ctx") args.ctxPath = argv[++i];
    else if (argv[i] === "--force") args.force = true;
    else if (!args.target) args.target = argv[i];
  }
  if (!args.target) {
    console.error("Usage: init.mjs <target-project-dir> [--ctx <ctx.json>] [--force]");
    process.exit(1);
  }
  return args;
}

function loadCtx(ctxPath, target) {
  let ctx;
  if (ctxPath) {
    ctx = JSON.parse(readFileSync(ctxPath, "utf-8"));
  } else {
    ctx = {
      purpose: process.env.PURPOSE || "Project",
      size: process.env.SIZE || "medium",
      qa_personas: (process.env.QA_PERSONAS || "general").split(",").map((s) => s.trim()),
      deploy_targets: process.env.DEPLOY_TARGETS || "",
      constraints: process.env.CONSTRAINTS || "",
    };
  }
  const detected = detectProject(target);
  ctx = {
    ...ctx,
    ...detected,
    services_str: detected.services.join(", "),
    agents: [
      { name: "planner", description: "Drafts a plan before non-trivial changes." },
      { name: "dev", description: "Implements after a plan is confirmed." },
      { name: "reviewer", description: "Reviews the diff before final acceptance." },
    ],
  };
  return ctx;
}

function listTemplates(dir, baseRel = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listTemplates(full, rel));
    else if (entry.name.endsWith(".hbs")) out.push({ full, rel });
  }
  return out;
}

function relToTarget(rel) {
  // templates/rules/agent-init.mdc.hbs → .cursor/rules/agent-init.mdc
  // templates/agents/planner.md.hbs → .cursor/agents/planner.md
  const stripped = rel.replace(/\.hbs$/, "");
  return `.cursor/${stripped}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const ctx = loadCtx(args.ctxPath, target);
  const templates = listTemplates(templatesDir);
  for (const t of templates) {
    const outPath = resolve(target, relToTarget(t.rel));
    if (existsSync(outPath) && !args.force) {
      console.error(`Refusing to overwrite ${outPath} (use --force)`);
      process.exit(2);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    const tpl = readFileSync(t.full, "utf-8");
    const rendered = render(tpl, ctx);
    writeFileSync(outPath, rendered);
    console.log(`wrote ${outPath}`);
  }
  console.log(`done — detected ${ctx.stack}${ctx.runtime ? ` (on ${ctx.runtime})` : ""}`);
}

main();
```

Mark executable: `chmod +x plugins/harness-builder-cursor/bin/init.mjs`.

- [ ] **Step 2: Rewrite `install.sh` as deprecation shim**

```bash
#!/usr/bin/env bash
echo "install.sh is deprecated. Use the Node renderer instead:" >&2
echo "  node plugins/harness-builder-cursor/bin/init.mjs <target> [--ctx ctx.json] [--force]" >&2
exit 1
```

Keep it executable.

- [ ] **Step 3: Update `SKILL.md`**

In `plugins/harness-builder-cursor/skills/cursor-init/SKILL.md`, replace the "Mode B — Manual install" section with:

```markdown
## Mode B — Automated install (today, recommended)

```bash
node plugins/harness-builder-cursor/bin/init.mjs /path/to/your/project \
     --ctx ctx.json [--force]
```

The renderer:

1. Reads `ctx.json` (or env vars `PURPOSE`, `SIZE`, `QA_PERSONAS`, `DEPLOY_TARGETS`, `CONSTRAINTS` if no JSON).
2. Runs `detectProject(target)` to fill `stack`/`runtime`/`services`.
3. Renders all `.hbs` templates and writes them to `.cursor/rules/` and
   `.cursor/agents/` in the target project.
4. Refuses to overwrite existing files unless `--force`.

`bin/install.sh` is deprecated — it now prints a hint and exits non-zero.

Example `ctx.json`:

```json
{
  "purpose": "Demo app",
  "size": "small",
  "qa_personas": ["auth"],
  "deploy_targets": "fly.io",
  "constraints": ""
}
```
```

- [ ] **Step 4: Commit**

```bash
chmod +x plugins/harness-builder-cursor/bin/init.mjs
git add plugins/harness-builder-cursor/bin/init.mjs \
        plugins/harness-builder-cursor/bin/install.sh \
        plugins/harness-builder-cursor/skills/cursor-init/SKILL.md
git update-index --chmod=+x plugins/harness-builder-cursor/bin/init.mjs 2>/dev/null || true
git commit -m "feat(harness-builder-cursor): bin/init.mjs Node renderer (replaces install.sh)"
```

---

## Task 5: Tests — extend render, add Cursor renderer test

**Files:**
- Modify: `tests/lib/cross-platform-render.test.mjs`
- Create: `tests/lib/cursor-renderer.test.mjs`

- [ ] **Step 1: Extend `cross-platform-render.test.mjs`**

Add these test cases inside the existing test loop (extend the `CASES` array):

```javascript
  {
    tpl: "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
    contains: ["[hooks]", "PreToolUse", "SessionStart"],
    extraCtx: { hook_command_pretool: "echo pre", hook_command_sessionstart: "echo start", mcp_servers_block: "" },
  },
  {
    tpl: "plugins/harness-builder-gemini/skills/gemini-init/templates/gemini-settings.json.hbs",
    contains: ["\"BeforeTool\"", "\"SessionStart\"", "\"mcpServers\""],
    extraCtx: { hook_command_beforetool: "echo bt", hook_command_sessionstart: "echo ss", mcp_servers_json_body: "" },
  },
  {
    tpl: "plugins/harness-builder-copilot/skills/copilot-init/templates/mcp-config.json.hbs",
    contains: ["\"mcpServers\""],
    extraCtx: { mcp_servers_json_body: "" },
  },
```

Update the test body to accept `extraCtx`:

```javascript
for (const c of CASES) {
  test(`renders ${c.tpl}`, () => {
    const tpl = readFileSync(resolve(c.tpl), "utf-8");
    const out = render(tpl, { ...CTX, ...(c.extraCtx ?? {}) });
    for (const needle of c.contains) {
      assert.ok(out.includes(needle), `Expected "${needle}" in render output of ${c.tpl}`);
    }
  });
}
```

- [ ] **Step 2: Create `tests/lib/cursor-renderer.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const RENDERER = resolve("plugins/harness-builder-cursor/bin/init.mjs");

test("cursor init.mjs renders templates into target dir", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-init-"));
  try {
    const ctxPath = join(target, "ctx.json");
    writeFileSync(ctxPath, JSON.stringify({
      purpose: "Demo",
      size: "small",
      qa_personas: ["auth"],
      deploy_targets: "fly.io",
      constraints: "",
    }));
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });

    const mdc = join(target, ".cursor/rules/agent-init.mdc");
    const planner = join(target, ".cursor/agents/planner.md");
    assert.ok(existsSync(mdc), `${mdc} should exist`);
    assert.ok(existsSync(planner), `${planner} should exist`);
    const mdcContent = readFileSync(mdc, "utf-8");
    assert.ok(mdcContent.includes("Demo"), "purpose substituted");
    assert.ok(mdcContent.includes("alwaysApply: true"), "frontmatter preserved");
    assert.ok(!mdcContent.includes("{{purpose}}"), "no unrendered placeholders");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cursor init.mjs refuses to overwrite without --force", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-init-"));
  try {
    const ctxPath = join(target, "ctx.json");
    writeFileSync(ctxPath, JSON.stringify({ purpose: "Demo", size: "small", qa_personas: ["a"], deploy_targets: "", constraints: "" }));
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });
    let threw = false;
    try {
      execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });
    } catch (err) {
      threw = true;
      assert.ok(err.status !== 0, "exit non-zero on overwrite");
    }
    assert.ok(threw, "expected execFileSync to throw on overwrite");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cursor init.mjs --force overwrites", () => {
  const target = mkdtempSync(join(tmpdir(), "cursor-init-"));
  try {
    const ctxPath = join(target, "ctx.json");
    writeFileSync(ctxPath, JSON.stringify({ purpose: "Demo", size: "small", qa_personas: ["a"], deploy_targets: "", constraints: "" }));
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath], { stdio: "pipe" });
    execFileSync("node", [RENDERER, target, "--ctx", ctxPath, "--force"], { stdio: "pipe" });
    // No throw = success
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run tests**

```bash
node --test tests/lib/cross-platform-render.test.mjs tests/lib/cursor-renderer.test.mjs
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/cross-platform-render.test.mjs tests/lib/cursor-renderer.test.mjs
git commit -m "test: extend cross-platform render + cursor init.mjs end-to-end"
```

---

## Task 6: CHANGELOG + close follow-up items

**Files:**
- Modify: `CHANGELOG.md`, `CHANGELOG.ko.md`
- Modify: `docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md`

- [ ] **Step 1: CHANGELOG.md entry**

Prepend at the top:

```markdown
## Cross-platform follow-up — 2026-05-18

### Added
- Optional Phase 4 emit in `codex-init`, `copilot-init`, `gemini-init`:
  - Codex: `.codex/config.toml` with `[hooks]` + `[mcp_servers.*]` stubs
  - Copilot: `.github/hooks/{preToolUse,postToolUse,agentStop}.json` static stubs + `mcp-config.json` snippet printed to stdout
  - Gemini: `.gemini/settings.json` with `hooks` (BeforeTool/SessionStart) + `mcpServers` stubs
- `plugins/harness-builder-cursor/bin/init.mjs` — Node renderer that reads ctx JSON, runs `detectProject`, and writes all rendered `.cursor/rules/` and `.cursor/agents/` files. Refuses to overwrite without `--force`.
- `bin/install.sh` is now a deprecation shim that points to `init.mjs`.

### Tests
- Extended cross-platform render coverage for the three new platform-config templates.
- New `cursor-renderer.test.mjs` exercises the full end-to-end renderer against a temp directory.

### Still deferred
- visual-qa / agent-all per-platform porting (separate specs)
- Brainstorm integration via host-native `ask_user` equivalents
- Runtime validation against actual CLIs
```

- [ ] **Step 2: CHANGELOG.ko.md mirror** (translated headings; keep file/tool names in English)

- [ ] **Step 3: Update `2026-05-18-cross-platform-plugins-followups.md`**

For Codex, Copilot, Gemini sections, change the hook/MCP bullets to:

```
- ✅ DONE — see `2026-05-18-cross-platform-followup-implementation-design.md` and CHANGELOG
```

For Cursor section, change the renderer bullet to:

```
- ✅ DONE — `bin/init.mjs` Node renderer ships in this iteration
```

Carry the remaining items forward (`/commands` for Cursor still TBD, etc.).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CHANGELOG.ko.md docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md
git commit -m "docs: CHANGELOG for follow-up iteration; close hook/MCP/renderer items"
```

---

## Self-Review

- **Spec coverage:** Hooks for 3 platforms ✓, MCP stubs for 3 platforms ✓, Cursor renderer ✓, tests ✓, CHANGELOG ✓, follow-up tracker updates ✓.
- **Placeholder scan:** No TBDs in any task body. The visual-qa/agent-all decomposition explicitly lives in the spec, not as a placeholder.
- **Type consistency:** ctx field shape extends prior context with `hook_command_*` and `mcp_servers_*` fields. Cursor's `init.mjs` uses the same `detectProject` + `render` lib that Phase 1 of `agent-init` does.
- **YAGNI:** No shared abstraction added for emitting hook configs; each platform's template is platform-specific. Cursor renderer is the minimum viable Node script — no CLI library, no interactive prompt fallback beyond env vars.
