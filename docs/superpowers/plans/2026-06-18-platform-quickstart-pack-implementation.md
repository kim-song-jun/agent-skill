# Platform Quickstart Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a documentation-only platform Quickstart Pack that lets users choose a host, install the matching `agent-skill` bundle, and verify host-level plugin/skill visibility before moving to `/agent-init`.

**Architecture:** Add a quickstart overview plus one English and one Korean page per supported host. Guard the new docs with release-doc contract tests and existing markdown link validation. Do not change installer, doctor, hook, or runtime behavior in this slice.

**Tech Stack:** Markdown docs, Node `node:test`, existing `tests/lib/release-doc-contract.test.mjs`, existing `scripts/docs-structure-check.mjs`.

## Global Constraints

- This implementation is documentation-only except for release-doc contract tests.
- Supported hosts: Claude Code, Codex CLI, Copilot CLI, Cursor, Gemini CLI, VS Code Copilot.
- Quickstarts stop at host-level plugin/skill install verification.
- Quickstarts must link to `/agent-init` usage as the next step instead of explaining project-local initialization in full.
- English and Korean mirrors must be created in the same change.
- Do not promise hard hooks on hosts where the release surface is prompt-level, sequential, soft, or instructions-only.
- Do not expose platform-suffixed public slash commands such as `/agent-all-codex`.
- Preserve shared-worktree git safety: no `git stash`, no branch switching, no `git add -A`, and commit only explicit pathspecs.

---

## File Structure

Create:

- `docs/quickstart/README.md`: English platform decision table and entrypoint.
- `docs/quickstart/README.ko.md`: Korean platform decision table and entrypoint.
- `docs/quickstart/claude.md`: Claude Code install and shortest verification path.
- `docs/quickstart/claude.ko.md`: Korean Claude Code quickstart.
- `docs/quickstart/codex.md`: Codex CLI install and shortest verification path.
- `docs/quickstart/codex.ko.md`: Korean Codex CLI quickstart.
- `docs/quickstart/copilot.md`: Copilot CLI install and shortest verification path.
- `docs/quickstart/copilot.ko.md`: Korean Copilot CLI quickstart.
- `docs/quickstart/cursor.md`: Cursor install and shortest verification path.
- `docs/quickstart/cursor.ko.md`: Korean Cursor quickstart.
- `docs/quickstart/gemini.md`: Gemini CLI install and shortest verification path.
- `docs/quickstart/gemini.ko.md`: Korean Gemini CLI quickstart.
- `docs/quickstart/vscode-copilot.md`: VS Code Copilot instructions-only install path.
- `docs/quickstart/vscode-copilot.ko.md`: Korean VS Code Copilot quickstart.

Modify:

- `README.md`: add a concise first-time install pointer to `docs/quickstart/README.md`.
- `README.ko.md`: add a concise first-time install pointer to `docs/quickstart/README.ko.md`.
- `tests/lib/release-doc-contract.test.mjs`: add Quickstart Pack contract coverage.

Validation:

- `node --test tests/lib/release-doc-contract.test.mjs`
- `node scripts/docs-structure-check.mjs`
- `node --test` if the focused checks pass.

---

## Task 1: Add Quickstart Release-Doc Contract

**Files:**
- Modify: `tests/lib/release-doc-contract.test.mjs`

**Interfaces:**
- Consumes: existing `read(path)` helper in `tests/lib/release-doc-contract.test.mjs`.
- Produces: one new `node:test` test named `platform quickstarts provide install and verify paths`.

- [ ] **Step 1: Add the failing test**

Insert this test after the existing positioning-docs test:

```js
test("platform quickstarts provide install and verify paths", () => {
  const platforms = [
    { slug: "claude", label: /Claude Code/i, ko: /Claude Code|클로드/i },
    { slug: "codex", label: /Codex CLI/i, ko: /Codex CLI|코덱스/i },
    { slug: "copilot", label: /Copilot CLI/i, ko: /Copilot CLI|코파일럿/i },
    { slug: "cursor", label: /Cursor/i, ko: /Cursor|커서/i },
    { slug: "gemini", label: /Gemini CLI/i, ko: /Gemini CLI|제미나이/i },
    { slug: "vscode-copilot", label: /VS Code Copilot/i, ko: /VS Code Copilot|VS Code 코파일럿/i },
  ];

  const overview = read("docs/quickstart/README.md");
  assert.match(overview, /^# Platform Quickstart$/m);
  assert.match(overview, /Korean: \[README\.ko\.md\]/);
  assert.match(overview, /Install Decision Table/);
  assert.match(overview, /\/agent-init/);

  const overviewKo = read("docs/quickstart/README.ko.md");
  assert.match(overviewKo, /^# 플랫폼 Quickstart$/m);
  assert.match(overviewKo, /English: \[README\.md\]/);
  assert.match(overviewKo, /설치 결정표/);
  assert.match(overviewKo, /\/agent-init/);

  for (const platform of platforms) {
    assert.match(overview, new RegExp(`\\(${platform.slug}\\.md\\)`), `overview links ${platform.slug}.md`);
    assert.match(overviewKo, new RegExp(`\\(${platform.slug}\\.ko\\.md\\)`), `Korean overview links ${platform.slug}.ko.md`);

    const english = read(`docs/quickstart/${platform.slug}.md`);
    assert.match(english, platform.label);
    assert.match(english, /^## Install$/m);
    assert.match(english, /^## Verify$/m);
    assert.match(english, /^## Installed Means$/m);
    assert.match(english, /^## Next Step$/m);
    assert.match(english, /\/agent-init/);
    assert.match(english, /\.ko\.md\)/);
    assert.doesNotMatch(english, /\/(?:agent-init|agent-all|visual-qa|thrift|debug)-(?:codex|copilot|cursor|gemini)\b/);

    const korean = read(`docs/quickstart/${platform.slug}.ko.md`);
    assert.match(korean, platform.ko);
    assert.match(korean, /^## 설치$/m);
    assert.match(korean, /^## 확인$/m);
    assert.match(korean, /^## 설치 완료의 의미$/m);
    assert.match(korean, /^## 다음 단계$/m);
    assert.match(korean, /\/agent-init/);
    assert.match(korean, /\.md\)/);
    assert.doesNotMatch(korean, /\/(?:agent-init|agent-all|visual-qa|thrift|debug)-(?:codex|copilot|cursor|gemini)\b/);
  }

  for (const path of ["README.md", "README.ko.md"]) {
    assert.match(read(path), /docs\/quickstart\/README/);
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/lib/release-doc-contract.test.mjs
```

Expected result: FAIL because `docs/quickstart/README.md` does not exist yet.

- [ ] **Step 3: Do not commit yet**

Leave the failing test in the working tree for Task 2 and Task 3 to satisfy.

---

## Task 2: Create English Quickstart Pages

**Files:**
- Create: `docs/quickstart/README.md`
- Create: `docs/quickstart/claude.md`
- Create: `docs/quickstart/codex.md`
- Create: `docs/quickstart/copilot.md`
- Create: `docs/quickstart/cursor.md`
- Create: `docs/quickstart/gemini.md`
- Create: `docs/quickstart/vscode-copilot.md`

**Interfaces:**
- Consumes: quickstart contract test from Task 1.
- Produces: English quickstart pages with stable headings `Install`, `Verify`, `Installed Means`, and `Next Step`.

- [ ] **Step 1: Create `docs/quickstart/README.md`**

Use this structure:

```md
> Korean: [README.ko.md](README.ko.md)

# Platform Quickstart

Use this page when you only need to install `agent-skill` for your agent host
and confirm that the host-level plugin or skill surface is visible.

This quickstart stops before project initialization. After your platform
verifies, continue with `/agent-init` in [Usage](../USAGE.md).

## Install Decision Table

| Host | Use this quickstart | What it verifies |
|---|---|---|
| Claude Code | [Claude Code](claude.md) | Claude plugin marketplace install is visible |
| Codex CLI | [Codex CLI](codex.md) | Codex plugin bundle and skills are installed |
| Copilot CLI | [Copilot CLI](copilot.md) | Copilot scaffold bundle is installed |
| Cursor | [Cursor](cursor.md) | Cursor rules and skill assets are installed |
| Gemini CLI | [Gemini CLI](gemini.md) | Gemini settings/rules assets are installed |
| VS Code Copilot | [VS Code Copilot](vscode-copilot.md) | Instructions-only assets are installed |

## Next Step

After host-level install verification, run `/agent-init` in the project where
you want the harness scaffold. See [Usage](../USAGE.md) for the project-local
flow and [Harness Positioning](../HARNESS_POSITIONING.md) for comparison with
other harnesses.
```

- [ ] **Step 2: Create `docs/quickstart/claude.md`**

Use concise content with these commands:

```md
> Korean: [claude.ko.md](claude.ko.md)

# Claude Code Quickstart

Scope: install the Claude Code plugin bundle and confirm that Claude can see
the installed `agent-skill` plugins.

## Install

```bash
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/plugin install harness-data@agent-skill
```

## Verify

```bash
cat ~/.claude/plugins/installed_plugins.json | python3 -m json.tool | grep -B1 agent-skill
```

## Installed Means

Claude Code can see the selected marketplace plugins. Project files are not
created until you run `/agent-init` inside a target repository.

## Next Step

Open the project you want to harness and run `/agent-init`. See
[Usage](../USAGE.md) for project-local setup.
```

- [ ] **Step 3: Create `docs/quickstart/codex.md`**

Use concise content with the source-checkout install path:

```md
> Korean: [codex.ko.md](codex.ko.md)

# Codex CLI Quickstart

Scope: install the Codex CLI bundle and confirm that Codex skill directories
are present. Codex uses the canonical public command names, while runtime
dispatch follows Codex's current skill and prompt-level surfaces.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --cli=codex
```

## Verify

```bash
find ~/.codex/plugins/cache/agent-skill -maxdepth 4 -name SKILL.md | sort | grep -E '/(agent-all|visual-qa|thrift|debug)/SKILL.md'
```

## Installed Means

Codex can load the installed `agent-skill` plugin bundle from its local plugin
cache. Target repository files are not created until `/agent-init` is run in a
project.

## Next Step

Open the project you want to harness and run `/agent-init`. See
[Usage](../USAGE.md) for project-local setup.
```

- [ ] **Step 4: Create `docs/quickstart/copilot.md`**

Use concise content:

```md
> Korean: [copilot.ko.md](copilot.ko.md)

# Copilot CLI Quickstart

Scope: install the Copilot CLI scaffold bundle and confirm that the plugin
assets are present. This does not imply Claude-native hook enforcement.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --cli=copilot
```

## Verify

```bash
find ~/.codex/plugins/cache/agent-skill -maxdepth 4 -path '*copilot*' -name SKILL.md | sort
```

## Installed Means

The Copilot-oriented `agent-skill` assets are available locally. Project files
are created later by `/agent-init` in the target repository.

## Next Step

Open the project you want to harness and run `/agent-init`. See
[Usage](../USAGE.md) for project-local setup.
```

- [ ] **Step 5: Create `docs/quickstart/cursor.md`**

Use concise content:

```md
> Korean: [cursor.ko.md](cursor.ko.md)

# Cursor Quickstart

Scope: install the Cursor scaffold bundle and confirm that Cursor-oriented
rules and skill assets are present.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --cli=cursor
```

## Verify

```bash
find ~/.codex/plugins/cache/agent-skill -maxdepth 4 -path '*cursor*' -name SKILL.md | sort
```

## Installed Means

The Cursor-oriented `agent-skill` assets are available locally. Enforcement
strength depends on the host surfaces Cursor exposes for the target project.

## Next Step

Open the project you want to harness and run `/agent-init`. See
[Usage](../USAGE.md) for project-local setup.
```

- [ ] **Step 6: Create `docs/quickstart/gemini.md`**

Use concise content:

```md
> Korean: [gemini.ko.md](gemini.ko.md)

# Gemini CLI Quickstart

Scope: install the Gemini CLI scaffold bundle and confirm that Gemini-oriented
settings, rules, and skill assets are present.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --cli=gemini
```

## Verify

```bash
find ~/.codex/plugins/cache/agent-skill -maxdepth 4 -path '*gemini*' -name SKILL.md | sort
```

## Installed Means

The Gemini-oriented `agent-skill` assets are available locally. MCP/settings
integration remains host-specific and is not Claude-style hook parity.

## Next Step

Open the project you want to harness and run `/agent-init`. See
[Usage](../USAGE.md) for project-local setup.
```

- [ ] **Step 7: Create `docs/quickstart/vscode-copilot.md`**

Use concise content:

```md
> Korean: [vscode-copilot.ko.md](vscode-copilot.ko.md)

# VS Code Copilot Quickstart

Scope: install the VS Code Copilot instructions-only surface and confirm that
the local assets are present.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=vscode-copilot --target=/path/to/my-project
```

## Verify

```bash
find /path/to/my-project -maxdepth 4 -iname '*copilot*' -o -iname 'AGENTS.md'
```

## Installed Means

VS Code Copilot receives instructions-only guidance in the target project. The
current release does not provide runtime hook enforcement for this host.

## Next Step

Review the generated project instructions, then continue with the relevant
recipes in [Usage](../USAGE.md).
```

- [ ] **Step 8: Run the focused test**

Run:

```bash
node --test tests/lib/release-doc-contract.test.mjs
```

Expected result after Task 2: still FAIL because Korean mirror pages do not
exist yet.

---

## Task 3: Create Korean Quickstart Mirrors

**Files:**
- Create: `docs/quickstart/README.ko.md`
- Create: `docs/quickstart/claude.ko.md`
- Create: `docs/quickstart/codex.ko.md`
- Create: `docs/quickstart/copilot.ko.md`
- Create: `docs/quickstart/cursor.ko.md`
- Create: `docs/quickstart/gemini.ko.md`
- Create: `docs/quickstart/vscode-copilot.ko.md`

**Interfaces:**
- Consumes: English quickstart docs from Task 2.
- Produces: Korean mirror pages using the same stable headings required by the test: `설치`, `확인`, `설치 완료의 의미`, `다음 단계`.

- [ ] **Step 1: Create `docs/quickstart/README.ko.md`**

Use this structure:

```md
> English: [README.md](README.md)

# 플랫폼 Quickstart

agent host에 `agent-skill`을 설치하고 host-level plugin 또는 skill surface가
보이는지만 빠르게 확인할 때 사용합니다.

이 Quickstart는 프로젝트 초기화 전까지만 다룹니다. 플랫폼 확인이 끝나면
[사용법](../USAGE.ko.md)의 `/agent-init` 단계로 이동하세요.

## 설치 결정표

| Host | Quickstart | 확인하는 것 |
|---|---|---|
| Claude Code | [Claude Code](claude.ko.md) | Claude plugin marketplace 설치가 보이는지 |
| Codex CLI | [Codex CLI](codex.ko.md) | Codex plugin bundle과 skill 설치 여부 |
| Copilot CLI | [Copilot CLI](copilot.ko.md) | Copilot scaffold bundle 설치 여부 |
| Cursor | [Cursor](cursor.ko.md) | Cursor rules와 skill asset 설치 여부 |
| Gemini CLI | [Gemini CLI](gemini.ko.md) | Gemini settings/rules asset 설치 여부 |
| VS Code Copilot | [VS Code Copilot](vscode-copilot.ko.md) | instructions-only asset 설치 여부 |

## 다음 단계

host-level 설치 확인이 끝나면 하네스를 적용할 프로젝트에서 `/agent-init`을
실행하세요. 프로젝트별 흐름은 [사용법](../USAGE.ko.md), 다른 하네스와의 비교는
[하네스 포지셔닝](../HARNESS_POSITIONING.ko.md)을 보세요.
```

- [ ] **Step 2: Create Korean platform pages**

For every Korean platform page, preserve the same four headings and mirror
link. Use the matching commands from the English page. The page body must
state that project files are not created until `/agent-init`, except
`vscode-copilot.ko.md`, which installs directly into a target project and
therefore should say that runtime hook enforcement is not provided.

Required page titles:

```md
# Claude Code Quickstart
# Codex CLI Quickstart
# Copilot CLI Quickstart
# Cursor Quickstart
# Gemini CLI Quickstart
# VS Code Copilot Quickstart
```

Required section headings for each page:

```md
## 설치
## 확인
## 설치 완료의 의미
## 다음 단계
```

Required mirror links:

```md
> English: [claude.md](claude.md)
> English: [codex.md](codex.md)
> English: [copilot.md](copilot.md)
> English: [cursor.md](cursor.md)
> English: [gemini.md](gemini.md)
> English: [vscode-copilot.md](vscode-copilot.md)
```

- [ ] **Step 3: Run the focused test**

Run:

```bash
node --test tests/lib/release-doc-contract.test.mjs
```

Expected result after Task 3: FAIL only on README links because Task 4 has not
updated README files yet.

---

## Task 4: Wire README Links, Validate, and Commit

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`
- Modify: `tests/lib/release-doc-contract.test.mjs`
- Create: all `docs/quickstart/*.md` files from Tasks 2 and 3

**Interfaces:**
- Consumes: quickstart docs from Tasks 2 and 3.
- Produces: README entrypoint links and passing documentation checks.

- [ ] **Step 1: Add README quickstart pointer**

In `README.md`, near the existing first-time installation guidance, add this
short paragraph before the long install reference:

```md
New installer? Start with the [Platform Quickstart](docs/quickstart/README.md)
to choose Claude, Codex, Copilot, Cursor, Gemini, or VS Code Copilot and verify
the host-level install before running `/agent-init`.
```

In `README.ko.md`, add the Korean equivalent:

```md
처음 설치한다면 먼저 [플랫폼 Quickstart](docs/quickstart/README.ko.md)에서
Claude, Codex, Copilot, Cursor, Gemini, VS Code Copilot 중 자신의 host를
고르고 host-level 설치를 확인한 뒤 `/agent-init`으로 넘어가세요.
```

- [ ] **Step 2: Run focused documentation contract tests**

Run:

```bash
node --test tests/lib/release-doc-contract.test.mjs
```

Expected result: PASS.

- [ ] **Step 3: Run markdown link validation**

Run:

```bash
node scripts/docs-structure-check.mjs
```

Expected result: PASS, including local markdown link resolution.

- [ ] **Step 4: Run full tests if focused checks pass**

Run:

```bash
node --test
```

Expected result: PASS. The test count will increase by one if Task 1 adds one
new test. If the release-smoke count contract fails because the focused test
count increased, update the release-smoke and public verification count
contracts in the same change, then rerun `node --test`.

- [ ] **Step 5: Inspect the diff**

Run:

```bash
git diff --check
git diff --stat
git status --short --branch
```

Expected result: no whitespace errors; only README, quickstart docs, and
release-doc contract tests changed.

- [ ] **Step 6: Commit with explicit pathspecs**

Run:

```bash
git add README.md README.ko.md tests/lib/release-doc-contract.test.mjs docs/quickstart/README.md docs/quickstart/README.ko.md docs/quickstart/claude.md docs/quickstart/claude.ko.md docs/quickstart/codex.md docs/quickstart/codex.ko.md docs/quickstart/copilot.md docs/quickstart/copilot.ko.md docs/quickstart/cursor.md docs/quickstart/cursor.ko.md docs/quickstart/gemini.md docs/quickstart/gemini.ko.md docs/quickstart/vscode-copilot.md docs/quickstart/vscode-copilot.ko.md
git commit -m "Add platform quickstart docs" -- README.md README.ko.md tests/lib/release-doc-contract.test.mjs docs/quickstart/README.md docs/quickstart/README.ko.md docs/quickstart/claude.md docs/quickstart/claude.ko.md docs/quickstart/codex.md docs/quickstart/codex.ko.md docs/quickstart/copilot.md docs/quickstart/copilot.ko.md docs/quickstart/cursor.md docs/quickstart/cursor.ko.md docs/quickstart/gemini.md docs/quickstart/gemini.ko.md docs/quickstart/vscode-copilot.md docs/quickstart/vscode-copilot.ko.md
git show --stat --oneline HEAD
```

Expected result: commit includes only the intended README, quickstart docs, and
release-doc contract test files.

---

## Self-Review Checklist

- Spec coverage:
  - overview plus platform pages: Tasks 2 and 3
  - English and Korean mirrors: Tasks 2 and 3
  - install/verify sections: Tasks 2 and 3
  - README routing: Task 4
  - drift guards: Task 1
  - no runtime changes: all tasks are docs/tests only
- Placeholder scan:
  - The plan contains no unresolved placeholder markers or deferred-work
    markers.
- Scope check:
  - Technical follow-ups from the design spec are not implemented here. They
    remain separate work for runtime capability, cross-host parity, governance,
    and positioning phases.
