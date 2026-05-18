> 🇺🇸 English: [README.md](README.md)

# agent-skill

Claude Code 플러그인 마켓플레이스. **`/agent-init`** 및 비용 제약 없음을 기본으로 하는 에이전트 하네스 생태계.

한 명령어(`/agent-init`)로 완전한 에이전트 하네스를 부트스트랩합니다: CLAUDE.md, 역할 기반 서브에이전트 파일, 훅, 플러그인 와이링, 그리고 (기본값으로) 완전한 Floor 테마 번들을 포함하여 시각 QA 및 멀티웨이브 파이프라인 실행이 가능합니다.

## 목차

- [빠른 시작](#빠른-시작)
- [동작 원리](#동작-원리)
- [스택별 예시](#스택별-예시)
- [명령어 레퍼런스](#명령어-레퍼런스)
- [테마](#테마)
- [구성 패턴](#구성-패턴)
- [Codex / Claude Code 외 플랫폼](#codex--claude-code-외-플랫폼)
- [아키텍처](#아키텍처)
- [로드맵](#로드맵)
- [자주 묻는 질문](#자주-묻는-질문)
- [버전 관리](#버전-관리)

## 빠른 시작

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
```

모든 git 저장소에서:

```
/agent-init                        # 완전한 Floor 하네스 (기본값)
/agent-init --theme=lite           # 최소: CLAUDE.md + 에이전트 + 훅만
/agent-init --theme=thrift         # 예약됨: 토큰 비용 최적화 (Theme B 계획 중)
/agent-init --size=large --force   # 9개 에이전트 로스터로 재구축
```

다음 중 하나를 실행합니다:

```
/agent-all "사용자 가입 폼 추가"                    # 전체 파이프라인 → PR
/agent-all "불안정한 테스트 수정" --loop --max-iter=5    # 성공할 때까지 반복
/visual-qa                                          # 스크린샷 매트릭스 + LLM 분석
```

## 동작 원리

### `/agent-init` 생명주기

`/agent-init`은 7개 단계를 순차적으로 실행합니다. 각 단계는 아티팩트를 생성하고 `.claude/.agent-init-state.json` 상태 파일을 업데이트합니다.

#### Phase 0 — Preflight (사전 점검)
- **확인:** git 저장소 존재, 플러그인 버전, Node.js
- **생성:** 초기 `.claude/.agent-init-state.json`, `phases: [{phase: 0, ...}]`
- **종료 가능:** 확인 실패 시 (예: git 저장소 아님)

#### Phase 1 — Discover (발견, 브레인스토밍)
- **실행:** `superpowers:brainstorming` — 프로젝트 의도 파악
- **실행:** `lib/detect-stack.mjs` — `package.json`, `pyproject.toml`, `Cargo.toml` 스캔
- **생성:** 발견 컨텍스트: `{ purpose, stack, size, qa_personas, deploy_targets, constraints }`
- **상태 업데이트:** `discovery: {...}`

#### Phase 2 — CLAUDE.md (렌더링)
- **렌더링:** 발견 컨텍스트 기반 `templates/CLAUDE.md.hbs`
- **생성:** 프로젝트 루트 `CLAUDE.md` (프로젝트 목적, 에이전트 로스터, 운영 원칙)
- **사용:** `lib/render.mjs` (Handlebars 템플릿)
- **상태 업데이트:** `phases: [..., {phase: 2, timestamp, claude_md: "..."}]`

#### Phase 3 — Agents (병렬 분산)
- **실행:** `superpowers:dispatching-parallel-agents`
- **각 역할별** (planner, dev, designer, qa-*, tester, reviewer 등):
  - `templates/agents/{role}.md.hbs` 렌더링
  - `.claude/agents/{role}.md` 생성
  - 각 에이전트는 정규 템플릿 구조를 통해 운영 원칙이 포함됨
- **생성:** `.claude/agents/*.md` (6–9개 파일, `--size`에 따라)
- **상태 업데이트:** `agents: [{role, path, hash}, ...]`

#### Phase 4 — Hooks & Config (훅 및 설정)
- **복사:** `templates/hooks/*.mjs` → `.claude/hooks/`
  - `cache-heal.mjs` — SessionStart에서 context-mode 심볼릭 링크 복구
  - `context-mode-router.mjs` — 큰 Bash 출력 가능성 시 라우팅 팁 발행
  - `session-summary.mjs` — Stop에서 의사결정 로그 추가
- **스모크 테스트:** 각 훅 한 번 실행 (드라이 런) 문법 검증
- **렌더링:** 발견된 값으로 `settings.local.json.hbs` 렌더링
- **병합:** `lib/manifest-merge.mjs`를 통해 `.claude/settings.local.json`에 병합 (기존 키 덮어쓰기 안 함)
- **상태 업데이트:** `hooks: [{name, path, tested: true}, ...]`

#### Phase 4b/4c — Floor 테마 (if `--theme=floor`)
- **렌더링 및 생성:**
  - `.visual-qa.json` — harness-floor의 visual-qa 설정 템플릿으로부터
    - 기본 baseUrl: `http://localhost:3000` (또는 `package.json` 스크립트에서 감지)
    - 기본 뷰포트: 모바일 (375px), 태블릿 (768px), 데스크톱 (1200px)
    - 컴포넌트 스켈레톤: `header`, `primary-cta` 등
  - `.agent-all.json` — harness-floor의 agent-all 설정 템플릿으로부터
    - 기본 breakCondition: `npm test` (또는 `pytest`, `cargo test` 스택에 따라)
    - 기본 루프: 비활성화 (런타임에 `--loop` 전달)
    - 웨이브 크기: 기본값 `medium`

#### Phase 5 — Wire & commit (와이어 및 커밋)
- **실행:** `lib/plugin-scan.mjs`
  - 필요한 플러그인 누락 확인
  - 사용자용 설치 명령어 표시
- **업데이트:** `.gitignore` (`.agent-init-state.json`, `.visual-qa/` 캐시 추가)
- **생성:** 단일 부트스트랩 커밋: `"initial: /agent-init --theme={theme} --size={size}"`
- **출력:** 생성된 파일 요약 + 플러그인 설치 힌트
- **최종 상태:** `phases: [..., {phase: 5, commit: "abc123...", installed: [...]}]`

**Ctrl-C 후 재개:** `--resume`을 전달하여 마지막 성공한 단계부터 계속합니다.

### `/agent-all` 생명주기

`/agent-all`은 7개 단계를 실행하며, phase 3만 병렬 분산 지점입니다.

| 단계 | 이름 | 소요시간 | 위임 대상 | 생성 결과 |
|------|------|---------|----------|---------|
| 0 | Preflight | <1초 | 로컬 점검 | `.agent-all-state.json` |
| 1 | Intent | 1–2분 | `superpowers:brainstorming` (자유형) 또는 작업 파일 로드 | 구조화된 작업 + 수락 |
| 2 | Plan | 2–5분 | `superpowers:writing-plans` | 상세 스펙 (수락 + 작업 목록) |
| 3 | Dispatch | 5–60분 | `lib/wave-builder.mjs` + `superpowers:subagent-driven-development` | PR 브랜치 + 웨이브별 커밋 |
| 4 | Gate | 2–10분 | 웨이브 수준 QA 리뷰 서브에이전트 | 품질 보고서; 실패 시 재시도 |
| 5 | PR | <1분 | `gh pr create` + 템플릿 렌더링 | GitHub PR 생성 |
| 6 | Loop eval | <1초 | `lib/loop-evaluator.mjs` | breakCondition 확인; 반복 또는 종료 |

**웨이브 빌더 로직:** `lib/wave-builder.mjs`는 계획의 작업 목록을 읽고:
1. 파일 겹침으로 작업 그룹화 (파일 공유 작업 → 한 웨이브로 직렬화)
2. 독립 작업을 별도 웨이브에 할당 (병렬 실행 가능)
3. 병렬 웨이브를 `.agent-all.json`의 `maxParallel`로 제한

각 웨이브는 `subagent-driven-development` 배치이며, 서브에이전트는 동일 브랜치에 커밋합니다.

### `/visual-qa` 생명주기

6개 단계. Phase 3는 페이지별로 분산.

| 단계 | 이름 | 생성 결과 |
|------|------|---------|
| 0 | Preflight | `.visual-qa-state.json` |
| 1 | Config load | `.visual-qa.json`에서 baseUrl, 페이지, 뷰포트 로드 |
| 2 | Health check | baseUrl 활성 여부 확인 |
| 3 | Capture (페이지별 분산) | 스크린샷 × 뷰포트; 페이지별 LLM 분석 |
| 4 | Diff | 픽셀 수준 + 이전 실행 대비 시각적 차이 |
| 5 | Report | `docs/visual-qa/{slug}/report.md` + 요약 |

### 훅 트리거 흐름

세 가지 훅이 `/agent-init`으로 설치되고 Claude Code 자체에서 트리거됩니다:

**SessionStart** → `hooks/cache-heal.mjs`
- context-mode 플러그인 심볼릭 링크 자동 복구 (Claude Code가 자동 업데이트한 경우)
- 프로젝트 수준 하네스 존재 시 CLAUDE.md 힌트 발행

**PreToolUse** (matcher: Bash) → `hooks/context-mode-router.mjs`
- Bash 명령어가 큰 출력 가능성 감지 (예: `git log`, 테스트 러너)
- 라우팅 팁 발행: "대신 context-mode 도구 사용"

**Stop** → `hooks/session-summary.mjs`
- 로컬 마크다운 파일에 세션 의사결정 로그 추가
- 여러 세션 간 의사결정 이력 추적에 유용

**전역 훅 (프로젝트 외부):** `plugins/harness-builder/hooks/context-mode-cache-heal.mjs`
- 모든 Claude Code SessionStart에서 실행 (모든 프로젝트)
- Claude Code가 플러그인을 자동 업데이트할 때 심볼릭 링크 자동 복구

### 플러그인 로딩

1. `/plugin marketplace add <git-url>`로 Claude Code에 마켓플레이스 등록
2. `/plugin install <name>@agent-skill`로 플러그인을 `~/.claude/plugins/cache/<plugin>@<marketplace>/<version>/`에 클론
3. `~/.claude/plugins/installed_plugins.json`에서 `installPath` 및 버전 추적
4. SessionStart의 전역 cache-heal 훅이 Claude Code 플러그인 자동 업데이트 시 깨진 심볼릭 링크 자동 감지 및 복구

## 스택별 예시

### React + Next.js

**설정:**
```bash
npx create-next-app@latest my-app --typescript --eslint
cd my-app
git init && git add -A && git commit -m "initial: next.js"
```

**`/agent-init` 실행:**
```
/agent-init
```

동작 방식:
- `detect-stack`이 `typescript` 감지 (tsconfig.json + package.json)
- 브레인스토밍에서 프로젝트 크기 질문 → 실제 앱으로 `medium` 선택
- 6개 에이전트 생성: planner, dev, designer, qa-general, tester, reviewer
- `.visual-qa.json` 시드:
  - `baseUrl: http://localhost:3000`
  - 뷰포트: 모바일 (375), 태블릿 (768), 데스크톱 (1200)
  - 컴포넌트: `header`, `primary-cta` (스켈레톤)
- `.agent-all.json` breakCondition: `npm test`

**`/agent-all`로 반복:**
```bash
npm run dev   # 다른 터미널에서
```
```
/agent-all "Google OAuth 로그인 추가 및 프로필 이미지 업로드"
```

결과: 인증 흐름, 보호된 라우트, 프로필 UI를 포함한 완전한 PR.

**시각 QA 실행:**
```
/visual-qa --slug="oauth-feature"
```

출력: `docs/visual-qa/oauth-feature/report.md` (모든 페이지 × 뷰포트 스크린샷 + LLM 분석).

### Python FastAPI

**설정:**
```bash
mkdir api && cd api
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
cat > pyproject.toml <<'EOF'
[build-system]
requires = ["setuptools", "wheel"]

[project]
name = "api"
version = "0.1.0"
dependencies = ["fastapi", "uvicorn[standard]"]
EOF
touch requirements.txt main.py
git init && git add -A && git commit -m "initial: fastapi"
```

**`/agent-init` 실행:**
```
/agent-init --size=small
```

동작 방식:
- `detect-stack`이 `python` 감지 (pyproject.toml)
- 3개 에이전트: planner, dev, reviewer
- `.agent-all.json`이 `breakCondition: npm test`로 생성 — **`pytest`로 변경해야 함:**
  ```json
  {
    "loop": {
      "breakCondition": "pytest",
      "stableIters": 2
    }
  }
  ```

**루프로 반복:**
```
/agent-all "JWT 인증 미들웨어 및 토큰 갱신 추가" --loop --max-iter=5
```

에이전트가:
1. 인증 미들웨어 + 테스트 계획
2. 구현 분산
3. `pytest` 실행 검증
4. 테스트 실패 시 재시도 (최대 5회)
5. 테스트가 연속 2회 통과 시 PR 생성

### Rust CLI

**설정:**
```bash
cargo new mycli && cd mycli
git init && git add -A && git commit -m "initial: rust"
```

**lite 테마로 `/agent-init` 실행 (visual-qa 없음):**
```
/agent-init --theme=lite
```

동작 방식:
- `detect-stack`이 `rust` 감지 (Cargo.toml)
- 3개 에이전트: planner, dev, reviewer
- `.visual-qa.json` 없음 (lite 테마)
- `.agent-all.json`이 `breakCondition: cargo test`로 생성

**반복:**
```
/agent-all "git 같은 워크플로우용 서브커맨드 추가" --loop --max-cost=25
```

### 모노레포 (npm workspaces)

**설정:**
```bash
mkdir mono && cd mono && git init

cat > package.json <<'EOF'
{
  "name": "mono",
  "private": true,
  "workspaces": [
    "packages/app",
    "packages/api",
    "packages/shared"
  ]
}
EOF

mkdir -p packages/{app,api,shared}/src
git add -A && git commit -m "initial: workspaces"
```

**`/agent-init` 실행:**
```
/agent-init --size=large
```

동작 방식:
- `detect-stack`이 `javascript` 감지 (package.json의 workspaces; 단일 tsconfig 없음)
- 9개 에이전트: planner, frontend-dev, backend-dev, designer, qa-frontend, qa-backend, qa-integration, tester, reviewer
- `.agent-all.json`이 `breakCondition: npm test`로 생성 (모든 워크스페이스 테스트 실행)

**모노레포 전체 기능:**
```
/agent-all "공유 인증 패키지 생성, app 및 api에 통합" --wave-size=large
```

에이전트가:
1. 계획: 공유 패키지 생성, app 업데이트, api 업데이트, 통합 테스트
2. 2개 웨이브로 분산 (공유 먼저, 그 후 app+api 병렬)
3. `npm test`를 실행하여 모든 워크스페이스 검증
4. 모든 변경사항이 포함된 단일 PR 생성

## 명령어 레퍼런스

### `/agent-init` (harness-builder 플러그인)

**문법:**
```
/agent-init [--theme=floor|lite|thrift] [--size=small|medium|large] [--qa=<persona>[,<persona>]] [--merge] [--force] [--dry-run] [--resume]
```

**플래그:**

| 플래그 | 기본값 | 효과 | 예시 |
|--------|-------|------|------|
| `--theme` | `floor` | 번들: floor (비용 무제한 + visual-qa), lite (기본), thrift (예약) | `--theme=lite` |
| `--size` | auto (discovery에서) | 에이전트 수: small (3), medium (6), large (9) | `--size=large` |
| `--qa` | auto-detect | QA 페르소나 오버라이드 (쉼표 구분) | `--qa=api,ui,security` |
| `--merge` | false | 기존 CLAUDE.md에 하네스 추가 (중단 대신) | `--merge` |
| `--force` | false | 기존 CLAUDE.md + 에이전트 덮어쓰기 | `--force` |
| `--dry-run` | false | 어떤 일이 일어날지 보기; 파일 작성 안 함 | `--dry-run` |
| `--resume` | false | 마지막 성공한 단계부터 재개 (`.agent-init-state.json` 필요) | `--resume` |

**예시:**

1. **새 프로젝트, 완전한 하네스:**
   ```
   mkdir my-app && cd my-app && git init && git add -A && git commit -m "init"
   /agent-init
   ```
   생성: CLAUDE.md, 6개 에이전트, 3개 훅, .visual-qa.json, .agent-all.json

2. **기존 CLAUDE.md 유지, 하네스 섹션 추가:**
   ```
   /agent-init --merge
   ```
   기존 CLAUDE.md 콘텐츠 유지; "Agent Harness" 섹션 추가

3. **9개 에이전트로 재구축 (대형 모노레포):**
   ```
   /agent-init --size=large --force
   ```
   모든 에이전트 + CLAUDE.md를 대형 로스터로 교체

4. **phase 3 중 Ctrl-C 후 재개:**
   ```
   /agent-init --resume
   ```
   phase 0부터 다시 시작하지 않고 phase 4 (훅)부터 계속

### `/agent-all` (harness-floor 플러그인)

**문법:**
```
/agent-all <prompt-or-path> [--loop] [--max-iter=<N>] [--max-cost=<USD>] [--wave-size=small|medium|large] [--no-pr] [--no-brainstorm] [--resume] [--force] [--yes]
```

**플래그:**

| 플래그 | 기본값 | 효과 | 예시 |
|--------|-------|------|------|
| `<prompt-or-path>` | 필수 | 자유형 작업 프롬프트 또는 `.md` 작업 파일 경로 | `"OAuth 추가"` 또는 `docs/tasks/12.md` |
| `--loop` | false | breakCondition이 성공할 때까지 반복 루프 활성화 | `--loop` |
| `--max-iter` | 1 (off) | 테스트 실패 시에도 N 반복 후 중단 | `--max-iter=10` |
| `--max-cost` | $500 | 전체 실행의 하드 비용 상한선 (USD) | `--max-cost=50` |
| `--wave-size` | config에서 | `maxParallel` 웨이브 오버라이드 | `--wave-size=large` |
| `--no-pr` | false | 계획 실행하되 PR 생성 안 함 (로컬만) | `--no-pr` |
| `--no-brainstorm` | false | phase 1 의도 수집 건너뛰기; 기존 작업에서 시작 | `--no-brainstorm` |
| `--resume` | false | 마지막 실패한 단계부터 재개 | `--resume` |
| `--force` | false | 브랜치/PR 존재 시 덮어쓰기 | `--force` |
| `--yes` | false | 모든 확인 자동 수락 | `--yes` |

**예시:**

1. **자유형 프롬프트 → 한 번에 PR:**
   ```
   /agent-all "모듈화된 댓글 시스템 + 중재 큐 빌드"
   ```
   단계: brainstorm → plan → dispatch → gate → PR

2. **기존 작업 파일 로드 + 테스트 통과할 때까지 반복:**
   ```
   /agent-all docs/tasks/fix-race-condition.md --loop --max-iter=15
   ```
   phase 1 (brainstorm) 건너뜀; 작업 파일을 phase 2 계획에 사용.
   `breakCondition` (npm test) 실패 시 최대 15회 재시도.

3. **대형 기능, 비용 상한선, 병렬 3웨이브:**
   ```
   /agent-all "PostgreSQL → MongoDB 스키마 마이그레이션, 쿼리 업데이트" \
     --wave-size=large \
     --max-cost=100 \
     --loop --max-iter=8
   ```

4. **로컬 실행 (PR 없음), 커밋 전 미리보기:**
   ```
   /agent-all "기능 플래그 시스템 추가" --no-pr
   ```
   PR을 생성하지 않고 브랜치에 커밋합니다.

### `/visual-qa` (harness-floor 플러그인)

**문법:**
```
/visual-qa [--resume] [--force] [--yes] [--budget=<USD>] [--skip-health] [--slug=<custom>]
```

**플래그:**

| 플래그 | 기본값 | 효과 | 예시 |
|--------|-------|------|------|
| `--resume` | false | 마지막 실패한 단계부터 재개 | `--resume` |
| `--force` | false | 오늘의 실행 디렉토리 덮어쓰기 | `--force` |
| `--yes` | false | 모든 확인 자동 수락 | `--yes` |
| `--budget` | $50 | 비전 모델 분석의 비용 상한선 (USD) | `--budget=100` |
| `--skip-health` | false | baseUrl 헬스 체크 건너뛰기 | `--skip-health` |
| `--slug` | auto (timestamp) | `docs/visual-qa/` 아래 커스텀 디렉토리 이름 | `--slug="oauth-launch"` |

**예시:**

1. **첫 실행 (기준 스크린샷 + 분석):**
   ```
   npm run dev   # :3000에서 서버 실행 확인
   ```
   ```
   /visual-qa
   ```
   출력: `docs/visual-qa/2026-05-18-abc1234/report.md` (스크린샷 + LLM 분석)

2. **비용 제한 분석 (더 적은 페이지/뷰포트):**
   ```
   /visual-qa --budget=20
   ```

3. **오늘의 실행 강제 덮어쓰기 (재캡처):**
   ```
   /visual-qa --force
   ```

4. **조직화용 커스텀 slug:**
   ```
   /visual-qa --slug="launch-checklist"
   ```
   출력: `docs/visual-qa/launch-checklist/report.md`

## 테마 (기본값: `--theme=floor`)

| 테마 | 번들에 포함 | 기본값? | 사용 시점 |
|------|-----------|--------|---------|
| `floor` | CLAUDE.md + 에이전트 + 3개 훅 + `.visual-qa.json` + `.agent-all.json` + Floor 섹션 | ✅ 기본값 | 대부분 프로젝트 — 비용 무제한, 모든 것 제공. 완전한 visual-QA + 멀티웨이브 루프. |
| `lite` | CLAUDE.md + 에이전트 + 3개 훅만 | opt-in | 제약이 있는 환경 / 빠른 프로토타입. `.visual-qa.json` 또는 멀티 실행 비용 추적 없음. |
| `thrift` | (예약됨) Theme B — context-mode 적극 활용, 프롬프트 캐시, 요약 훅 | 계획 중 | 비용 민감한 장시간 실행 프로젝트. 다음 릴리스. |

## 구성 패턴

### 패턴 1: 프롬프트에서 PR까지 한 번에

```bash
mkdir feature && cd feature && git init
/agent-init
/agent-all "Node에서 Markdown-to-PDF 변환기 CLI 빌드"
```

결과: CLI + 테스트 + 문서가 포함된 단일 PR.

### 패턴 2: 모든 테스트 통과할 때까지 반복 (자가 치유 루프)

```bash
cd existing-repo
/agent-all docs/tasks/12-fix-flaky-test.md --loop --max-iter=15
```

에이전트가 각 반복 후 테스트 실행. 모든 테스트가 연속 2회 통과 시 또는 최대 반복 도달 시 중단.

### 패턴 3: 시각적 회귀 게이트

```bash
# `/agent-all` PR 병합 후:
/visual-qa
# docs/visual-qa/2026-05-18-abc1234/report.md에서 중요 문제 확인
# 발견 시 후속 작업 생성:
/agent-all "시각적 회귀 수정: 모바일 레이아웃 깨짐" --no-brainstorm
```

### 패턴 4: 무인 실행용 조율된 `/goal`

```bash
/goal "모든 CI 통과하는 분석 대시보드 배포"
/agent-all "분석 대시보드 빌드 (차트, 필터, 내보내기)" \
  --loop --max-iter=15 --max-cost=80
```

Claude Code가 세션을 유지합니다. 에이전트가 목표 달성 또는 비용 상한선 도달 시까지 반복.

### 패턴 5: 막혔을 때 Codex 구조

```bash
/agent-all "복잡한 리팩터 작업" --wave-size=large
# wave 3이 막히면 (타임아웃), phase 4 게이트가 호출:
# /codex:rescue — 두 번째 의견 구현용
```

(`codex@openai-codex` 플러그인이 `harness-floor`와 함께 설치되어 있어야 함)

## Codex / Claude Code 외 플랫폼

lib 모듈 (`plugins/*/skills/*/lib/*.mjs`)과 템플릿 (`*.hbs`, `*.json`)은 순수 Node.js / 순수 데이터 — 휴대 가능합니다. 단계 프롬프트는 Claude Code 스킬 규칙이며 다른 플랫폼에 맞게 조정이 필요합니다.

### 순수 Codex CLI 사용

`codex@openai-codex` 플러그인을 `harness-floor`와 함께 사용하면, `agent-all`의 phase 3 분산이 웨이브가 막혔을 때 `codex:rescue` 스킬로 Codex에 위임할 수 있습니다 — 어려운 작업에 대한 두 번째 의견으로 유용합니다.

순수 Codex CLI 사용 (Claude Code 없음):
- `agent-skill` lib 코드 설치: 저장소 클론 또는 `lib/` 파일 벤더링
- 스킬 오케스트레이션을 Codex 프롬프트로 재구현 (phase 스펙이 좋은 원본 자료)
- 훅 시스템은 Claude Code 고유; Codex에 해당 훅이 있으면 구현
- 템플릿 조정 (Handlebars → Codex 프롬프트 템플릿)

### Cursor, Zed, 기타 에디터

템플릿과 lib는 재사용 가능; 오케스트레이션 레이어 (스킬 분산, 단계 실행)는 Claude Code 고유입니다. 다음을 수행할 수 있습니다:
- 단계 프롬프트 내보내기 (참고: `docs/superpowers/*/`) 및 수동 실행
- `lib/wave-builder.mjs` 로직을 빌드 시스템에 맞게 조정
- 렌더링된 템플릿 (CLAUDE.md, 에이전트 파일)을 시작점으로 사용

## 아키텍처

```
agent-skill/
├── plugins/
│   ├── harness-builder/
│   │   ├── plugin.json
│   │   ├── skills/
│   │   │   └── agent-init/
│   │   │       ├── skill.md
│   │   │       ├── lib/
│   │   │       │   ├── detect-stack.mjs      # 스택 감지 (JS, Python, Rust 등)
│   │   │       │   ├── render.mjs            # Handlebars 템플릿 렌더러
│   │   │       │   ├── manifest-merge.mjs    # JSON 매니페스트 병합 (비파괴)
│   │   │       │   └── plugin-scan.mjs       # 필수 플러그인 감지 + 와이어링
│   │   │       └── templates/
│   │   │           ├── CLAUDE.md.hbs         # 마스터 하네스 템플릿
│   │   │           ├── agents/
│   │   │           │   ├── planner.md.hbs
│   │   │           │   ├── dev.md.hbs
│   │   │           │   ├── designer.md.hbs
│   │   │           │   ├── qa-*.md.hbs       # 동적 QA 페르소나
│   │   │           │   ├── tester.md.hbs
│   │   │           │   └── reviewer.md.hbs
│   │   │           ├── hooks/
│   │   │           │   ├── cache-heal.mjs
│   │   │           │   ├── context-mode-router.mjs
│   │   │           │   └── session-summary.mjs
│   │   │           └── settings.local.json.hbs
│   │   └── hooks/
│   │       └── context-mode-cache-heal.mjs   # 전역 훅 (모든 프로젝트 대상)
│   │
│   └── harness-floor/
│       ├── plugin.json
│       └── skills/
│           ├── agent-all/
│           │   ├── skill.md
│           │   ├── lib/
│           │   │   ├── config-loader.mjs     # .agent-all.json 로드
│           │   │   ├── wave-builder.mjs      # 작업 그룹화 → 웨이브 직렬화
│           │   │   └── loop-evaluator.mjs    # breakCondition 확인, 루프 제어
│           │   └── templates/
│           │       ├── pr-body.md.hbs        # PR 설명 템플릿
│           │       └── .agent-all.json.hbs   # 기본 설정
│           │
│           └── visual-qa/
│               ├── skill.md
│               ├── lib/
│               │   ├── config-loader.mjs     # .visual-qa.json 로드
│               │   ├── matrix-builder.mjs    # 페이지 × 뷰포트 매트릭스
│               │   ├── cost-estimator.mjs    # Vision API 비용 사전 계산
│               │   └── diff-runs.mjs         # 이전 실행 대비 픽셀 차이
│               └── templates/
│                   ├── report.md.hbs         # 마크다운 보고서
│                   └── .visual-qa.json.hbs   # 기본 설정
│
├── tests/
│   ├── agent-all/
│   │   ├── lib/                              # lib 모듈 유닛 테스트
│   │   ├── templates/                        # 렌더링 출력 스냅샷 테스트
│   │   └── scenarios/                        # 통합 테스트 (웨이브 분산 등)
│   └── ...
│
├── docs/
│   └── superpowers/
│       ├── specs/                            # Phase 0–7 기술 스펙
│       └── plans/                            # 예시 작업 파일 템플릿
│
├── CHANGELOG.md
└── README.md (이 파일)
```

**세 가지 테마; 두 개 구현 + 하나 예약:**
- **A (harness-builder)** — `/agent-init`을 통한 프로젝트별 하네스 빌더. 단일 책임: CLAUDE.md + 에이전트 + 훅 스캐폴딩.
- **B (harness-thrift)** — 토큰 비용 최적화 — **계획 중**, `--theme=thrift`로 예약됨. context-mode 캐싱, 프롬프트 캐시, 요약 훅 통합 예정.
- **C (harness-floor)** — 비용 무제한 패턴: `/visual-qa` + `/agent-all`. 전체 멀티웨이브 분산, 시각 QA, 루프 반복.

**lib와 템플릿을 분리하는 이유:** 휴대성을 활성화합니다. lib 모듈 (wave-builder, loop-evaluator, detect-stack)은 Claude Code 의존성이 없는 순수 Node.js입니다 — 다른 도구 (Codex, Cursor, 빌드 시스템)에 벤더링 가능합니다. 템플릿은 Handlebars이며, 모든 템플릿 엔진에 맞게 조정 가능합니다. 오직 스킬 오케스트레이션 (분산, 단계 흐름)만 Claude Code 고유입니다.

## 로드맵

- **Theme B (harness-thrift):** context-mode 적극 통합, 프롬프트 캐시 최적화, 요약 훅, 토큰 예산 추적
- **픽셀 차이 visual-qa 모드:** LLM 분석 없이 나란히 회귀 감지 (비용 감소)
- **원격 분석 옵트인:** 가장 자주 건너뛴 단계, 에이전트 활용도
- visual-qa 보고서용 `gh` PR 코멘트 통합
- 분산 웨이브 분산 (다중 머신 / 다중 지역)
- 비용 추적 대시보드 (하네스 + 단계별 시간별/일별 지출 분석)

## 자주 묻는 질문

**Q: `/agent-init`이 내 CLAUDE.md를 덮어쓸까?**
A: 아니오. 기본값은 CLAUDE.md가 존재하면 중단합니다. `--merge`로 하네스 섹션을 추가하거나 `--force`로 덮어쓰기.

**Q: `/agent-all --loop`이 안전한가?**
A: `maxIter` (하드 상한선 50), `maxCostUSD` (기본값 $500), 및 `breakCondition`으로 제한됩니다. 비용 상한선이 낮고 명확한 테스트 명령어를 설정하면 영원히 실행될 수 없습니다.

**Q: Floor 테마를 원하지 않으면?**
A: `/agent-init --theme=lite`로 건너뜁니다. 기본 CLAUDE.md + 에이전트 + 3개 훅만 받습니다.

**Q: 에이전트 로스터를 커스터마이징할 수 있나?**
A: `/agent-init` 후 `.claude/agents/*.md`를 편집합니다. 순수 마크다운입니다.

**Q: Codex/Cursor/기타 도구에서 작동하나?**
A: lib 코드와 템플릿은 휴대 가능; 스킬 오케스트레이션은 Claude Code 고유. 위 "Codex / Claude Code 외 플랫폼" 참고.

**Q: `.agent-all.json`을 편집하지 않고 한 번의 `/agent-all` 실행에서 wave-size를 변경할 수 있나?**
A: 네, `--wave-size=large` (또는 small/medium) 전달 — CLI 플래그가 설정 기본값 오버라이드.

**Q: 비 Node 프로젝트의 breakCondition은?**
A: `/agent-init` 후 `.agent-all.json`을 편집합니다. 일반적 값: `pytest`, `cargo test`, `go test ./...`, `mix test`, `maven test`.

**Q: `/agent-all --loop`이 각 반복마다 계획을 재생성하나?**
A: 네 (v0.2.0). Phase 2가 반복마다 `superpowers:writing-plans`를 다시 실행합니다. 향후 `--no-replan` 플래그로 계획을 고정할 수 있습니다.

**Q: 분산을 시작하기 전에 계획을 볼 수 있나?**
A: 네. `/agent-all`은 phase 2 (계획) 후 일시 중지하고 phase 3 (분산) 시작 전에 수락을 요청합니다. 계획을 검토하고 변경을 요청하거나 중단할 수 있습니다.

**Q: `/visual-qa`의 비용은?**
A: 페이지 수와 뷰포트에 따라 다릅니다. 기본값은 ~5페이지 × 3뷰포트 = 15개 스크린샷 + LLM 분석 (~$0.50–$2.00). `--budget=<USD>`로 제한하거나 `--skip-health`로 속도 향상.

## 버전 관리

- `harness-builder`: v0.2.0 (현재) — `/harness-init`을 `/agent-init`으로 이름 변경, 단계 상태 파일 도입
- `harness-floor`: v0.2.0 (현재) — `agent-all` 스킬 추가 (visual-qa 옆), wave-builder 로직, loop-evaluator

전체 이력은 [CHANGELOG.md](CHANGELOG.md) 참고.
