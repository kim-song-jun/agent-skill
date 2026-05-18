# Hook Precedence Integration Spec

**Date:** 2026-05-18
**Status:** Protocol — implementations follow this contract
**Supersedes:** N/A (formalizes findings from `docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md`)

---

## 1. Background

Three plugin families now register Claude Code hooks into the same
project surface:

| Family | Owner | Hooks today | Scope |
|---|---|---|---|
| **agent-init** | `plugins/harness-builder/skills/agent-init/` | `context-mode-router`, `session-summary`, `cache-heal` | baseline; written by `/agent-init` |
| **harness-thrift** | `plugins/harness-thrift/skills/thrift/` | `thrift-pretool-bash-telemetry`, `thrift-pretool-read-coerce`, `thrift-posttool-summariser-trigger`, `thrift-sessionstart-cache-prime`, `thrift-sessionend-audit` | telemetry + cost throttle; opt-in |
| **harness-floor** | `plugins/harness-floor/skills/{visual-qa,agent-all}/` | (none today) | reserved — future visual-qa / agent-all hooks |

In addition, the external **context-mode** plugin (`context-mode@context-mode`)
ships its own hooks via the plugin marketplace; agent-init's `cache-heal`
exists specifically to heal that plugin's cache symlinks.

Claude Code merges hooks from three settings layers:

1. `~/.claude/settings.json` — user-global (lowest precedence)
2. `.claude/settings.json` — project-shared, committed
3. `.claude/settings.local.json` — per-user-per-project, gitignored (highest)

Within a layer, **hooks fire in array order** for a given event. Without
a shared protocol, hooks could fire in arbitrary order, duplicate work
(e.g., two PreToolUse(Bash) hooks both emitting "use ctx_execute"), or
*block each other* — a `PreToolUse` hook that exits non-zero cancels the
tool call and downstream hooks never run.

This document is the **shared contract** that all three families (and
any future hook-registering plugin in this repo) agree to follow.

---

## 2. Event-by-event firing order

The canonical firing order per Claude Code hook event. Position numbers
are absolute within the merged settings array. New plugins MUST append
to the end of their slot's range — never insert at head — unless they
are taking ownership of a position previously reserved for them below.

| Event | Order | Owners | Notes |
|---|---|---|---|
| `PreToolUse(Bash)` | 1. `context-mode-router` → 2. `thrift-pretool-bash-telemetry` → 3. (future) harness-floor hooks | context-mode owns coercion; thrift observes; harness-floor would be domain-specific | Don't add **blocking** hooks after position 1 — see §7. |
| `PreToolUse(Read)` | 1. `thrift-pretool-read-coerce` | thrift owns this slot | No conflict today; if context-mode later adds a Read router, it takes position 1 and thrift drops to 2. |
| `PreToolUse(*)` (other tools — Edit, Write, Grep, WebFetch, MCP tool calls) | reserved for plugins | — | First-come-first-served. Each plugin appends with its sentinel; no central allocation. |
| `PostToolUse(*)` | 1. `thrift-posttool-summariser-trigger` → 2. (future) others | thrift first so it can count token cost accurately before others mutate state | Append-only after position 1. |
| `SessionStart` | 1. `cache-heal` → 2. `thrift-sessionstart-cache-prime` → 3. (future) others | infra heal must run before anything else (so other hooks find a working context-mode cache); thrift second so the cache is healthy when priming attempts run | `cache-heal` is from agent-init; never reorder. |
| `SessionEnd` | 1. `thrift-sessionend-audit` → 2. (future) others | thrift first to capture session-level token metrics before any other side-effects | Append-only. |
| `Stop` | 1. `session-summary` → 2. (future) others | agent-init owns the user-facing summary | Stop hooks that exit non-zero re-run the assistant; only the owner of position 1 should ever do that. |
| `Notification` | First-come-first-served | — | Notifications are user-facing; ordering rarely matters but the open question in §11 applies. |
| `UserPromptSubmit` | reserved | — | No current owner; document any future use here. |
| `SubagentStop` | reserved | — | Visual-qa or agent-all may use in future to roll up subagent telemetry. |

### Why ordering matters per event

- **PreToolUse:** any hook can `exit 1` and cancel the tool call. If a
  blocking hook fires at position 3, hooks at positions 1–2 have already
  emitted their additional-context payloads (wasted work, possibly
  user-visible noise). Conversely, if position 1 blocks, positions 2+
  are silently skipped — they cannot observe what they were never
  invoked for.
- **PostToolUse:** non-blocking but reads `tool_result`. Hooks that
  mutate shared state (e.g., write to a counter file) must run before
  hooks that read it. Thrift's summariser-trigger is positioned first
  because its counter feeds downstream decisions.
- **SessionStart:** `cache-heal` repairs broken symlinks for the
  context-mode plugin. If any other SessionStart hook depends on
  context-mode being importable, it must run *after* `cache-heal`.
- **Stop:** non-zero exit re-runs the assistant. Only one Stop hook
  should ever own that behavior per project (currently `session-summary`,
  and only conditionally).

---

## 3. Sentinel-based registration protocol

Every plugin that registers hooks MUST identify its entries with a
**stable, plugin-specific sentinel** baked into the hook command path.
The sentinel is what lets `unpatch` operations remove the right entries
without disturbing other plugins.

### Rules

1. **The sentinel is a regex over the `command` string** in each hook
   entry. It MUST match every hook this plugin registers.
2. The sentinel MUST be regex-safe and unique across all plugins in this
   repo. Collisions are a release-blocker.
3. The sentinel pattern lives next to the patcher (see §5) so unpatch
   can use the same definition the patcher used.

### Registry of allocated sentinels

| Plugin | Sentinel pattern | Example command path |
|---|---|---|
| **agent-init** | `(context-mode-router\|session-summary\|cache-heal)\.mjs` | `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/cache-heal.mjs"` |
| **harness-thrift** | `thrift-.*\.m?js\|thrift/.*\.m?js` (current default in `lib/settings-patcher.mjs`) | `node ".../hooks/thrift-pretool-bash-telemetry.mjs"` |
| **harness-floor** (reserved) | `floor-.*\.m?js` | `node ".../hooks/floor-vqa-posttool-screenshot-index.mjs"` |
| **harness-floor / visual-qa subset** (reserved) | `floor-vqa-.*\.m?js` (subset of `floor-.*`) | as above |
| **context-mode (external plugin)** | `context-mode-.*\.m?js` (recommended; see §10) | plugin-cache path under `~/.claude/plugins/cache/` |

Sentinels are deliberately **prefix-based** so subsets can nest under a
family (e.g., `floor-vqa-` is a strict subset of `floor-`). Unpatch by
the narrow sentinel removes only that sub-feature; unpatch by the broad
sentinel removes the whole family.

### Naming convention for new plugins

`<family>-<event-or-purpose>-<detail>.mjs` — e.g.
`floor-aa-sessionstart-roster-load.mjs` (`floor` family, `aa` =
agent-all sub-feature, SessionStart event, roster-load purpose).

---

## 4. Append-only patching contract

Every plugin's settings patcher MUST:

1. **Read** the existing `.claude/settings.local.json` (treat missing
   file as `{"hooks": {}}`).
2. **Refuse** to touch the file if it cannot parse as JSON (do not
   overwrite user state).
3. For each event the plugin wants to register hooks for, **append**
   its entries to the end of `settings.hooks[event]` — never insert at
   head, never splice into the middle.
4. **Detect re-registration** via command-path equality. If any
   `hooks[*].command` in a candidate entry already appears in any
   existing entry for the same event, skip the candidate (idempotent
   re-run).
5. **Write back atomically** (tmp file + rename in same directory) so
   a crash mid-write leaves the previous file intact.
6. Provide a corresponding **`unpatch`** that removes ONLY entries
   whose command path matches the plugin's sentinel (§3). It MUST NOT
   modify or remove entries owned by other plugins.
7. After unpatch, if an event's array becomes empty, delete the event
   key entirely (keeps the file tidy).

### Non-goals

- Patchers do not validate that command paths exist on disk. The
  install step is responsible for placing the `.mjs` files before
  patching.
- Patchers do not enforce position assignments from §2. The order
  contract is honored by **install order** (e.g., agent-init runs
  first, thrift second). If a plugin is installed out of order, the
  install command must surface a warning.

---

## 5. Settings file precedence policy

| File | Who writes | Why |
|---|---|---|
| `~/.claude/settings.json` (user-global) | **Reserved for the user.** No plugin in this repo may write here. | A plugin writing user-global settings poisons every project the user touches. |
| `.claude/settings.json` (project-shared, committed) | **`/agent-init` only**, and only for the *baseline* three hooks (`context-mode-router`, `session-summary`, `cache-heal`). | These are the harness baseline; checking them in is intentional so teammates inherit the same harness. Thrift/floor/etc. MUST NOT write here — they are opt-in per-user. |
| `.claude/settings.local.json` (per-user-per-project, gitignored) | **harness-thrift**, **(future) harness-floor**, any other opt-in plugin. | Local overrides don't bind teammates and survive `git clean`. This is the primary patcher surface. |

> **agent-init exception.** `/agent-init` writes the baseline to
> `.claude/settings.local.json` today (see
> `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs`).
> A future revision may move the baseline to the committed
> `.claude/settings.json` once teams want shared enforcement. Until
> then, all three layers may contain the baseline three; merge order
> handles dedup.

---

## 6. Conflict resolution

When the patcher detects a conflict at install time:

| Situation | Resolution |
|---|---|
| Same command-path in the same event | **Skip** the candidate (idempotent). Return `{applied: 0, skipped: 1}` so the caller can report "already installed". |
| Different command-path, same matcher (e.g., two PreToolUse-Bash entries) | **Append** the new entry. CC will fire both; ordering is array order, owners are responsible for not duplicating work (see §7). |
| Blocking PreToolUse hook (one that may `exit 1`) being added after a non-blocking entry | **Warn and refuse.** Blocking hooks MUST be position 1. If a plugin needs to block, it must either be installed before any non-blocking PreToolUse hook for that matcher, or it must convert to non-blocking (emit `additionalContext` and `exit 0`). |
| Unparseable existing `settings.local.json` | **Refuse** the entire patch. Surface the parse error to the user with the file path. Never overwrite. |
| Existing entry uses this plugin's sentinel but has a different command path (drift) | **Append** the new entry. Leave the drift entry alone — unpatch will reap both at uninstall time. |

### Identifying blocking hooks

A PreToolUse hook is considered **blocking** if its source contains any
`process.exit(N)` with `N !== 0`, or if it writes a `decision: "block"`
field to its stdout JSON. Patchers are not expected to lint hook source;
this is a documentation contract that plugin authors honor.

Today, none of the agent-init, thrift, or (planned) floor hooks block.
If that ever changes, this section is the gatekeeper.

---

## 7. Reference implementation

The canonical implementation lives at:

`plugins/harness-thrift/skills/thrift/lib/settings-patcher.mjs`

### Key exports

| Function | Responsibility |
|---|---|
| `patchSettings({settingsPath, hooksToAdd, dryRun})` | Append-only patcher. Returns `{applied, skipped, current}`. |
| `unpatchSettings({settingsPath, sentinel, dryRun})` | Sentinel-based remover. Returns `{removed, current}`. |
| `buildStandardThriftHooks({hooksDir})` | Convenience factory that produces the canonical thrift hooks-to-add map. Other plugins should expose an equivalent `buildStandard<Family>Hooks` factory. |
| `alreadyRegistered(existingEntries, newEntry)` (internal) | Idempotency check via command-path equality. |

### Recommendation for other plugins

**Vendor this file** via `scripts/sync-lib.mjs` (or an equivalent
vendoring script) into the new plugin's `lib/` directory. Do NOT
reimplement. The shared semantics are the entire point of this spec;
divergent implementations defeat the contract.

A new plugin only needs to:

1. Copy `settings-patcher.mjs` into its own `lib/`.
2. Override the `DEFAULT_SENTINEL` regex constant with its own family
   sentinel (see §3).
3. Provide a `buildStandard<Family>Hooks` factory that returns the
   `hooksToAdd` map.

Everything else — atomic write, idempotency, refuse-on-unparseable,
unpatch isolation — is inherited.

---

## 8. Testing requirements

Every plugin that registers hooks MUST have the following tests. Place
them next to the patcher (e.g., `lib/settings-patcher.test.mjs`).

### Mandatory cases

1. **Idempotency.** Call `patchSettings` twice with the same input on a
   fresh `settings.local.json`. The second call returns `{applied: 0,
   skipped: N}` where N is the count from the first call. File content
   is byte-identical after second call.
2. **Preservation.** Pre-populate `settings.local.json` with hook
   entries from a *different* sentinel (simulate another plugin already
   installed). Call `patchSettings`. Assert: original entries still
   present, this plugin's entries appended after them.
3. **Unpatch isolation.** With both this plugin's entries and another
   plugin's entries present, call `unpatchSettings` with this plugin's
   sentinel. Assert: only this plugin's entries removed; other entries
   untouched; empty event arrays pruned.
4. **Sentinel regex.** Walk every command this plugin registers; assert
   the sentinel matches all of them. Then run the sentinel against the
   command paths of every OTHER plugin's hooks (use the registry in §3
   as the corpus); assert zero false-positive matches.
5. **Refuse on unparseable.** Pre-populate `settings.local.json` with
   invalid JSON. Call `patchSettings`. Assert: throws with the file
   path in the error message; file content unchanged.
6. **Atomic write.** Simulate a crash mid-write (e.g., by making the
   final `renameSync` throw via a stub). Assert: original file
   unchanged.

### Recommended cases

7. Dry-run does not write.
8. Missing settings file is treated as empty (creates new file with
   only this plugin's entries on first patch).
9. Concurrent patcher invocations (two patches racing) — last write
   wins, but no torn JSON.

---

## 9. Migration plan

### For the external `context-mode` plugin

The context-mode plugin ships with its own hooks via the marketplace
cache (`~/.claude/plugins/cache/context-mode@context-mode/...`). It
predates this spec and does not (yet) follow the sentinel-based
unpatch protocol.

**Recommendation:** the plugin should adopt the
`context-mode-.*\.m?js` sentinel for its hook command paths. Until it
does, thrift's `thrift-.*\.m?js` and floor's `floor-.*\.m?js`
sentinels do not collide with context-mode's command paths (the cache
path itself contains `context-mode@context-mode` but the script names
do not currently start with `thrift-` or `floor-`), so this spec is
**backward compatible** without any change on context-mode's side.

### For `agent-init`

Agent-init already writes stable command paths
(`context-mode-router.mjs`, `session-summary.mjs`, `cache-heal.mjs`).
Formalize the sentinel as:

```
(context-mode-router|session-summary|cache-heal)\.mjs
```

Future agent-init revisions that add new hooks must extend this
sentinel and bump it in §3.

The migration is **documentation-only** today — no template changes
required — because the existing names already satisfy the contract.

### For `harness-thrift`

Already compliant. The implementation in
`plugins/harness-thrift/skills/thrift/lib/settings-patcher.mjs` is the
reference for this spec. No migration needed.

### For `harness-floor` (visual-qa, agent-all)

No hooks today. When the first floor hook lands:

1. Vendor `settings-patcher.mjs` into `plugins/harness-floor/skills/<skill>/lib/`.
2. Set `DEFAULT_SENTINEL = /floor-.*\.m?js/` (or `/floor-vqa-.*\.m?js/`
   for visual-qa specifically).
3. Add the testing suite from §8.
4. Update the registry in §3.

### For future plugins (anywhere in this repo)

MUST follow this spec from day 1. PRs that register hooks without a
sentinel, without an unpatch, or with head-insert behavior should be
blocked in review.

---

## 10. Open questions

These gate a revision of this spec. Document answers as we discover
them.

1. **Does CC support hook ordering hints (priority numbers)?**
   This spec relies on **array order** as the sole ordering signal.
   If CC adds explicit `priority` or `before`/`after` fields, the
   append-only contract loses its meaning and we should re-derive the
   ordering rules. Open until confirmed against a CC release that
   either adds such fields or commits to never adding them.

2. **Do hooks observe each other's state changes within the same event?**
   If hook A writes a file during `PreToolUse(Bash)` and hook B reads
   that file in the same event, is hook B guaranteed to see A's write?
   Specifically: are hooks invoked **serially** (next hook starts after
   previous hook's process exits) or **concurrently**? Our position
   ordering only matters if serial. The spike (§spike.md) assumes
   serial; this needs runtime confirmation.

3. **How does `Notification` deliver to the user?**
   When multiple Notification hooks fire, does the user see one merged
   notification, one per hook, or only the first? If the latter, the
   "first-come-first-served" rule in §2 becomes "first hook wins,
   subsequent are silent" — different semantics, different design.

4. **Does `SessionEnd` reliably fire on SIGTERM / `Ctrl-C`?**
   Thrift's audit hook depends on it. If SessionEnd misses on abnormal
   termination, audit must reconstruct from in-memory state flushed on
   every PostToolUse — that's already the thrift design but it's worth
   confirming as part of accepting this spec.

5. **Are hooks merged across all three settings layers, or does the
   highest-precedence layer replace lower layers entirely?**
   This spec assumes **merge** (entries from all layers concatenate
   into one array per event). If CC behavior is replace, the entire
   layering policy in §5 needs revision.

---

## 11. Acceptance criteria

A plugin satisfies this protocol when ALL of the following hold:

- [ ] Uses a unique sentinel registered in §3.
- [ ] Settings patcher is **append-only** (never inserts at head, never
      modifies/removes entries owned by other plugins).
- [ ] Settings patcher **refuses** to touch unparseable
      `settings.local.json` (throws with file path in error).
- [ ] Settings patcher has an idempotency test (§8.1).
- [ ] Settings patcher has a preservation test (§8.2).
- [ ] Settings patcher has an unpatch-isolation test (§8.3).
- [ ] Settings patcher has a sentinel-regex test (§8.4).
- [ ] Does NOT write to `~/.claude/settings.json`.
- [ ] Does NOT write to `.claude/settings.json` (agent-init excepted
      for the baseline three only).
- [ ] Hook command paths use the family sentinel naming convention.
- [ ] No blocking PreToolUse hooks added at a position other than 1
      for the matched tool.
- [ ] Documentation: the plugin's SKILL.md (or equivalent) lists the
      hooks it registers and links to this spec.

A plugin family is **conformant** when every plugin in the family
satisfies all of the above. Today:

- **agent-init:** conformant (documentation-only migration).
- **harness-thrift:** conformant (reference implementation).
- **harness-floor:** N/A (no hooks yet); conformant by the empty set.

---

## 12. References

- Spike: `docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md`
- Reference patcher: `plugins/harness-thrift/skills/thrift/lib/settings-patcher.mjs`
- Baseline hooks template: `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs`
- Thrift hook templates: `plugins/harness-thrift/skills/thrift/templates/hooks/`
- agent-init CLAUDE.md hook section: `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs`
