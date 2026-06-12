> 🇺🇸 English: [2026-05-17-agent-all-design.md](2026-05-17-agent-all-design.md)

# /agent-all 스킬 — 설계 스펙 (테마 C, 하위 스펙 C-2 + C-3)

**상태:** 승인됨 (브레인스토밍 완료, 계획 대기 중)
**날짜:** 2026-05-17
**작성자:** kimsongjun
**테마:** 3개 중 C (비용 제한 없는 패턴). C-2 및 C-3을 다루는 합친 하위 스펙.

**참고 (2026-05-18):** `/harness-init`은 harness-builder v0.2.0에서 `/agent-init`으로 이름이 변경되었습니다. 아래 참고 사항은 원래 설계를 반영하며 해당 시점에서 정확합니다. 현재 코드에서는 `harness-init`과 `agent-init`을 같은 스킬로 취급하세요.

---

## 1. 목적

`/agent-init`으로 스캐폴드된 `.claude/agents/` 명부 위에 종단간 멀티 에이전트 파이프라인 (의도 → 계획 → 파도 분산 → 게이트 → PR)을 운전하는 Claude Code 스킬 — `/agent-all` — 을 제공합니다. 선택적으로 `--loop`를 통해 전체 실행을 루프하고 `--max-iter` 및 `--max-cost`로 제한합니다.

또한 `/agent-init`을 신규 `--theme=floor` 플래그 (C-3)로 확장하여 `harness-floor` 플러그인의 설정을 번들합니다: `.visual-qa.json`, `.agent-all.json` 및 "Floor 테마" CLAUDE.md 섹션.

설계상 비용 제한이 없습니다: 스킬은 파도 병렬화, 반복된 검토 게이트 및 루프된 반복에 예산을 기꺼이 사용하여 인간 돌봄 없이 고품질 변경을 도착하게 합니다.

## 2. 비목표

- 독립 실행형 플래너가 아님 — 단계 2는 `superpowers:writing-plans`로 위임합니다.
- 신선한 subagent-driven-development 재구현이 아님 — 단계 3은 `superpowers:subagent-driven-development`를 래핑합니다.
- CI 대체품이 아님 — `--loop`는 CI 파이프라인 실행기가 아닌 로컬 에이전트 반복입니다.
- Git 호스트 추상화가 아님 — `gh`를 직접 사용합니다. 비-GitHub 호스트는 범위 밖입니다.
- 독립형 `/ralph` 스킬 없음 — 루프 동작은 `/agent-all` 내부에 존재합니다.

## 3. 입력 / 출력

**위치 인수 (필수):** 자유형 프롬프트 문자열 또는 기존 `docs/tasks/<N>-<slug>.md` 경로.

**플래그:**
- `--loop` — 단계 6 루핑을 활성화합니다. 없이는 단계 1-5를 한 번 실행합니다.
- `--max-iter=<N>` — 루프 반복을 제한합니다 (기본값: 설정에서, 하드 캡 50).
- `--max-cost=<USD>` — 누적 비용 제한 (기본값: 설정에서).
- `--wave-size=small|medium|large` — 설정 기본값을 재정의합니다.
- `--no-pr` — 단계 5 (PR 생성)를 건너뜁니다.
- `--no-brainstorm` — 단계 1의 브레인스토밍 단계를 건너뜁니다 (프롬프트를 그대로 작업으로 사용).
- `--resume` — `.agent-all-state.json`에서 완료로 표시된 단계를 건너뜁니다.
- `--force` — 상태를 지우고 다시 시작합니다.
- `--yes` — 대화형 확인을 건너뜁니다.

**출력:**

```
<project>/
├── .agent-all.json                                  # 설정 (사용자/시드)
├── .agent-all-state.json                            # .gitignore됨
├── docs/
│   ├── tasks/<N>-<slug>.md                          # 단계 1에서
│   └── superpowers/plans/<date>-<slug>.md           # 단계 2에서
└── (git 히스토리: 1 PR 또는 --no-pr인 경우 N개 커밋)
```

상태 파일 형태:
```json
{
  "phases": [{ "phase": N, "completedAt": "<iso>" }],
  "task": "docs/tasks/N-slug.md",
  "plan": "docs/superpowers/plans/...",
  "waves": [{ "index": 0, "tasks": [...], "status": "completed", "commits": [...] }],
  "iter": 0,
  "costUSD": 4.20,
  "prUrl": "https://github.com/.../pull/N"
}
```

## 4. 아키텍처

### 4.1 패키지 레이아웃

`harness-floor` 플러그인은 `visual-qa` 옆에 새로운 스킬을 얻습니다:

```
plugins/harness-floor/
├── plugin.json                                       # 수정됨 — agent-all 스킬 추가
└── skills/
    ├── visual-qa/                                    # 변경 없음 (C-1)
    └── agent-all/                                    # 신규 (C-2)
        ├── SKILL.md
        ├── phases/
        │   ├── 0-preflight.md
        │   ├── 1-intent.md
        │   ├── 2-plan.md
        │   ├── 3-dispatch.md
        │   ├── 4-gate.md
        │   ├── 5-pr.md
        │   └── 6-loop.md
        ├── lib/
        │   ├── config-loader.mjs
        │   ├── wave-builder.mjs
        │   └── loop-evaluator.mjs
        ├── templates/
        │   ├── agent-all.config.json.hbs
        │   └── pr-body.md.hbs
        └── references/
            └── legacy-notes.md
```

`harness-builder` 플러그인 (테마 A)은 C-3을 위한 최소 추가를 얻습니다:
- `skills/agent-init/SKILL.md` — 플래그 목록에 `--theme=floor` 추가
- `skills/agent-init/phases/5-wire.md` — `--theme=floor` 처리 단계 `4c` 추가
- `skills/agent-init/templates/CLAUDE.md.hbs` — 끝에 `{{#if floorTheme}}...{{/if}}` Floor 섹션 추가

### 4.2 업데이트된 `plugins/harness-floor/plugin.json`

```json
{
  "name": "harness-floor",
  "version": "0.2.0",
  "description": "Visual QA + agent-all 파이프라인 (비용 제한 없는 패턴)",
  "skills": ["skills/visual-qa", "skills/agent-all"]
}
```

### 4.3 `.agent-all.json` 스키마

```json
{
  "defaults": {
    "maxIter": 1,
    "maxCostUSD": 50,
    "waveSize": "medium",
    "brainstormFirst": true,
    "createPR": true
  },
  "waves": {
    "small":  { "maxParallel": 2,  "rolesAllowed": ["dev", "reviewer"] },
    "medium": { "maxParallel": 4,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "reviewer"] },
    "large":  { "maxParallel": 8,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "qa-*", "reviewer", "doc-writer"] }
  },
  "loop": {
    "breakCondition": "npm test",
    "stableIters": 1
  },
  "gates": {
    "specReview": true,
    "qualityReview": true,
    "blockOnCritical": true
  },
  "pr": {
    "branchPrefix": "feat/agent-all/",
    "baseBranch": "main"
  }
}
```

CLI 플래그는 런타임 시 해당하는 `defaults` 필드를 재정의합니다.

### 4.4 단계 파이프라인

| 단계 | 이름 | 생략 가능? | 위임 대상 |
|-------|------|------------|--------------|
| 0 | Preflight | 아니오 | 로컬 확인 |
| 1 | Intent | 작업 경로가 전달되거나 `--no-brainstorm`인 경우 | `superpowers:brainstorming` |
| 2 | Plan | 아니오 | `superpowers:writing-plans` |
| 3 | Dispatch | 아니오 | `superpowers:subagent-driven-development` |
| 4 | Gate | `gates.*Review: false`인 경우 | 로컬 + 분산 검토 부에이전트 |
| 5 | PR | `--no-pr`인 경우 | `gh pr create` |
| 6 | Loop | `--loop` 설정되지 않은 경우 | `lib/loop-evaluator.mjs` |

## 5. 컴포넌트 상세

### 5.1 단계 0 — Preflight

1. `pwd`가 git 리포이고 트리가 깨끗한지 확인합니다 (`git status --porcelain` 빔). dirty인 경우: `Stash 또는 commit first; agent-all needs a clean tree.`으로 중단합니다.
2. `.claude/agents/` 존재 및 최소한 `planner.md`, `dev.md`, `reviewer.md`를 포함하는지 확인합니다. 부재: `Run /agent-init first.`로 중단합니다.
3. `.agent-all.json`을 로드합니다. 누락된 경우: 하드코딩된 기본값 (`{maxIter:1, maxCostUSD:50, waveSize:"medium", brainstormFirst:true, createPR:true}`)을 사용하고 한 줄 경고를 인쇄합니다 `(no .agent-all.json — using built-ins; run /agent-init --theme=floor to seed)`.
4. `.agent-all-state.json` (있으면)을 읽습니다. `--resume`이고 `max(phases[*].phase) >= 0`이면 단계 0의 나머지를 건너뜁니다.
5. 입력을 확인합니다: 위치 인수가 `.md`로 끝나면 작업 경로로 취급합니다 — 파일이 없으면 중단합니다 (`task file not found: <path>`). 그렇지 않으면 자유형 프롬프트로 취급합니다. 비워있으면 중단합니다.
6. `{phase: 0, completedAt: "<iso>"}를 상태에 push합니다.

### 5.2 단계 1 — Intent

**입력이 기존 `.md` 파일의 경로인 경우:** 작업으로 로드합니다. 브레인스토밍을 건너뜁니다. 상태에 `task`를 숨깁니다.

**그렇지 않으면 (자유형 프롬프트):**
1. `--no-brainstorm`이거나 `defaults.brainstormFirst === false`이면: 프롬프트를 그대로 `docs/tasks/<N>-<slug>.md`에 작성합니다. 여기서 `N = nextTaskNumber()`이고 `slug = slugify(prompt.slice(0, 40))`. 브레인스토밍을 건너뜁니다.
2. 그렇지 않으면: `superpowers:brainstorming`을 사용하여 스킬 도구를 호출하고 프롬프트를 `args`로 전달합니다. 브레인스토밍이 끝나면 (자신의 설계 문서를 작성), 해당 설계 문서를 `docs/tasks/<N>-<slug>.md`로 복사합니다.
3. 상태에 `task`를 숨깁니다.

`nextTaskNumber()`: `docs/tasks/` 스캔, `N-` 접두사의 최대값 찾기, 증가.

`slugify(s)`: 소문자, 비알파뉴메릭을 `-`로 바꾸기, 선행/후행 `-` 잘라내기, 40 문자에서 자르기.

### 5.3 단계 2 — Plan

1. `superpowers:writing-plans`을 사용하여 스킬 도구를 호출하고 작업 경로를 `args`로 전달합니다.
2. writing-plans는 출력을 `docs/superpowers/plans/<date>-<slug>.md`에 저장합니다. 해당 경로를 캡처합니다.
3. 상태에 `plan`을 숨깁니다.

### 5.4 단계 3 — Dispatch

1. 계획 파일을 로드합니다. 간단한 파서 (`### Task N:` 제목 구분 기호)를 사용하여 작업 목록을 추출합니다.
2. `lib/wave-builder.mjs#buildWaves(taskList, waveConfig)`를 호출합니다. 파도 배열을 반환합니다. 각 파도는 병렬로 실행할 수 있는 계획 작업 목록입니다 (기본 휴리스틱: 파일 경로를 공유하지 않는 작업은 동일 파도에 있을 수 있음, `waveConfig.maxParallel`로 제한됨).
3. 각 파도에 대해: `superpowers:subagent-driven-development`를 사용하여 스킬 도구를 호출하고 파도의 작업 목록을 전달합니다. subagent-driven-development는 작업당 자신의 구현자 + 스펙 검토자 + 품질 검토자 사이클을 처리합니다.
4. 파도 결과를 상태에 수집합니다.

### 5.5 단계 4 — Gate

`gates.specReview`과 `gates.qualityReview` 모두 false인 경우, 단계 4를 완전히 건너뜁니다 (subagent-driven-development는 이미 작업별 검토를 수행했습니다. 이것은 더 높은 수준의 파도 수준 게이트입니다).

그렇지 않으면:
1. 이 파도의 모든 작업 커밋을 집계합니다.
2. 파도 커밋을 계획의 스펙 커버리지 섹션과 비교하여 스펙 검토자 부에이전트를 분산합니다.
3. 파도의 합쳐진 diff 위에 코드 품질 검토자를 분산합니다.
4. 어떤 검토자도 critical 이슈를 보고하고 `blockOnCritical === true`인 경우: 이슈로 구현자 부에이전트를 다시 분산한 다음 다시 검토합니다. 최대 3회 재시도 사이클. 여전히 실패하면: 단계를 종료 코드 2로 중단합니다.

### 5.6 단계 5 — PR

`--no-pr` 또는 `defaults.createPR === false`인 경우: 건너뜁니다.

그렇지 않으면:
1. 분기 생성: `<pr.branchPrefix><slug>` (단계 1의 슬러그에서).
2. `git checkout -b <branch>` (또는 존재하면 전환; `--resume` 친화적).
3. `git push -u origin <branch>`.
4. `templates/pr-body.md.hbs`를 `{task, plan, waves, commits, breakConditionPassed}`로 렌더링합니다.
5. `gh pr create --base <pr.baseBranch> --title "<task.title>" --body <rendered>`.
6. 상태에 `prUrl`을 숨깁니다.

### 5.7 단계 6 — Loop

`--loop` 설정되지 않은 경우: 단계는 no-op이고 완료로 표시하고 종료합니다.

그렇지 않으면:
1. `loopConfig.breakCondition`을 shell을 통해 실행합니다 (`ctx_execute` with `language: "shell"`). 종료 코드를 캡처합니다.
2. 종료 0인 경우: `consecutivePass` 카운터를 증가합니다. `consecutivePass >= stableIters`이면: break합니다.
3. 그렇지 않으면: `consecutivePass = 0` 재설정합니다.
4. 가드를 확인합니다: `iter + 1 > maxIter` 또는 `costUSD > maxCostUSD`이면: 종료 코드 3으로 중단합니다 (`loop exhausted`).
5. `iter`를 증가합니다. 단계 1을 다시 입력합니다 — 하지만 루프 반복의 경우, **항상 작업을 이미 작성된 것으로 취급합니다** (반복 1의 task.md). 브레인스토밍을 건너뜁니다. 단계 2는 처음부터 계획을 재생성합니다 (`--no-replan`으로 계획을 재사용하는 것은 v0.1 범위 밖).
6. 반복합니다.

### 5.8 `/agent-init --theme=floor` (C-3)

**`SKILL.md` 플래그 항목 (기존 플래그 섹션에 추가):**
```
- `--theme=floor` — harness-floor 설정을 번들합니다 (.visual-qa.json + .agent-all.json + CLAUDE.md Floor 섹션). 암시적 `--visual-qa`.
```

**`phases/5-wire.md` 새로운 단계:**

기존 `4b` (--visual-qa)과 `5` (단일 커밋) 사이에 삽입:

```markdown
4c. `--theme=floor`가 전달된 경우:
    - 암시적으로 `--visual-qa = true` 설정 (단계 4b도 실행).
    - `harness-floor` 플러그인이 활성화되었는지 확인합니다. 아닌 경우: 설치 명령 인쇄, 계속.
    - `plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs`를 `{maxIter: 1, maxCostUSD: 50, waveSize: <size from Phase 1>}`로 렌더링하고 프로젝트 루트의 `.agent-all.json`에 작성합니다.
    - `.agent-all-state.json`을 `.gitignore`에 추가합니다 (멱등성 — 이미 `.agent-init-state.json` 및 `.visual-qa-state.json` 패턴을 가집니다).
    - 단계 2 컨텍스트 플래그 `floorTheme: true` 설정 (`templates/CLAUDE.md.hbs`에서 조건부 섹션에 사용됨).
```

**`templates/CLAUDE.md.hbs` 추가 (끝에 추가):**

```handlebars
{{#if floorTheme}}
## Floor 테마

비용 제한 없는 병렬 패턴 활성화. 명령:

- `/visual-qa` — LLM 분석을 사용한 시각적 회귀 (`.visual-qa.json` 참고)
- `/agent-all "task description"` — 멀티 파도 파이프라인 (`.agent-all.json` 참고)
- `/agent-all <task-path> --loop` — break-condition이 성공할 때까지 반복

전체 플래그 참고는 `plugins/harness-floor/skills/{visual-qa,agent-all}/SKILL.md`를 읽으세요.
{{/if}}
```

## 6. 오류 처리

| 시나리오 | 동작 |
|----------|-----------|
| git 리포가 아님 | 단계 0 중단 + `git init` 제안 |
| 작업 트리 dirty | 단계 0 중단 + `stash/commit first` |
| `.claude/agents/` 누락 | 단계 0 중단 + `/agent-init` 제안 |
| `.agent-all.json` 누락 | 빌드인 기본값 사용, 경고 |
| 자유형 프롬프트 비어있음 | 단계 1 중단 + `provide a prompt or task path` |
| 브레인스토밍 사용자가 취소 | 단계 1 중단, task.md 작성 안함, 상태 변경 안함 |
| writing-plans가 계획 파일 반환하지 않음 | 단계 2 중단 + `check writing-plans output` |
| 계획 파싱 실패 (`### Task N` 제목 없음) | 단계 3 중단 + `plan must use writing-plans task heading format` |
| 단일 파도 작업 BLOCKED 3× | 파도 중단, 게이트는 불완전을 봅니다, 단계 4가 impl을 재시도합니다. 여전히 BLOCKED이면 → 단계 3 종료 코드 2로 중단 |
| `--max-cost` 중행 시 초과 | 현재 파도 완료, 중단, 부분 상태 저장 |
| `gh` 인증 안 됨 / 누락 | 단계 5 경고 + 건너뜁니다. 커밋 유지, 분기 push됨 |
| 루프의 breakCondition은 항상 통과 | `stableIters`는 조기 종료를 방지합니다. 1회 반복 다음 종료 (허용됨) |
| 루프의 breakCondition은 항상 실패 | maxIter 소진, 단계 6 종료 코드 3, 마지막 커밋 보존 |
| `--theme=floor` without harness-floor 플러그인 활성화 | harness-init 단계 4c가 설치 명령을 인쇄, 계속 (성능 감소 — 설정 작성되지만 설치까지 사용 불가) |

## 7. 테스트 전략

### 7.1 라이브러리 단위 테스트 (`tests/agent-all/lib/`)

| 모듈 | 테스트 |
|--------|-------|
| `config-loader.mjs` | 4개 테스트: 최소 설정, 전체 설정, 누락된 설정 (기본값), 유효하지 않은 타입 |
| `wave-builder.mjs` | 5개 테스트: 단일 작업 → 1 파도; 4개 독립 작업 + maxParallel=2 → 2 파도; 파일 공유 작업 → 직렬화; rolesAllowed 필터; 빈 계획 |
| `loop-evaluator.mjs` | 5개 테스트: breakCondition 종료 0 → break; 종료 non-0 → 계속; stableIters=2는 2회 연속 통과 필요; maxIter 소진 → 종료 코드 3; maxCostUSD 초과 → 종료 |

### 7.2 템플릿 스냅샷 테스트 (`tests/agent-all/templates/`)

`agent-all.config.json.hbs` + `pr-body.md.hbs` × 3개 고정 장치 (최소 / 전체 / loop-활성화) = 6개 스냅샷.

### 7.3 시나리오 통합 (`tests/agent-all/scenarios/`)

`superpowers:subagent-driven-development` 및 `superpowers:writing-plans`을 스텁 함수를 통해 mock합니다. 4개 시나리오:
1. 단일 파도 성공 → 단계 1-5 완료, PR url 반환
2. 멀티 파도 부분 실패 → 파도 1 ok, 파도 2는 1 작업 BLOCKED, 재시도 성공
3. `--loop` 3회 반복 → breakCondition이 반복 3에서 종료 0, 루프가 깔끔하게 종료
4. `--max-iter=2` 소진 → 종료 코드 3 with 부분 상태 보존

### 7.4 harness-init 통합 테스트

기존 `tests/lib/render.test.mjs` 스냅샷 매트릭스를 신규 고정 장치 `{ floorTheme: true }`로 확장하여 `templates/CLAUDE.md.hbs`를 다룹니다. Floor 섹션이 `floorTheme === true`일 때만 나타나는 것을 확인합니다.

### 7.5 수동 E2E 체크리스트 (`tests/agent-all/manual-checklist.md`)

포함하는 12개 항목: 빈 `.claude/agents/`, dirty 트리, 브레인스토밍 중간 취소, Ctrl-C 후 `--resume`, 의도적으로 실패하는 breakCondition을 사용한 `--loop`, `--max-cost` 조기 중단, `--no-pr` 흐름, `/agent-init --theme=floor` 번들 검증.

### 7.6 범위 밖

- 실제 Claude API 호출 (mock됨)
- 실제 `gh pr create` (수동 체크리스트로 다룸)
- 실제 부에이전트 분산 (시나리오 테스트는 스텁 사용)

## 8. 마이그레이션 영향

- `plugins/harness-floor/plugin.json`은 v0.1.0에서 v0.2.0으로 범프됩니다 (신규 스킬).
- `harness-builder` 또는 `visual-qa` 스킬에 대한 breaking 변경 없음. 공개 표면은 변경 없음.
- `--theme=floor` 플래그는 추가이고; 기존 `/agent-init` 호출은 계속 작동합니다.

## 9. 예제

### 자유로운 프롬프트에서 일회성 기능

```
/agent-all "Add OAuth login with GitHub"
```

실행:
1. 페이즈 1 (브레인스토밍) — AI와 사용자 요구 사항 대화
2. 페이즈 2 (계획) — superpowers:writing-plans이 작업 목록 생성
3. 페이즈 3 (디스패치) — 2~3개 웨이브의 부에이전트가 구현 + 검토
4. 페이즈 4 (게이트) — 선택적 스펙/품질 검토
5. 페이즈 5 (PR) — `feat/agent-all/oauth-login` 브랜치에서 PR 생성

일반적인 출력: PR의 4~6개 커밋, 비용 ~$12~15 (Sonnet).

### 테스트가 통과할 때까지 루프

```
/agent-all "Fix the intermittent race condition in payment tests" --loop --max-iter=5
```

반복 1: brainstorm + plan + dispatch (테스트 실패)
반복 2: 계획 재생성, race 수정에 초점 둔 dispatch (여전히 실패)
반복 3: 재설계, dispatch (성공)
페이즈 6는 `npm test` 종료 코드 0 감지, 루프 중단.

총 비용: ~$30~40, 벽시계 시간: 테스트 스위트에 따라 15~20분.

### 기존 작업 재사용, 브레인스토밍 건너뛰기

```
/agent-all docs/tasks/7-auth-improvements.md --loop --max-iter=10 --max-cost=50
```

페이즈 1은 작업 파일을 로드합니다. 브레인스토밍 없음.
페이즈 2는 작업으로부터 계획 재생성.
페이즈 3~6은 breakCondition 또는 비용 한도까지 루프.

### Codex 구조 패턴

```
/agent-all "Migrate ORM schema to Prisma" --wave-size=medium
# 웨이브 1: frontend-dev + backend-dev 구현
# 2회 재시도 후 웨이브가 막히면:
/codex:rescue
```

부에이전트가 BLOCKED를 보고하면, Codex 스킬은 OpenAI를 호출하여 막힌 작업에 대한 제2 의견을 얻습니다.

## 10. 향후 작업 (범위 밖)

- **Replan-mid-loop** (`--no-replan` 또는 `--replan-every=N`): 현재 각 루프 반복은 계획을 재생성합니다. 구성 가능 replan 전략.
- **PR 코멘트 통합**: 단계 5는 선택적으로 검토 요약을 PR에 코멘트할 수 있습니다.
- **비용 텔레메트리**: 비용 추정자는 대략적입니다. 런타임에 노출되면 실제 토큰 사용량 보고 통합.
- **분산 파도**: 여러 기계 간 (로컬 우선 설계 범위 밖).
