> 🇺🇸 English: [README.md](README.md)

# agent-skill

17개 플러그인을 가진 Claude Code 마켓플레이스. 5개 테마 커버: **builder** (`/agent-init` 스캐폴딩), **floor** (cost-unrestricted `/visual-qa` + `/agent-all`), **thrift** (`/thrift` long-session 비용 최적화), **explore** (`/explore` 코드베이스 매핑), **debug** (`/debug` 체계적 디버깅). 각 런타임 테마는 크로스 도구 포팅을 위한 플랫폼별 포트(Cursor, GitHub Copilot CLI, Codex CLI, Gemini CLI)를 함께 제공합니다.

## 목차

- [빠른 시작](#빠른-시작)
- [플러그인 업데이트 방법](#플러그인-업데이트-방법)
- [5개 테마](#5개-테마)
- [전체 17개 플러그인](#전체-17개-플러그인)
- [명령어 레퍼런스](#명령어-레퍼런스)
- [스택별 예제](#스택별-예제)
- [아키텍처](#아키텍처)
- [크로스 플랫폼 지원](#크로스-플랫폼-지원)
- [버전 관리](#버전-관리)
- [FAQ](#faq)

## 빠른 시작

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill       # 신규 — long-session 비용 최적화
/plugin install harness-explore@agent-skill      # 신규 — 코드베이스 매핑
/plugin install harness-debug@agent-skill        # 신규 — 체계적 디버깅
```

git 저장소에서:

```
/agent-init                        # 전체 Floor 하니스 (기본값)
/agent-init --theme=lite           # 최소: CLAUDE.md + agents + hooks만
/agent-init --theme=floor          # 명시적 Floor (기본값)
/agent-init --theme=thrift         # 출시됨 — Theme B cost-conscious
/agent-init --size=large --force   # 9-agent 로스터로 재구성
```

이후 실행 가능:

```
/agent-all "사용자 가입 폼 추가"                # 전체 파이프라인 → PR (Theme C)
/agent-all "flaky 테스트 수정" --loop --max-iter=5  # 통과까지 반복
/visual-qa                                      # 스크린샷 매트릭스 + LLM 분석
/thrift                                         # 신규 — 비용 최적화 훅 설정
/explore                                        # 신규 — 코드베이스 맵 빌드
/explore where Foo                              # 캐시된 맵에 쿼리
/debug "auth flow npm test 실패"                # 신규 — 체계적 디버깅
```

## 플러그인 업데이트 방법

플러그인은 정기적으로 업데이트됩니다. 호스트에 따라 3가지 업데이트 경로:

### Claude Code (주 호스트)

```
# 단일 플러그인을 마켓플레이스의 최신 버전으로 업데이트
/plugin update harness-floor@agent-skill

# 이 마켓플레이스의 모든 플러그인 한 번에 업데이트
/plugin update --marketplace agent-skill

# 설치된 모든 플러그인 업데이트 (모든 마켓플레이스 통틀어)
/plugin update --all

# 먼저 마켓플레이스 목록 새로고침 (새 플러그인이 있다고 의심되는 경우)
/plugin marketplace update agent-skill
/plugin install harness-explore@agent-skill   # 새로 등록된 플러그인 설치
```

업데이트 후, 전역 `SessionStart` 훅(`context-mode-cache-heal.mjs`)이 다음 Claude Code 세션 시작 시 stale 플러그인 심볼릭링크를 자동으로 healing합니다. 플러그인 동작이 옛 버전에서 멈춘 것 같으면 Claude Code를 재시작하거나 `/plugin reload` 실행.

### 플랫폼별 CLI 호스트 (Codex / Copilot / Gemini / Cursor)

각 플랫폼은 자체 업데이트 메커니즘을 가집니다. 이 플러그인들은 `harness-floor-<platform>`, `harness-thrift-<platform>`, `harness-builder-<platform>` 아래에 있습니다:

```bash
# Codex CLI
codex plugins update                       # 전체
codex plugins update harness-floor-codex   # 하나

# GitHub Copilot CLI
gh copilot plugins update                  # 전체
gh copilot plugins update harness-floor-copilot

# Gemini CLI (a.k.a. antigravity)
gemini extensions update                   # 전체
gemini extensions update harness-floor-gemini

# Cursor — 플러그인 로더 없음; 번들 install 렌더러 재실행
node plugins/harness-builder-cursor/bin/init.mjs /path/to/project --force
node plugins/harness-floor-cursor/bin/init.mjs /path/to/project --force
node plugins/harness-thrift-cursor/bin/install.mjs /path/to/project --force
```

렌더러 스타일 플러그인(`harness-explore`, `harness-debug`, 플랫폼별 `bin/install.mjs` 스크립트)의 경우, 업데이트는 최신 플러그인 코드를 pull한 후 `--force`로 install 명령을 재실행하는 것을 의미합니다. 렌더러는 idempotent: 재실행해도 hooks를 중복 등록하지 않음 (기존 항목을 `thrift-` / `floor-` 명령 경로 센티널로 감지 — `docs/superpowers/specs/2026-05-18-hook-precedence-integration.md` 참조).

### 클린 인스톨이 필요할 때

플러그인 업데이트가 실패하거나 깨끗한 상태를 원할 때:

```
/plugin uninstall harness-floor@agent-skill
/plugin marketplace remove agent-skill
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-floor@agent-skill
```

플러그인이 작성한 프로젝트별 아티팩트(config 파일, 훅 스크립트)는 외과적으로 되돌리기도 가능:

```bash
# 다른 플러그인의 hooks는 건드리지 않고 thrift의 instrument 레이어만 제거
node plugins/harness-thrift/bin/install.mjs /path/to/project --uninstall
# 각 thrift 포트에 대해 동일 — `thrift-` 센티널로 lib/settings-patcher unpatch 실행
```

## 5개 테마

| 테마 | 플러그인 패밀리 | 자세 | 적합한 경우 |
|---|---|---|---|
| **A** | `harness-builder` (+ 4 플랫폼 siblings) | 설치 스캐폴딩 (one-shot, 저비용) | 신규 프로젝트 시작; 기존 프로젝트에 Claude Code 도입 |
| **C** | `harness-floor` (+ 4 플랫폼 siblings) | Cost-unrestricted 멀티에이전트 파이프라인 | 큰 기능, visual QA, 병렬 wave 실행 |
| **B** | `harness-thrift` (+ 4 플랫폼 siblings) | Cost-conscious long-session 런타임 | 컨텍스트 축적이 비용을 주도하는 ≥1시간 세션 |
| **D** | `harness-explore` | 코드베이스 매핑 (읽기 전용) | 새 코드베이스 온보딩; "X는 어디 있나" 쿼리 |
| **E** | `harness-debug` | 체계적 디버깅 워크플로 | 다중 시간 디버깅 마라톤; 잡기 힘든 버그 bisecting |

테마는 조합 가능. 일반적인 "기능 출시" 세션은 A (일회성 `/agent-init`) → C (`/agent-all "..."`)를 사용하며, B는 비용 절감을 위해 백그라운드에서 보이지 않게 동작하고, E + D는 버그 헌팅 및 방향 잡기에 온디맨드로 활용됩니다.

## 전체 17개 플러그인

```
harness-builder                ← A 코어 (Claude Code)
harness-builder-cursor         ← Cursor용 A 포트
harness-builder-copilot        ← Copilot CLI용 A 포트
harness-builder-codex          ← Codex CLI용 A 포트
harness-builder-gemini         ← Gemini CLI용 A 포트

harness-floor                  ← C 코어: /visual-qa + /agent-all
harness-floor-cursor           ← Cursor용 C 포트
harness-floor-copilot          ← Copilot CLI용 C 포트
harness-floor-codex            ← Codex CLI용 C 포트
harness-floor-gemini           ← Gemini CLI용 C 포트

harness-thrift                 ← B 코어: /thrift
harness-thrift-cursor          ← Cursor용 B 포트 (advisory-only)
harness-thrift-copilot         ← Copilot CLI용 B 포트 (store_memory 브릿지)
harness-thrift-codex           ← Codex CLI용 B 포트 (TOML config 패처)
harness-thrift-gemini          ← Gemini CLI용 B 포트 (Vertex AI 레이트)

harness-explore                ← D (단일 플랫폼 — Claude Code; 포트 연기)
harness-debug                  ← E (단일 플랫폼 — Claude Code; 포트 연기)
```

## 명령어 레퍼런스

### `/agent-init` — Theme A

`CLAUDE.md`, `.claude/agents/`, 훅, 플러그인 와이어링, 그리고 (기본값) 전체 Floor 테마 번들을 부트스트랩.

```
/agent-init [--theme=floor|lite|thrift] [--size=small|medium|large] [--qa=<persona>[,<persona>]]
            [--merge] [--force] [--dry-run] [--resume]
```

플래그 요약: `--theme` 번들 선택 (floor 기본), `--size` 에이전트 수 (3/6/9), `--qa` QA persona 오버라이드, `--merge` 기존 CLAUDE.md에 추가, `--force` 덮어쓰기, `--dry-run` 미리보기, `--resume` 마지막 완료 phase부터 이어가기.

### `/agent-all` — Theme C

`.claude/agents/` 로스터에 대해 intent → plan → wave-dispatch → gate → PR 실행. 옵션 `--loop` 으로 break-condition 성공까지 반복.

```
/agent-all <prompt-or-path> [--loop] [--max-iter=<N>] [--max-cost=<USD>]
           [--wave-size=small|medium|large] [--no-pr] [--no-brainstorm]
           [--resume] [--force] [--yes]
```

### `/visual-qa` — Theme C

스크린샷 매트릭스 (pages × components × states × breakpoints + flows) 캡처, 이미지별 LLM 분석, 이전 실행과 diff, markdown+JSON 보고서 작성. `.visual-qa.json` config와 Playwright MCP 필요.

```
/visual-qa [--resume] [--force] [--yes] [--budget=<USD>] [--skip-health] [--slug=<custom>]
```

### `/thrift` — Theme B (신규)

Cost-conscious long-session 최적화 설정: context-mode 통합, 프롬프트 캐시 priming (opt-in), 임계값에서 summariser 훅, 세션 종료 시 audit.

```
/thrift                          # 일회성 설정; idempotent
/thrift summarise                # 수동 summariser 트리거
/thrift audit                    # ad-hoc audit 보고서
/thrift --force                  # .thrift.json 재시드
```

`.thrift.json` config로 turn/token 임계값, summariser 모델, 캐시 priming 전략, audit 출력 경로 제어.

### `/explore` — Theme D (신규)

병렬 디스패치 reader 서브에이전트를 통해 구조화된 코드베이스 맵 빌드 (~<2분 / 100K LOC), `git rev-parse HEAD` 키로 캐시, 캐시 대상 빠른 쿼리 명령 노출.

```
/explore                         # 맵 빌드/리프레시; docs/explore/<sha>-map.md 작성
/explore where <symbol>          # 심볼 찾기; 먼저 캐시된 맵 확인 (O(1) lookup)
/explore deps <file>             # 파일의 imports + reverse-imports 표시
```

### `/debug` — Theme E (신규)

체계적 디버깅 워크플로: reproduce → isolate → hypothesize → verify. 상태는 `.debug-state.json`에 영속 (실패 desc, 시도된 hypotheses, checkpoints, 현재 candidate). 10개의 일반적 에러 포맷을 구조화된 citation으로 파싱. `superpowers:systematic-debugging` 스킬을 WRAP.

```
/debug "<failure description>"   # 처음부터 전체 워크플로
/debug --resume                  # 마지막 체크포인트부터 이어가기
/debug --bisect <good> <bad>     # git bisect 래퍼
```

## 스택별 예제

### React + Next.js (full Floor + Thrift)

```bash
npx create-next-app@latest my-app --typescript --eslint
cd my-app && git init && git add -A && git commit -m "initial: next.js"
```

```
/agent-init                                    # Floor 스캐폴드
/thrift                                        # 비용 최적화 설정
/agent-all "프로필 업로드 포함 Google OAuth 추가"
/visual-qa --slug="oauth-feature"
```

### Python FastAPI (lite + manual breakCondition)

```bash
mkdir api && cd api && git init && touch pyproject.toml main.py
git add -A && git commit -m "initial: fastapi"
```

```
/agent-init --size=small
# .agent-all.json 편집: "breakCondition": "npm test" → "pytest"
/agent-all "JWT auth 미들웨어 추가" --loop --max-iter=5
```

### Rust CLI (lite)

```bash
cargo new mycli && cd mycli && git init && git add -A && git commit -m "initial: rust"
```

```
/agent-init --theme=lite
# .agent-all.json 자동 감지 "breakCondition": "cargo test"
/agent-all "git 스타일 워크플로용 서브커맨드 추가" --loop --max-cost=25
```

### 낯선 코드베이스 온보딩

```bash
git clone https://github.com/some/large-repo
cd large-repo
```

```
/agent-init --theme=lite       # 최소 스캐폴드
/explore                       # 코드베이스 맵 빌드 (캐시됨)
/explore where AuthService     # O(1) 캐시 lookup
/explore deps src/auth/jwt.ts  # forward + reverse imports
```

### Flaky 테스트 디버깅

```
/debug "tests/integration/checkout.test.ts가 flaky — ~30% 실행에서 실패"
# Phase 1: reproduce → 실패 실행 캡처
# Phase 2: isolate → ddmin으로 테스트 입력 최소화
# Phase 3: hypothesize → 3개 후보 원인
# Phase 4: verify → 각 가설 테스트
# Phase 5: summarise → .debug/debug-log-<date>.md
```

## 아키텍처

```
agent-skill/
├── .claude-plugin/
│   └── marketplace.json                      # 17개 플러그인 모두 등록
├── plugins/                                  # 플러그인 본체
│   ├── harness-builder/                      # Theme A 코어 + 4 플랫폼 siblings
│   ├── harness-floor/                        # Theme C 코어 + 4 플랫폼 siblings
│   ├── harness-thrift/                       # Theme B 코어 + 4 플랫폼 siblings
│   ├── harness-explore/                      # Theme D
│   └── harness-debug/                        # Theme E
├── scripts/
│   └── sync-lib.mjs                          # 플러그인 간 vendored render.mjs 동기화
├── tests/                                    # 981+ tests (node --test)
├── docs/superpowers/
│   ├── specs/                                # 플러그인/기능별 design 문서
│   ├── plans/                                # 구현 계획
│   └── research-notes/                       # sandbox 한정 spike 결과
├── CHANGELOG.md / CHANGELOG.ko.md
└── README.md / README.ko.md
```

**플러그인별 표준 레이아웃** (17개 모두):

```
plugins/<name>/
├── .claude-plugin/plugin.json
├── README.md
├── skills/<skill>/
│   ├── SKILL.md
│   ├── phases/                               # phase 문서 (오케스트레이터가 순서대로 읽음)
│   ├── lib/                                  # 순수 Node 헬퍼 (독립적으로 테스트 가능)
│   ├── templates/                            # *.hbs Handlebars 템플릿
│   └── references/                           # 설계 노트, 포팅 노트
└── bin/                                      # 설치/런타임 헬퍼
    ├── install.mjs                           # 자동 설치 렌더러
    └── lib/render.mjs                        # vendored Handlebars-lite 렌더러
```

**왜 플러그인마다 `render.mjs` 중복하나:** `cross-platform-isolation.test.mjs` 테스트가 cross-plugin imports를 금지 — 각 플러그인은 self-contained여야 함. `scripts/sync-lib.mjs --check`가 모든 vendored 사본이 `plugins/harness-builder/skills/agent-init/lib/render.mjs`의 canonical 소스와 byte-identical하게 유지되도록 보장.

## 크로스 플랫폼 지원

| 기능 | Claude Code | Cursor | Copilot CLI | Codex CLI | Gemini CLI |
|---|---|---|---|---|---|
| Theme A (`/agent-init`) | ✅ | ✅ (`bin/init.mjs`) | ✅ | ✅ | ✅ |
| Theme C `/visual-qa` | ✅ | ✅ (스캐폴드) | ✅ (스캐폴드) | ✅ (스캐폴드) | ✅ (스캐폴드 + 서브프로세스 dispatch) |
| Theme C `/agent-all` | ✅ | ✅ (prompt 템플릿) | ✅ (`task` tool) | ✅ (`agent` hook OR sequential) | ✅ (서브프로세스 fan-out) |
| Theme B `/thrift` | ✅ | ✅ (advisory-only, no hooks) | ✅ | ✅ (TOML config 패처) | ✅ (Vertex 레이트 테이블) |
| Theme D `/explore` | ✅ | — (포트 연기) | — | — | — |
| Theme E `/debug` | ✅ | — (포트 연기) | — | — | — |

"스캐폴드" 항목은 config + hook 템플릿이 오늘 출시됐고 오케스트레이터 런타임이 spec 형식(`docs/superpowers/specs/2026-05-18-*-impl-spec.md`)으로 문서화되었음을 의미; 프로덕션 lib 모듈은 Claude Code에 출시되었고 impl spec에 따라 각 플랫폼에 점진적으로 출시.

라이브 CLI 런타임 검증은 `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`에 추적.

## 버전 관리

모든 플러그인은 **v0.1.0** (크로스 플랫폼 포트) 또는 **v0.2.0** (Claude Code 오리지널)으로 출시. 전체 릴리스 히스토리는 [CHANGELOG.md](CHANGELOG.md) 참조.

2026-05-18의 주요 iteration:
- 41 commits — 초기 Themes A + C + 크로스 플랫폼 스캐폴드
- 7 commits — visual-qa 6-phase + agent-all 4 sub-projects + design specs
- 5 commits — install 렌더러 + spawn dispatcher + ask-user 어댑터 + thrift design
- 4 commits — harness-thrift v0.1
- 1 commit (`11d8b10`) — 7개 병렬 agents가 만든 12 specs + 6 host invoker / install / SDK 구현
- 2 commits (`0aa3cea` + `5d6fbe5`) — 10개 병렬 agents가 만든 6개 신규 플러그인 (4 thrift 포트 + explore + debug) + 플랫폼별 agent-all/visual-qa 구현 (554 신규 테스트; 981/981 pass)

## FAQ

**Q: `/agent-init`이 내 CLAUDE.md를 덮어쓰나요?**
아니요. 기본값은 CLAUDE.md 존재 시 abort. `--merge`로 harness 섹션 추가, `--force`로 덮어쓰기.

**Q: `/agent-all --loop`이 안전한가요?**
`--max-iter` (하드캡 50), `--max-cost` (기본값 $500), `breakCondition`으로 bound. 빠듯한 비용 cap과 명확한 테스트 명령을 설정하면 무한 실행 불가.

**Q: `/thrift`가 내 컨텍스트 동작을 즉시 바꾸나요?**
네. `/thrift` 이후, 설치된 hooks가 이 프로젝트의 모든 이후 Claude Code 턴에서 발사. PreToolUse 강제 제안이 inline으로 나타남; PostToolUse는 토큰 카운트; summariser가 임계값에서 발사 (advisory v1 — 요약 파일을 작성하고 `/compact` 실행을 요청). Phase 5 audit가 세션 종료 시 발사.

**Q: 프롬프트 캐시 priming이 가치가 있나요?**
짧은 세션에는 종종 아니요. `cache.enabled = false` 기본값. ≥15분 세션이고 턴 사이 >5분 일시정지하는 경우에만 활성화 (`evaluateCachePrimeROI`의 ROI gate가 그렇지 않으면 경고).

**Q: `/explore`가 private 파일을 볼 수 있나요?**
기본값으로 `.gitignore` 준수. 필요하면 `.explore.json`의 ignore globs에 `node_modules`, build 디렉토리 등 추가.

**Q: `/debug`가 실제로 내 코드를 실행하나요?**
Phase 1에서 제공한 `repro` 명령을 통해서만 (그리고 확인하는 경우에만). 재현은 프로젝트의 기존 테스트 러너로 `shell_command`를 통해 호출; 다른 코드 실행 없음.

**Q: 플러그인 업데이트는 어떻게 하나요?**
위 [플러그인 업데이트 방법](#플러그인-업데이트-방법) 참조. 요약: Claude Code에서 `/plugin update --marketplace agent-skill`.

**Q: CLI 호스트가 목록에 없으면?**
lib 모듈(`plugins/*/skills/*/lib/*.mjs`)은 호스트 의존성 없는 순수 Node.js — 도구에 vendor 가능. `phases/*.md`의 phase 문서는 언어 무관. 호스트마다 다른 부분은 skill-orchestration 레이어; 포팅 템플릿은 `docs/superpowers/specs/2026-05-18-*-impl-spec.md` 파일 참조.

**Q: 버그 신고는 어디?**
https://github.com/kim-song-jun/agent-skill/issues 에 이슈 등록. 플러그인별 버그: 제목에 플러그인 이름 prefix (`[harness-thrift] …`).
