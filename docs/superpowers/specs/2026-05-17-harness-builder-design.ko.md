> 🇺🇸 English: [2026-05-17-harness-builder-design.md](2026-05-17-harness-builder-design.md)

# Harness Builder 스킬 — 설계 스펙

**상태:** 승인됨 (브레인스토밍 완료, 계획 대기 중)
**날짜:** 2026-05-17
**작성자:** kimsongjun (sungjun@molcube.com)
**테마:** 3개 중 A (프로젝트별 하네스 빌더)

**참고 (2026-05-18):** `/harness-init`은 harness-builder v0.2.0에서 `/agent-init`으로 이름이 변경되었습니다. 아래 참고 사항은 원래 설계를 반영하며 해당 시점에서 정확합니다. 현재 코드에서는 `harness-init`과 `agent-init`을 같은 스킬로 취급하세요.

---

## 1. 목적

신규 프로젝트 내에서 호출될 때 완전한 에이전트 하네스를 부트스트랩하는 단일 Claude Code 스킬 — `/agent-init` — 을 제공합니다:

- `CLAUDE.md` (프로젝트 메모리, 에이전트 인덱스)
- `.claude/agents/*.md` (플래너 / 개발자 / 디자이너 / QA-* / 테스터 / 검토자)
- `.claude/hooks/*.mjs` (context-mode 라우터, 세션 요약, 캐시 복구)
- `.claude/settings.local.json` (훅 + 권한 등록)
- `docs/superpowers/{specs,plans}/`, `docs/decisions/`, `docs/tasks/` (작업 산출물 폴더)

생성되는 모든 산출물은 프롬프트에서 세 가지 운영 원칙을 인코딩합니다:

1. 모든 산출물 전에 `superpowers:brainstorming`을 호출합니다.
2. 독립적인 소작업 2개 이상을 분산하기 전에 `superpowers:dispatching-parallel-agents` (또는 `subagent-driven-development`)을 호출합니다.
3. 출력이 약 20줄을 초과할 수 있는 명령의 경우 원시 Bash 대신 `context-mode` (`ctx_batch_execute`)를 선호합니다.

스킬 자체는 실행할 때 동일한 세 가지 원칙을 따릅니다.

## 2. 비목표

- 애플리케이션 코드, 스키마 또는 비즈니스 로직 생성기가 아님 — 작업 주변의 *하네스만* 해당합니다.
- `claude-md-improver`의 대체품이 아님 — 기존 CLAUDE.md 파일을 소급 적용하지 않음 (`--merge` 대신 제공).
- CI/CD 설치 프로그램이 아님 — 생성된 훅은 git pre-commit 훅이 아닌 로컬 Claude Code 훅입니다.
- 외부 플러그인을 설치 또는 업데이트하지 않음 — 정확한 명령을 표시하고 사용자가 실행하도록 요청합니다.

## 3. 입력 / 출력

**입력 (암시적):** 대상 프로젝트 작업 디렉토리, git 상태, 매니페스트 파일 (package.json, pyproject.toml, Cargo.toml, go.mod), README 첫 번째 문단, 기존 `enabledPlugins` / `installed_plugins.json`.

**입력 (명시적 플래그):**
- `--force` — 모든 단계를 다시 실행하고 기존 하네스 산출물을 덮어씁니다.
- `--merge` — 기존 `CLAUDE.md`를 유지하고 하네스 섹션을 추가합니다.
- `--dry-run` — 작성될 모든 결정 및 파일 경로를 출력합니다. 아무것도 작성하지 않습니다.
- `--resume` — `.claude/.agent-init-state.json`에서 완료로 표시된 단계를 건너뜁니다.
- `--size=small|medium|large` — 자동 추론된 에이전트 팀 크기를 재정의합니다.
- `--qa=<persona>[,<persona>]` — 자동 추론된 QA 페르소나 목록을 재정의합니다.

**출력 (프로젝트당):**

```
my-project/
├── CLAUDE.md
├── .claude/
│   ├── agents/
│   │   ├── planner.md
│   │   ├── dev.md
│   │   ├── reviewer.md
│   │   ├── designer.md            # medium+
│   │   ├── qa-{persona}.md        # medium+
│   │   ├── tester.md              # medium+
│   │   ├── frontend-dev.md        # large
│   │   ├── backend-dev.md         # large
│   │   └── doc-writer.md          # large
│   ├── hooks/
│   │   ├── context-mode-router.mjs
│   │   ├── session-summary.mjs
│   │   └── cache-heal.mjs
│   ├── settings.local.json
│   └── .agent-init-state.json        # .gitignore됨
└── docs/
    ├── superpowers/specs/
    ├── superpowers/plans/
    ├── decisions/
    └── tasks/
```

## 4. 아키텍처

### 4.1 리포 레이아웃

`C:\Users\kinso\Documents\molcube\agent-skill\`의 리포는 현재 한 개의 플러그인 (`harness-builder`)을 포함하는 Claude Code 플러그인 마켓플레이스입니다. 향후 테마 B와 C가 형제 플러그인을 추가합니다.

```
agent-skill/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── skills/
│   └── harness-init/
│       ├── SKILL.md
│       ├── phases/
│       │   ├── 1-discover.md
│       │   ├── 2-claude-md.md
│       │   ├── 3-agents.md
│       │   ├── 4-hooks.md
│       │   └── 5-wire.md
│       ├── lib/
│       │   ├── render.mjs              # 템플릿 렌더링 (순수)
│       │   ├── manifest-merge.mjs      # settings.local.json 병합 (순수)
│       │   ├── detect-stack.mjs        # 매니페스트 기반 스택 감지 (순수)
│       │   └── plugin-scan.mjs         # installed_plugins.json 분류 (순수)
│       ├── templates/
│       │   ├── CLAUDE.md.hbs
│       │   ├── agents/
│       │   │   ├── planner.md.hbs
│       │   │   ├── dev.md.hbs
│       │   │   ├── designer.md.hbs
│       │   │   ├── qa.md.hbs
│       │   │   ├── tester.md.hbs
│       │   │   ├── reviewer.md.hbs
│       │   │   ├── frontend-dev.md.hbs
│       │   │   ├── backend-dev.md.hbs
│       │   │   └── doc-writer.md.hbs
│       │   ├── hooks/
│       │   │   ├── context-mode-router.mjs
│       │   │   ├── session-summary.mjs
│       │   │   └── cache-heal.mjs
│       │   └── settings.local.json.hbs
│       └── references/
│           └── legacy-notes.md
├── hooks/
│   └── context-mode-cache-heal.mjs   # ~/.claude/hooks/에서 마이그레이션된 전역 훅
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── README.md
└── CHANGELOG.md
```

`SKILL.md`는 의도적으로 가볍습니다 (≤ 150줄): 단계를 이름 지정하고 `phases/*.md`를 가리킵니다. 각 단계 파일은 `Read`를 통해 필요시 로드되어 스킬 도구 로드 비용을 낮게 유지합니다. 결정론적 메커니즘 (템플릿 렌더링, 설정 병합, 스택 감지, 플러그인 스캔)은 `skills/agent-init/lib/`의 순수 JS 모듈로 존재하므로 Claude Code를 생성하지 않고도 단위 테스트 가능합니다.

### 4.2 플러그인 매니페스트

`.claude-plugin/marketplace.json`은 한 개의 플러그인 소스를 등록하므로 사용자는 한 번 `/plugin marketplace add <git-url>`을 수행할 수 있습니다.

`.claude-plugin/plugin.json`은 다음을 등록합니다:
- `skills`: `skills/agent-init/`
- `hooks`: `hooks/context-mode-cache-heal.mjs` (전역, SessionStart)

### 4.3 단계 파이프라인

`/agent-init`은 단계를 엄격하게 순서대로 실행합니다. 각 단계는 `.claude/.agent-init-state.json`에 완료를 기록하므로 `--resume`이 중단 후 계속할 수 있습니다.

| 단계 | 이름 | 목적 | 병렬? |
|-------|------|---------|-----------|
| 0 | Preflight | git 확인, 충돌 확인, 종속성 스캔 | 아니오 |
| 1 | Discover | `superpowers:brainstorming` + 스택 감지 | 아니오 |
| 2 | CLAUDE.md | 템플릿 렌더링, 파일 작성 | 아니오 |
| 3 | Agents | 모든 역할 파일 렌더링 | **예** — `superpowers:dispatching-parallel-agents`를 통해 분산 |
| 4 | Hooks | 훅 파일 복사, `settings.local.json`에 등록 | 아니오 |
| 5 | Wire | 누락된 플러그인 설치 명령 노출, 커밋 | 아니오 |

역할 파일 렌더링에는 상호 종속성이 없고 병렬 작업이 벽시계 시간을 의미있게 단축하는 유일한 단계이므로 단계 3만 분산됩니다.

### 4.4 종속성 해결

단계 0은 `~/.claude/plugins/installed_plugins.json`과 활성 `settings.json` `enabledPlugins` 블록을 읽습니다. 플러그인은 세 개의 버킷으로 분류됩니다:

| 상태 | 작업 |
|-------|--------|
| 활성화됨 | 통과 |
| 설치됨 (비활성화됨) | 단계 5 출력에 참고 ("`/plugin enable …`" 실행) |
| 누락됨 | 단계 5 출력에 참고 ("`/plugin marketplace add …` 그 다음 `/plugin install …`" 실행) |

필수 플러그인 (사용자 요청에서만 중단, 자동 아님):
- `context-mode@context-mode`
- `superpowers@claude-plugins-official`

선택적 플러그인 (언급만):
- `frontend-design@claude-plugins-official`
- `codex@openai-codex`
- `claude-md-management@claude-plugins-official`

스킬은 `/plugin` 명령을 자체로 실행하지 않습니다. 명령을 출력하고 사용자가 실행할 때까지 기다립니다. 사용자가 확인하면 스킬이 최종 커밋을 작성합니다.

## 5. 컴포넌트 상세

### 5.1 단계 1 — Discover

`superpowers:brainstorming`을 사용하여 스킬 도구를 호출하여 다음과 정렬합니다:

- 프로젝트 목적 (CLAUDE.md 전문용 1-2문장)
- 크기 (small / medium / large) — 기본값은 LoC + 매니페스트 개수에서 추론, `--size`를 통해 재정의
- QA 페르소나 — README 용어, auth/payment/admin 라우트의 존재, ORM 스키마에서 추론; `--qa`를 통해 재정의
- 배포 대상 (vercel / cloudflare / docker / none)
- 특별 제약사항 (규정 준수, 성능 예산, …)

브레인스토밍 대화 중에 스킬은 동기적으로 매니페스트 파일을 읽어 스택을 감지합니다:

| 매니페스트 | 스택 |
|----------|-------|
| `package.json` + `tsconfig.json` | typescript |
| `package.json` 만 | javascript |
| `pyproject.toml` / `requirements.txt` | python |
| `Cargo.toml` | rust |
| `go.mod` | go |

스택은 템플릿 선택과 `dev.md` 에이전트의 도구 목록을 결정합니다.

단계 출력 (메모리 전용, 아직 디스크에 작성되지 않음): `{stack, size, qa_personas, deploy_targets, constraints, purpose}`.

### 5.2 단계 2 — CLAUDE.md

`templates/CLAUDE.md.hbs`를 단계 1 사전으로 렌더링합니다. 템플릿 섹션:

1. 프로젝트 목적 (Discover에서)
2. 스택 요약
3. 에이전트 인덱스 (이름 + 역할 + 호출 시점)
4. 운영 원칙 (세 가지 규칙)
5. 훅 요약 (각 훅이 하는 일, 어디서 찾을 수 있는지)
6. `docs/superpowers/specs/` 및 `docs/superpowers/plans/`로의 포인터

`CLAUDE.md`가 이미 존재하고 `--merge`가 설정된 경우: 끝에 "## Harness" 섹션을 추가합니다. `--merge`가 설정되지 않았는데 파일이 존재하는 경우: 단계 0이 이미 중단됩니다.

파일을 작성하지만 커밋하지 않습니다 (단계 5가 커밋을 처리합니다).

### 5.3 단계 3 — Agents

유일한 병렬 단계입니다. 스킬은 분산 전에 `superpowers:dispatching-parallel-agents`를 사용하여 스킬 도구를 호출한 다음 역할 템플릿과 단계 1 컨텍스트를 사용하여 역할당 하나의 부에이전트를 분산합니다.

각 역할 파일은 전문 정보에 세 가지 운영 원칙이 구워진 템플릿에서 생성되고 `## Rules` 섹션입니다.

크기별 역할 포함:
- `small`: planner, dev, reviewer
- `medium`: + designer, qa-{persona}…, tester
- `large`: + frontend-dev, backend-dev, doc-writer

`qa_personas`가 `medium`에서 비어있으면 단일 `qa-general.md`로 기본값을 설정합니다.

### 5.4 단계 4 — Hooks

`templates/hooks/`의 세 훅 파일을 프로젝트의 `.claude/hooks/`로 복사합니다:

| 파일 | 이벤트 | 동작 |
|------|-------|-----------|
| `context-mode-router.mjs` | `PreToolUse` (매처: `Bash`) | 명령이 20줄을 초과할 수 있을 때 `<context_guidance>` 팁을 내보냅니다 |
| `session-summary.mjs` | `Stop` | Markdown 결정 로그 항목을 `docs/decisions/YYYY-MM-DD-<slug>.md`에 작성합니다 |
| `cache-heal.mjs` | `SessionStart` | 플러그인 캐시 심볼릭 링크를 자체 복구합니다 (전역 훅의 프로젝트 범위 포트) |

그 다음 모든 세 훅을 등록하도록 `.claude/settings.local.json`을 작성/병합합니다. 기존 항목은 유지됩니다.

### 5.5 단계 5 — Wire

1. 단계 0의 종속성 해결 출력 (누락/비활성화된 플러그인 + 명령)을 노출합니다.
2. `.gitignore`을 업데이트하여 `.claude/.agent-init-state.json`을 추가합니다.
3. 단계 전체에서 작성된 모든 항목을 `git add`합니다.
4. 커밋을 생성합니다: `chore: bootstrap harness via /agent-init`.
5. 다음 단계가 포함된 성공 요약을 출력합니다 ("`/plan some-task`를 시도해보세요", "`.claude/agents/planner.md` 검토").

사용자가 아직 필수 플러그인을 설치하지 않은 경우, 커밋은 여전히 발생합니다 — 하네스는 기능이 감소되었지만 여전히 작동합니다.

## 6. 오류 처리

| 시나리오 | 동작 |
|----------|-----------|
| git 리포가 아님 | `git init` 제안을 출력합니다. 실행하지 않습니다. 중단합니다. |
| `CLAUDE.md` 존재, `--merge` / `--force` 없음 | `claude-md-improver` 또는 `--merge`를 추천하는 메시지와 함께 중단합니다. |
| `.claude/agents/<role>.md` 존재 | `--force` 아닌 경우 중단합니다. 의도적인 경우 `--force`를 제안합니다. |
| `.agent-init-state.json`에서 단계 N 완료라고 하지만 단계 N 산출물이 없음 | 손상된 것으로 취급합니다. `--force`를 요구하여 다시 실행합니다. |
| 런타임 시 훅 실행 실패 (예: cache-heal) | 훅 자체가 조용히 오류를 삼킵니다 (try/catch). 사용자의 워크플로우는 절대 차단되지 않습니다. |
| 외부 플러그인 설치 실패 | 스킬은 중단하지 않습니다. "수동으로 설치한 다음 `/agent-init --resume`을 실행합니다"를 출력합니다. |
| 사용자가 단계 5에서 플러그인 설치를 거부함 | 스킬은 경고와 함께 완료합니다. 하네스는 여전히 성능이 감소된 모드로 작동합니다. |

모든 오류 메시지는 다음 사용자 작업을 명시적으로 이름 지정합니다. 침묵한 실패가 없습니다.

## 7. 테스트 전략

### 7.1 라이브러리 테스트 (`tests/lib/`)

`skills/agent-init/lib/` 모듈은 순수 JS이고 직접 테스트 가능합니다. 실행기: Node.js 기본 테스트 실행기 (`node --test`). 종속성 없음.

| 모듈 | 테스트 |
|--------|------|
| `detect-stack.mjs` | 5개의 스택 고정 장치 (Node TS, Python, Rust, Go, monorepo)로 tmpdir을 시드하고 올바른 스택 id가 반환되는지 확인합니다. |
| `plugin-scan.mjs` | 합성 `installed_plugins.json` + `enabledPlugins` 블롭을 급여하고 올바른 분류 (enabled / disabled / missing)를 확인합니다. |
| `manifest-merge.mjs` | 이미 등록된 훅이 있는 기존 `settings.local.json`이 주어지면 새 훅 항목을 병합할 때 이전 항목을 보존하고 중복이 없는지 확인합니다. |
| `render.mjs` | 지원되는 스택 × 크기 조합당 1개씩 5개의 고정 장치 입력에 대해 모든 템플릿을 렌더링하고 출력을 스냅샷합니다. 의도하지 않은 템플릿 드리프트를 포착합니다. |

단계 프롬프트 (`phases/*.md`) 자체는 단위 테스트되지 않습니다. 수동 체크리스트 (§7.2)는 종단간 동작을 다룹니다.

### 7.2 수동 종단간 체크리스트 (`tests/manual-checklist.md`)

실제 Claude Code에 대해 신규 고정 장치 프로젝트에서 `/agent-init`을 실행하고 다음을 체크하세요:

- [ ] 단계 1이 실제로 `superpowers:brainstorming`을 트리거합니다
- [ ] 플래그 없이 다시 실행하는 것은 아무것도 하지 않습니다 (멱등성)
- [ ] `--force`는 처음부터 다시 빌드합니다
- [ ] `--dry-run`은 아무것도 작성하지 않습니다
- [ ] `--merge`는 기존 CLAUDE.md를 유지합니다
- [ ] 누락된 플러그인 출력은 정확한 명령을 나열합니다
- [ ] 단계 3이 실제로 병렬로 분산됩니다 (에이전트 로그에서 보임)
- [ ] 생성된 `planner.md`는 브레인스토밍을 참고합니다
- [ ] `.agent-init-state.json`은 `.gitignore`에 있습니다
- [ ] 최종 커밋 메시지는 `chore: bootstrap harness via /agent-init`과 일치합니다

수동 체크리스트는 각 릴리스 전에 실행되며 CI의 일부가 아닙니다.

### 7.3 범위 밖

- Claude Code의 훅 런타임을 모의하여 훅 동작을 종단간 테스트하기 (수동 체크리스트로 다룸).
- `/plugin install` 외부 흐름 테스트하기 (사용자 주도).

## 8. 예제

### 신규 Node 프로젝트에서 기본 부트스트랩

```
mkdir hello && cd hello && git init && npm init -y
/agent-init
```

결과:
- `CLAUDE.md` (52줄) - package.json에서 추론된 javascript 스택
- `.claude/agents/{planner,dev,reviewer}.md` (작은 크기 자동 추론)
- `.claude/hooks/{context-mode-router,session-summary,cache-heal}.mjs`
- `.claude/settings.local.json`
- `.visual-qa.json` (Floor 테마 기본값)
- `.agent-all.json` (Floor 테마 기본값)
- 1개 커밋: `chore: bootstrap harness via /agent-init`

### 기존 프로젝트에서 재실행

```
cd existing-project   # 이미 CLAUDE.md 있음
/agent-init --merge
```

기존 CLAUDE.md에 `## Harness` 섹션을 추가합니다.

### 크기 재정의

```
/agent-init --size=large --qa=auth,payment
```

9개 역할 명단 + 2개 QA 페르소나 파일을 생성합니다.

## 9. 향후 작업 (이 스펙의 범위 밖)

- **테마 B (토큰 비용 최적화)**: 적극적인 context-mode 패턴, 프롬프트 캐시 친화적인 템플릿, 요약 훅을 추가하는 형제 플러그인.
- **테마 C (비용 제한 없는 병렬 모드)**: 높은 처리량 반복을 위해 `agent-all` + `ralph-loop` + `codex:rescue`를 래핑하는 형제 플러그인.
- **`/harness-upgrade`**: 템플릿을 다시 가져오고 기존 하네스를 제자리에서 패치합니다.
- **텔레메트리 옵트인**: 사용자가 `--skip`하는 단계를 수집하여 향후 기본값을 알립니다.
