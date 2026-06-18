# Platform Quickstart Pack Design

## Status

Approved for planning. This spec defines the documentation-first adoption
improvement before implementation work begins.

## Goal

Reduce installation friction for new `agent-skill` users by giving each
supported host a short, copy-pasteable quickstart path that ends at installed
plugin/skill verification.

The improvement order agreed for the broader roadmap is:

1. Adoption / onboarding
2. Runtime capability
3. Cross-host parity
4. Governance / enterprise readiness
5. Positioning / narrative

This spec covers the first Adoption slice only.

## Non-Goals

This work does not change installer behavior, doctor behavior, hook behavior,
or project-local runtime scaffolds.

Specifically out of scope:

- adding new `install-platform.sh` modes
- changing `/agent-init`, `/agent-all`, `/visual-qa`, `/thrift`, or `/debug`
- changing Claude, Codex, Copilot, Cursor, Gemini, or VS Code Copilot hook
  implementations
- expanding project doctor logic
- adding uninstall preview or installed-hook self-test behavior

Those are tracked as follow-up technical improvements below.

## User Experience

A first-time user should be able to start from README, choose their platform,
copy the install command, run the shortest supported verification command, and
know whether the host-level plugin/skill install is visible.

The quickstarts intentionally stop before project-local initialization. After
verification, they point to the existing `/agent-init` and usage docs for
project setup.

## Documentation Structure

Create an overview plus one page per supported platform, with English and
Korean mirrors:

- `docs/quickstart/README.md`
- `docs/quickstart/README.ko.md`
- `docs/quickstart/claude.md`
- `docs/quickstart/claude.ko.md`
- `docs/quickstart/codex.md`
- `docs/quickstart/codex.ko.md`
- `docs/quickstart/copilot.md`
- `docs/quickstart/copilot.ko.md`
- `docs/quickstart/cursor.md`
- `docs/quickstart/cursor.ko.md`
- `docs/quickstart/gemini.md`
- `docs/quickstart/gemini.ko.md`
- `docs/quickstart/vscode-copilot.md`
- `docs/quickstart/vscode-copilot.ko.md`

The overview page acts as the install decision table: "If you use this host,
go here." It should avoid long conceptual explanation. Positioning belongs in
`docs/HARNESS_POSITIONING.md`; project usage belongs in `docs/USAGE.md`.

## Page Contract

Each platform page must include:

1. platform name and scope
2. supported install path from the current release surface
3. shortest install command or command group
4. shortest verification command or command group
5. what "installed" means for that host
6. link to `/agent-init` usage as the next step
7. Korean or English mirror link

Each page must avoid:

- duplicating the full README install guide
- documenting project-local doctor behavior as if it were host-level install
  verification
- promising hard hooks on hosts where the release surface is prompt-level,
  sequential, or instructions-only
- exposing platform-suffixed public commands such as `/agent-all-codex`

## Platform Notes

### Claude Code

The Claude quickstart should focus on marketplace install through Claude Code's
plugin surface. Verification should check the plugin list or installed plugin
metadata with the shortest reliable command already documented in README.

Claude can expose native slash commands and hook-backed enforcement where the
installed plugin and initialized project support them, but the quickstart stops
at plugin visibility.

### Codex CLI

The Codex quickstart should use the Codex CLI install path from this repo's
scripts and verify the installed Codex plugin bundle or skill cache. It must
describe public commands as canonical names, while acknowledging that runtime
dispatch uses Codex's current skill/prompt-level surfaces.

### Copilot CLI

The Copilot quickstart should install the Copilot bundle through the current
scripted platform path and verify the expected plugin/skill files or cache
surface. It should not imply Claude-native hooks.

### Cursor

The Cursor quickstart should install the Cursor bundle and verify generated
rules/skill assets for the host. It should keep enforcement wording honest:
Cursor receives the strongest scaffold the host supports.

### Gemini CLI

The Gemini quickstart should install the Gemini bundle and verify generated
settings/rules/skill assets for the host. It should present MCP/settings
integration as host-specific, not as Claude-style slash-command parity.

### VS Code Copilot

The VS Code Copilot quickstart should be explicit that this surface is
instructions-only in the current release. Verification should therefore be file
presence or instructions visibility, not runtime hook enforcement.

## README Integration

Update the top of `README.md` and `README.ko.md` to route first-time installers
to `docs/quickstart/README.md` or `docs/quickstart/README.ko.md` before the
long reference material.

The README should remain concise. The top section only needs:

- a one-line "new install path" pointer
- link to the quickstart overview
- link to the positioning page for users comparing harnesses

## Testing and Drift Guards

Extend release documentation contracts so future changes cannot silently drift:

- quickstart overview pages exist in both languages
- every supported platform has English and Korean quickstart pages
- every platform page contains install and verify sections
- every platform page links to `/agent-init` next-step usage
- every platform page links to its language mirror
- README files link to the quickstart overview
- quickstart docs do not expose platform-suffixed public slash commands
- local markdown links resolve through `scripts/docs-structure-check.mjs`

No runtime tests are required for this slice because runtime behavior is not
changing.

## Follow-Up Technical Improvements

The next technical improvements should be sequenced after this documentation
slice. Proposed order:

1. `install-platform.sh --verify-installed`
   - Add a host-level verification mode that checks whether selected plugins or
     skills are visible after install.
   - This would turn the quickstart verify commands into a shared script
     contract.
2. `install-all.sh --doctor`
   - Separate marketplace/global install state from project-local `/agent-init`
     state in one concise diagnostic.
3. Hook capability probe
   - Probe each host for hard hooks, prompt hooks, MCP integration, and skill
     dispatch support.
   - Feed the result into docs and doctor output.
4. Hook drift self-test
   - Allow installed target-project hooks to self-test against the current
     expected payload schema.
5. Uninstall preview/diff
   - Make `--uninstall --dry-run` show exactly which files or sentinel sections
     would be removed.
6. Cross-host command contract checker
   - Verify that canonical public commands remain consistent across docs,
     manifests, install outputs, and generated assets.
7. Existing-repo post-install fixtures
   - Extend fresh fixtures with realistic repos that already contain
     `AGENTS.md`, `CLAUDE.md`, settings files, and partial prior installs.

These follow-ups should be designed separately, in the broader roadmap order:
Runtime capability, Cross-host parity, Governance, then Positioning.

## Acceptance Criteria

- Quickstart spec is committed before implementation planning begins.
- Implementation plan uses this spec as its source of truth.
- User reviews and approves the spec before implementation planning starts.
- Quickstart implementation remains documentation-only except for release-doc
  contract tests.
