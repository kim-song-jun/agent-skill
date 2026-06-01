> 🇺🇸 English: [README.md](README.md)

# agent-skill

![status](https://img.shields.io/badge/status-release--smoke--verified-blue) ![tests](https://img.shields.io/badge/tests-1752%20passing-brightgreen) ![plugins](https://img.shields.io/badge/plugins-18-blue) ![themes](https://img.shields.io/badge/themes-5%20(A%20B%20C%20D%20E)-blueviolet) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

**스스로 굴러가는 agent-first 워크플로.** 프로젝트당 `/agent-init` 한 번, 기능당 `/agent-all "..." --loop --qa` 한 번 — agent가 brainstorm → 계획 → 구현 → 테스트 → **모든 페이지 visual QA** → PR을 알아서 진행하고, **테스트와 UI 둘 다 통과할 때까지 알아서 반복**합니다. 매 턴 babysitting 필요 없음.

오늘 Claude Code에서 동작, 그리고 **Cursor, GitHub Copilot CLI, VS Code Copilot, Codex CLI, Gemini CLI** 크로스 플랫폼 포트 포함. 18개 플러그인, 5개 슬래시 명령, 하나의 마켓플레이스.

```
/agent-init                                    # 모든 git 저장소 부트스트랩 (Phase A — 프로젝트당 한 번)
/agent-all "OAuth 추가" --loop --qa             # 테스트 + visual-qa 둘 다 통과까지, PR 열기 (Phase C)
/visual-qa                                     # 모든 페이지 스크린샷 + LLM 디자인 리뷰 (declared/comprehensive)
/thrift                                        # 긴 세션 저렴하게 (자동 요약, audit)
/explore                                       # 코드베이스 맵; /explore where Foo → O(1) lookup
/debug "테스트가 30% 실행에서 flaky"            # 재현 → bisect → 가설 → 검증
```

**핵심 3가지:**

1. **Project-first 스캐폴딩.** `/agent-init`은 어떤 git 저장소에서든 동작 — Next.js, FastAPI, Rust CLI, 모노레포. 스택 감지, 올바른 테스트 명령 선택, `CLAUDE.md` + `AGENTS.md` + agents + hooks + config를 한 번의 commit에 생성. 같은 명령, 모든 프로젝트.

2. **메인 스레드를 보존하는 agent-first 실행.** `/agent-all "..."`은 채팅이 아닙니다. brainstorm → 계획 → 구현 → 리뷰 → PR을 **하나의 파이프라인**으로 실행하고, 구현/리뷰 같은 무거운 작업은 **격리된 subagent**에서 일어남 — 그들의 turn-by-turn 출력은 메인 대화에 들어오지 않음. 내장 2-레이어 안전망이 구현자별 `superpowers:verification-before-completion` 호출을 강제하고 Phase 4 리뷰에서 그것을 cross-check — 깨진 코드가 PR로 sneak in 못 함. 메인 세션은 작게 유지 (계획 + 판단) → 같은 Claude Code 세션이 context bloat 없이 몇 시간 지속 가능.

3. **한-플래그 end-to-end 검증.** `--qa`가 loop의 "완료" 체크를 **tests + visual UI check**에 연결: visual-qa가 모든 페이지를 crawl, 모든 interactive 요소를 DOM-walk, 각 버튼 shallow-click, 모든 상태 스크린샷, baseline 대비 diff — tests와 UI verdict 둘 다 통과해야 loop break. 무인 야간 실행은 `/thrift` + `/goal`과 조합. [Self-sustaining 워크플로](#self-sustaining-워크플로) 참조.

그게 전부입니다. README의 나머지는 참고용 — 필요한 부분만 훑어보세요.

---

## 사전 요구사항

- **Node.js ≥ 20** — 모든 install 렌더러에 필요 (`bin/init.mjs`, `bin/install.mjs`, `scripts/install-all.sh`, `scripts/install-platform.sh`)
- **git** — `/agent-init`, `/agent-all`, `/explore` (HEAD 키 캐시)에 필요
- **gh CLI** (선택) — `/agent-all` Phase 5 PR 생성용; 없으면 `/agent-all`이 `--no-pr` 모드로 fallback
- **Claude Code**: 마켓플레이스 플러그인 지원 (최근 빌드 아무거나)
- **플랫폼별 프로젝트 렌더러**: 쓰기 가능한 target project directory. Target CLI는 생성된 워크플로를 실행할 때만 필요하며, `install-platform.sh`는 전역 CLI config 파일을 패치하지 않음.

강력 권장 (harness가 그 위에 조합 — 없으면 graceful degrade):

- `superpowers@claude-plugins-official` — 기반 skills (brainstorming, writing-plans, subagent-driven-development, verification-before-completion 등)
- `context-mode@context-mode` — raw 도구 출력을 메인 대화에서 격리

[Claude 생태계의 다른 플러그인과의 관계](#claude-생태계의-다른-플러그인과의-관계)에서 통합 방식 자세히 참조.

---

## 60초 설치

먼저 마켓플레이스 등록 (머신당 한 번):

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

### 옵션 A: 원-라이너 (권장)

```bash
# Claude Code 밖, 터미널에서:
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --foundations
```

`claude` CLI를 통해 Claude Code 필수 5개와 승인된 foundation(`superpowers@claude-plugins-official`, `context-mode@context-mode`)을 한 번에 설치. `--all`로 18개 전체 (CLI-platform sibling 포함), `--cli=codex|copilot|gemini|cursor`로 특정 플랫폼 세트, 또는 `--foundations-only`로 foundation만 부트스트랩. `--dry-run`을 붙이면 `claude` 호출 없이 정확한 계획만 출력합니다.

### 옵션 B: Claude Code에 붙여넣기

```
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/reload-plugins
```

(Claude Code의 `/plugin install`은 한 번에 하나만 받음 — 옵션 A의 스크립트가 더 빠름.)

### 프로젝트에서

```
cd my-project
/agent-init
```

`/agent-init`은 마지막에 post-install doctor를 실행합니다. 언제든 다시 실행할 수 있습니다:

```bash
node /path/to/harness-builder/bin/doctor.mjs --target=. --platform=claude
```

source checkout에서는 `node /tmp/agent-skill/scripts/doctor.mjs ...` compatibility wrapper를 쓰면 됩니다.

완료. `/agent-all "작은 기능"`으로 실제로 동작하는지 확인해보세요.

---

## 플러그인 최신 상태 유지

**Claude Code 안에서:**
```
/plugin update --marketplace agent-skill
```

이 한 명령으로 마켓플레이스에서 **이미 설치된** 모든 것이 업데이트.

**터미널에서 (모든 플랫폼, one-liner):**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kim-song-jun/agent-skill/main/scripts/update.sh)
```

`scripts/update.sh`가 레포를 자동 위치 파악 (또는 temp dir에 clone), 최신 pull, vendored lib 검증 (`sync-lib.mjs --check`) 후, 이미 설치된 선택 플러그인을 강제 업데이트(언인스톨 후 재설치)하고 누락분은 `install-all.sh`로 설치합니다. `--all`로 18개 모두, `--cli=cursor|copilot|codex|gemini`로 한 플랫폼. 전역 CLI config 파일은 패치하지 않음.

`scripts/update.sh --foundations`를 쓰면 승인된 foundation 플러그인인 `superpowers@claude-plugins-official`와 `context-mode@context-mode`도 함께 갱신합니다. `scripts/update.sh --foundations-only`는 agent-skill 선택 플러그인은 건드리지 않고 approved foundation plugins만 업데이트/설치합니다.

마켓플레이스 없는 다른 CLI는 [다른 도구에서 업데이트](#다른-도구에서-업데이트) 참조.

### 신규 추가된 플러그인 설치

중요: `/plugin update`는 **이미 설치한 플러그인만** 업데이트. 마켓플레이스는 시간이 지나며 늘어남 (예: `harness-debug-codex`는 Claude-native debug 출시 뒤 추가됨). 이들 가져오려면:

```
/plugin marketplace update agent-skill        # 목록 새로고침
/plugin install harness-thrift@agent-skill    # 원하는 신규 플러그인 각각 설치
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/plugin install harness-debug-codex@agent-skill
/reload-plugins                               # 적용
```

**빠른 확인** — 현재 이 마켓플레이스에서 무엇이 설치돼 있는지:

```bash
cat ~/.claude/plugins/installed_plugins.json | python3 -m json.tool | grep -B1 agent-skill
```

카운트가 5 미만이면 (Claude Code 권장 세트: builder + floor + thrift + explore + debug) 최근 추가분이 빠져 있는 것.

---

## 각 명령이 하는 일

### `/agent-init` — 프로젝트 설정

프로젝트당 한 번만 실행. 운영 모드는 task ledger 파일, 로컬 폴더 가이드, Claude/Codex 정책 훅, reviewer 페르소나를 생성합니다. 기존 `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`는 덮어쓰지 않고 `agent-skill:operational` sentinel 섹션만 추가하거나 교체합니다.

```
/agent-init                       # 기본값: 운영형/무거운 scaffold
/agent-init --lite                # 최소 루트 메모리 + 최소 역할
/agent-init --lang=ko             # 한국어 프롬프트를 CLAUDE.md + .agent-all.json language에 유지
/agent-init --lang=auto           # AGENT_INIT_LANG/로케일에서 언어를 해석한 뒤 ko/en 기록
/agent-init --dry-run             # 생성/패치 계획만 출력
/agent-init --update-foundations  # 승인된 foundation 플러그인만 업데이트
```

### `/agent-all` — 기능 출시

자유 형식 프롬프트 OR 기존 task 파일을 받습니다. 계획 → 코드 작성 → 테스트 → PR 생성.

```
/agent-all "Google OAuth 추가"                        # 프롬프트 → PR
/agent-all docs/tasks/12.md                          # 작성된 task 사용
/agent-all "flaky 테스트 수정" --loop --max-iter=5    # 테스트 통과까지 시도
/agent-all "..." --no-pr                             # 로컬 전용 (PR 없음)
```

`--max-iter` (하드캡 50), `--max-cost` (기본 $500), `.agent-all.json`의 테스트 명령으로 bound됨. 무한 실행 불가.

### `/visual-qa` — 모든 페이지 디자인 리뷰

모바일/태블릿/데스크탑에서 스크린샷 캡처, 이미지별 LLM 분석, Markdown 보고서 작성. Playwright MCP + dev 서버 필요.

두 가지 모드 (`.visual-qa.json`의 `mode` 필드):

- **`declared`** (기본, back-compat): 페이지 + selector + states를 직접 명시.
- **`comprehensive`**: 모든 것 자동 발견. `baseUrl`에서 crawl, 각 페이지 DOM에서 모든 interactive 요소 (button, link, input, `[data-testid]`, `[role=*]`) walk, 각 non-input을 shallow-click해서 1-step 결과 캡처. 이전 accepted run 대비 verdict 계산; git-diff scope + DOM-hash cache로 비용 제한. `/agent-all --loop --qa`가 매 iter 호출하는 게 이 모드.

```
npm run dev                     # 다른 터미널에서
/visual-qa                      # 캡처 + 분석
/visual-qa --slug="launch"      # 커스텀 출력 폴더
/visual-qa --budget=20          # LLM 비용 $20로 제한
```

결과: `docs/visual-qa/<date-or-slug>/report.md` (+ comprehensive 모드에선 `verdict.json`).

### `/thrift` — 긴 세션을 저렴하게

1시간 이상 세션용. 큰 도구 출력에 `ctx_execute` 자동 제안, 임계값에서 대화 요약, 세션 종료 시 비용 audit.

```
/thrift              # 일회성 설정
/thrift summarise    # 수동 요약 트리거
/thrift audit        # 비용 보고서
```

`.thrift.json` 편집으로 턴/토큰 임계값 튜닝. 캐시 priming은 **기본값 OFF** — 15분 미만 세션에는 이득 없음.

### `/explore` — 빠른 코드베이스 탐색

프로젝트의 구조화된 맵 빌드 (~100K 라인 / 2분), git 커밋별 캐시, 재-grep 없이 쿼리.

```
/explore                              # 맵 빌드/리프레시
/explore where AuthService            # 캐시 lookup
/explore deps src/auth/jwt.ts         # imports + reverse-imports
```

### `/debug` — 체계적 디버깅

영속 상태로 단계별 워크플로 — 긴 디버깅 세션에서 컨텍스트를 잃지 않습니다.

```
/debug "auth flow 테스트가 30% 실행에서 실패"
/debug --resume                       # 이어가기
/debug --bisect <good-sha> <bad-sha>  # git bisect 래퍼
```

10개 에러 포맷 파싱 (Python tracebacks, JS stack traces, pytest/jest/rust/tsc/gcc/ESLint 등) — 클릭 가능한 citation으로 변환.

---

## 자주 쓰는 워크플로

**UI 기능을 end-to-end로 출시 (가장 강력한 플로):**
```
npm run dev            # 다른 터미널에서 — dev 서버 http://localhost:3000
/agent-all "차트 + 필터 있는 사용자 대시보드 빌드" --loop --qa --max-iter=10
# 자리 비움 — tests와 visual-qa 둘 다 통과해야 loop break
```

**새 프로젝트 시작, 기능 출시:**
```
mkdir my-app && cd my-app && git init && git commit --allow-empty -m "init"
/agent-init
/agent-all "Markdown을 PDF로 변환하는 CLI 빌드"
```

**낯선 코드베이스 온보딩:**
```
git clone <repo> && cd <repo>
/agent-init --lite
/explore
/explore where MainController
```

**Flaky 테스트 수정:**
```
/debug "tests/integration/checkout.test.ts가 flaky"
# 진행: 재현 → bisect → 가설 → 검증
```

**런칭 전 체크리스트:**
```
/agent-all "랜딩 페이지 다듬기, analytics 이벤트 추가" --loop
/visual-qa --slug="pre-launch"     # 디자인 리뷰
/thrift audit                       # 이 세션 비용은?
```

**긴 디버깅 마라톤 (비용 절감):**
```
/thrift                  # 먼저 비용 최적화 설정
/debug "..."             # 그 다음 디버깅 — thrift hooks 자동 발사
```

---

## 테마 고르기

테마는 특정 종류 작업을 위한 플러그인 묶음입니다:

| 테마 | 명령 | 무엇을 주나 |
|---|---|---|
| **Builder** (A) | `/agent-init` | 프로젝트 스캐폴딩. 한 번만 실행. |
| **Floor** (C) | `/agent-all`, `/visual-qa` | 기능 출시. 비용 무제한. |
| **Thrift** (B) | `/thrift` | 긴 세션 비용 최적화. |
| **Explore** (D) | `/explore` | 코드베이스 매핑 & 쿼리. |
| **Debug** (E) | `/debug` | 체계적 디버깅. |

테마는 자유롭게 조합. 전형적 세션은 Builder 한 번 → 실제 작업에 Floor → Thrift는 백그라운드 조용히.

---

## Self-sustaining 워크플로

### 왜 동작하는가 — 메인 스레드 격리

`/agent-all`의 진짜 trick은 loop이 아니라 **어디서 작업이 일어나는가**입니다.

| Phase | 어디서 실행 | 메인 context로 들어오는 것 |
|---|---|---|
| 0 Preflight | main | git 체크 (~매우 적음) |
| 1 Intent (brainstorm) | main | 사용자와 Q&A (적당히 누적) |
| 2 Plan | main | plan 파일 (적당히) |
| **3 Dispatch (3a/3b/3c)** | **fresh subagents (3a/3c 병렬) + main (3b 순차 ask)** | 스코핑 payload (task당 수백 토큰) + 사용자 선택 답변 — implementer의 코드 작성은 격리 |
| **4 Gate** | **fresh subagents** | spec/quality verdict + reviewer-audit 토큰만 — reviewer의 읽기는 격리 |
| 5 PR | main | `gh pr create` 결과 (작음) |
| 6 Loop | main | breakCondition exit code (숫자 하나) |

무거운 작업(코드 읽기, 패치 작성, 테스트 실행, 실패 수정)은 `superpowers:subagent-driven-development`로 디스패치된 **subagent 내부에서** 일어남. 각 subagent는 fresh 대화; turn-by-turn 출력은 메인 세션에 안 들어옴. 메인은 verdict만 봄 — 그래서 loop iteration이 50K 토큰이 아닌 2~5K만 추가.

### Decision-surfacing — subagent가 입력을 기다리는 순간

Phase 3는 이제 **3a (scoping) → 3b (ask) → 3c (implement)**로 실행됩니다. 각 implementer subagent가 먼저 read-only scoping pass를 수행하고 아키텍처/스펙 모호점 결정들을 구조화된 JSON payload로 반환. main thread는 이를 1/2/3 패널(subagent의 추천 표시)로 `AskUserQuestion`을 통해 보여줍니다. 답변이 baked-in된 채로 subagent를 재-dispatch.

**Non-TTY 모드** (야간 루프, `--yes`, iteration ≥ 2)에서는 recommended 옵션을 자동 선택하고 `.agent-all-state.json` + `docs/agent-all/iter-<N>/decisions.md`에 로그. 야간 워크플로 그대로 보존.

단일 `floor-policy` hook 쌍 (PreToolUse + PostToolUse on `Task`)으로 강제. `verification_passed`와 `VERIFICATION_AUDIT:` 토큰도 같이 검증. 프로젝트별 opt-out은 `.agent-all.json`:

```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```

자세한 디자인: `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`.

### 조합 가능한 셋

야간 실행에는 세 가지가 함께 동작:

| 조각 | 해결 | 아는 것 |
|---|---|---|
| **`/agent-all --loop`** | 워크플로를 비용 한도 내 검증된 완료까지 드라이브 | Phases, plan, 디스패치된 agents, 시도한 것, 누적 비용, 실패 지점 |
| **`/thrift`** | 메인에 *실제로 누적되는* 것을 세션 bloat 전에 압축 | 토큰 카운트 임계값, 캐시 priming, 세션 종료 audit |
| **`/goal`** | iteration 간 Claude Code가 세션을 끝내지 못하게 막기 | 작업에 대해 모름 — 순수 Stop-event blocker |

```
/thrift                                                 # 비용 가드레일 (프로젝트당 한 번)
/goal "analytics 대시보드를 모든 CI 통과 상태로 출시"   # 세션이 스스로 살아있음
/agent-all "analytics 대시보드 빌드" --loop --qa \
  --max-iter=15 --max-cost=80
# 자리 비움 — 깨어나면 merged PR 또는 "iter 7에서 <이유>로 정지" 정밀 리포트
```

### Loop 완료 — "완료"의 정의

Loop는 매 PR 후 Phase 1로 재진입하며, **break-condition**이 통과할 때까지 반복. 다음 중 하나 선택:

| 원하는 것 | 사용법 | 매 iter 실행 |
|---|---|---|
| Tests만 | `--loop` (첫 프롬프트에서 "Test command" 선택) | `npm test` / `pytest` / `cargo test` — 스택 자동 감지 |
| 풀 E2E (tests + visual UI 체크) | `--loop --qa` ← **단축형** | tests → visual-qa comprehensive |
| 커스텀 명령 | `--break-condition='make ci'` | 한 줄 명령 |
| 명시적 spec | `--break-condition='{"type":"composite","steps":[...]}'` | JSON spec |

프로젝트에서 **첫 번째** `/agent-all --loop` 실행 시 Phase 0이 대화형(test / visual-qa / custom / composite)으로 물어보고 `.agent-all.json`에 저장 여부를 묻습니다. 이후 실행은 저장된 값 재사용. `--reconfigure`로 재프롬프트 강제; `--yes` / non-TTY는 프롬프트 건너뜀.

### `--qa` end-to-end: 사전 요구사항과 단계별 동작

`/agent-all "build user dashboard" --loop --qa --max-iter=10`

**사전 요구사항** ("안 도는것 같다"의 가장 흔한 원인):

- `http://localhost:3000` (또는 `.visual-qa.json`의 `baseUrl`)에서 **dev 서버 실행 중**. Phase 0이 `curl --max-time 3`으로 probe; 안 닿으면 시작 전에 명확한 prompt.
- **Playwright MCP** 설치됨 (`mcp__plugin_playwright_playwright__*` 도구 사용 가능해야 함). `/visual-qa --skip-health`로 sanity check 가능.

**`--qa`가 실제로 하는 일**:

1. **Phase 0**: `baseUrl` probe. 없으면 계속할지 확인. `.visual-qa.json` 없으면 sane defaults로 scaffold (mode=comprehensive, scope `/`, maxPages 50, depth 3, click 1-level, vs-baseline verdict, **firstRun=report** — iter 1이 baseline에 조용히 잠그지 않고 이슈 surface).
2. **Phase 1-5**: agent-all 일반 파이프 — brainstorm → plan → wave-dispatched implement → wave-reviewed → PR.
3. **Phase 6 (loop)**: 먼저 `test-auto` (스택 감지 테스트 명령). 테스트 실패 → 다음 iter. 통과 → fresh Task-tool subagent를 디스패치해서 `visual-qa` 스킬을 `--slug=loop-iter-<N> --force --yes`로 invoke (per-iter slug로 iter들이 서로 안 덮어쓰고, visual-qa Phase 2가 이전 iter을 baseline으로 찾음).
4. visual-qa가 자체 6-phase 파이프 실행: `baseUrl`에서 crawl, 페이지마다 DOM-walk으로 interactive 요소, 각 button/link shallow-click, 각 상태 스크린샷, LLM이 각 샷 분석, baseline 대비 verdict 계산. 새 critical/major regression 없으면 exit 0; 있으면 exit 1.
5. Phase 6가 verdict 봄. Pass → loop break (완료). Fail → 이전 실패가 plan에 보이는 상태로 다음 iter 시작.

**비용 제어** (loop iteration이 폭주하지 않도록):

- **git-diff scope**: 마지막 iter 이후 소스 변경된 페이지만 재크롤 (Next.js / Remix framework 자동 감지; 보수적 "전체 재실행" fallback)
- **DOM-hash cache**: DOM 안 바뀐 컴포넌트는 LLM 재분석 대신 이전 verdict 재사용
- **`--max-iter`** + **`--max-cost=USD`** 항상 하드 캡

### `/agent-all --loop` 플래그 레퍼런스

| 플래그 | 기본값 | 효과 |
|---|---|---|
| `--loop` | off | Phase 6 재진입 활성화. 첫 사용 시 break-condition 프롬프트. |
| `--max-iter=N` | 1 | iteration 하드 캡 (서버 50으로 클램프) |
| `--max-cost=USD` | 500 | 누적 API 비용 캡; 매 wave 후 체크 |
| `--qa` | — | 단축형: composite `test-auto → visual-qa(comprehensive)` + autoscaffold. 위 참조. |
| `--break-condition=<spec>` | — | 비대화형 override. JSON 객체 또는 shell 문자열. |
| `--reconfigure` | — | `.agent-all.json`에 non-default 값 있어도 재프롬프트 강제. |
| `.agent-all.json: breakCondition` | `npm test` (자동 감지) | 저장 spec. 문자열 = shell; 객체 = `shell` / `test-auto` / `visual-qa` / `composite`. |
| `.agent-all.json: stableIters` | 1 | loop 깔끔히 종료 전 필요한 연속 pass 수. |

### Troubleshooting — 흔한 loop / `--qa` 실패

| 증상 | 원인 추정 | 해결 |
|---|---|---|
| visual-qa가 `exit=1`로 즉시 loop 종료 | dev 서버가 `baseUrl`에서 안 도는중 | 다른 터미널에서 `npm run dev` (또는 동등), 그 후 `--resume` |
| visual-qa가 "playwright MCP not available"로 중단 | Playwright MCP 설치 안 됨 | `claude mcp add plugin-playwright` (또는 플랫폼 동등) |
| Loop이 도는데 **절대로** break 안 됨 | `stableIters > 1`이고 연속 N회 중 한 번이 간헐 실패 | `.agent-all-state.json`의 `consecutivePass` 확인; 테스트가 flaky면 `stableIters: 1` |
| visual-qa가 iter 2에 `--max-cost` hit | DOM-hash cache cold + git-diff scoper가 필터링할 게 없음 | iter 2+는 보통 더 쌈; 그래도 폭주하면 `comprehensive.cache.gitDiffScope: true` (기본) 확인하고 autoscaffold framework 감지 검증 |
| iter 1이 "통과"인데 UI가 명백히 깨져있음 | first-run 정책이 `report` (기본) — loop 통과지만 이슈는 report에 기록됨. `docs/visual-qa/loop-iter-1/report.md` 읽기 | 이슈 수정 후 iter 2가 iter-1 baseline 대비 검증 |
| `--qa`가 config를 썼는데 다른 설정 쓰고 싶음 | `--qa` autoscaffold는 `.visual-qa.json` 없을 때만 동작 | `.visual-qa.json` 직접 편집 (scope, breakpoints, baseUrl 등) — 이후 실행은 그 파일 사용 |

### `/goal`이나 Ralph Loop와 어떻게 다른가

`/agent-all --loop`은 **"Ralph Loop + 기능 추가"가 아닙니다** — 루프하는 orchestrator입니다. 차이가 중요한 이유:

| 도구 | 해결하는 문제 | 아는 것 |
|---|---|---|
| **`/goal`** | "조건 만족까지 세션 중지하지 말 것." | 작업에 대해 모름. 순수 Stop-event blocker. |
| **Ralph Loop** | "이 프롬프트를 N분마다 재실행." | 실행 사이에 모름. Stateless 재발사. |
| **`/agent-all --loop`** | "완전한 워크플로(brainstorm → 계획 → 코드 → 리뷰 → PR)를 비용 한도 내 검증된 완료까지 드라이브." | Phases, plan, 디스패치된 agents, 시도한 것, 누적 비용, 실패 지점. |

harness가 둘 다 없는 것을 추가: multi-phase 워크플로 인지, **stateful 재시도** (매 iter이 이전 실패를 봄), **wave-granularity 비용 cap** (`--max-cost`이 매 wave 후 체크 → 비용 폭발 시 기능 중간 bail 가능), **`.agent-all-state.json` 기반 resume-from-failure**, **phase-aware break-condition** (PR 생성 후 평가, 구현 도중 아님).

`/goal`과 Ralph는 **대안이 아니라 보완재**. `/goal` + `/agent-all --loop`은 위에 보여준 무인 야간 패턴. Ralph가 non-`--loop` `/agent-all` 감싸는 건 wall-clock 주기성에만 의미 (예: `/ralph-loop 5m /agent-all "deploy 확인"`).

---

## 스택별 예제

### Next.js + TypeScript

```bash
npx create-next-app@latest my-app --typescript
cd my-app && git init && git add -A && git commit -m "init"
```
```
/agent-init                                # TS 감지, breakCondition: npm test
/agent-all "프로필 업로드와 함께 Google OAuth 추가"
/visual-qa --slug="oauth"
```

### Python FastAPI

```bash
mkdir api && cd api && touch pyproject.toml main.py
git init && git add -A && git commit -m "init"
```
```
/agent-init --size=small
# .agent-all.json 열어서 "breakCondition"을 "pytest"로 변경
/agent-all "JWT auth 미들웨어" --loop --max-iter=5
```

### Rust CLI (visual-qa 불필요)

```bash
cargo new mycli && cd mycli && git init && git add -A && git commit -m "init"
```
```
/agent-init --lite                         # Cargo.toml 감지 → "cargo test"
/agent-all "git 스타일 서브커맨드 추가" --loop --max-cost=25
```

---

## Claude Code 또는 다른 AI 도구에서 사용

Claude Code는 native 마켓플레이스를 가짐 (`/plugin install`)이고, Claude 안에서는 `/agent-init`이 기본 setup 경로입니다. 터미널에서 project bootstrap을 하고 싶을 때는 `install-platform.sh --platform=claude`가 같은 project-local 렌더러를 Claude Code 밖에서 실행합니다. 다른 AI 도구들 — Cursor, GitHub Copilot, Codex CLI, Gemini CLI, VS Code — **는 AI 워크플로용 비교 가능한 플러그인 마켓플레이스가 아직 없음**, 그래서 같은 wrapper가 프로젝트에 올바른 파일을 씁니다. CLI 플랫폼은 그 도구가 기대하는 레이아웃의 config/hook/skill 파일을 받고, VS Code Copilot은 에디터 지침 전용 파일만 받음.

### 플랫폼별 원-라이너 설치

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
cd /tmp/agent-skill

# Claude Code project bootstrap outside Claude Code
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --lite

# Cursor
./scripts/install-platform.sh --platform=cursor --target=/path/to/my-project

# GitHub Copilot CLI
./scripts/install-platform.sh --platform=copilot --target=/path/to/my-project

# VS Code + Copilot 확장 (지침 전용)
./scripts/install-platform.sh --platform=vscode-copilot --target=/path/to/my-project  # 지침 전용

# OpenAI Codex CLI
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lang=ko
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --no-update-foundations
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --update-foundations  # foundation 갱신 strict 모드
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --theme=debug

# OpenAI Codex CLI, 가벼운 builder-only scaffold
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lite

# Google Gemini CLI / antigravity
./scripts/install-platform.sh --platform=gemini --target=/path/to/my-project
```

기본값은 operational scaffold 설치. Claude가 아닌 플랫폼은 사용 가능한 무거운 테마를 기본으로 설치합니다: 공통으로 builder + floor + thrift, Codex는 debug까지 포함. 하나만 설치하려면 `--theme=floor`, `--theme=thrift`, 또는 Codex 전용 `--theme=debug`를 사용하세요. Claude project bootstrap은 operational builder scaffold, `--theme=builder`, `--lite`를 지원하며 Claude slash-command 플러그인 설치는 `install-all.sh` 또는 `/plugin install`로 진행합니다. `--lite`는 builder-only 경량 scaffold이며, Codex에서는 `codex-init --lite`로 전달되어 floor/thrift/debug 파일과 전역 config 스니펫을 건너뜀. VS Code Copilot은 지침 전용 경로라 floor/thrift/debug theme 설치를 받지 않음. `--lang=ko|en|auto`로 생성된 루트 지침과 `.agent-all.json`의 language 값을 builder/floor 산출물 전체에 맞출 수 있음. Claude/Codex operational 설치는 `claude` CLI가 있으면 승인된 foundation 플러그인(`superpowers@claude-plugins-official`, `context-mode@context-mode`)만 자동 갱신하고, `claude`가 없으면 degraded foundation 경고를 출력한 뒤 scaffold를 계속 진행합니다. `--update-foundations`는 갱신 실패를 strict 실패로 만들 때, `--no-update-foundations`는 opt-out할 때, `--dry-run`은 `claude` 호출 없이 승인된 계획만 볼 때 사용하세요. Claude와 Codex `all`, `builder`, `--lite`, 그리고 Codex `--theme=debug` 설치는 post-install doctor를 자동 실행하며, 검증을 의도적으로 미룰 때만 `--no-doctor`를 넘기세요. `install-platform.sh`는 project-local 파일을 쓰고 전역 config 스니펫을 stdout으로 출력할 뿐, 전역 CLI config 파일을 패치하지 않음.

Claude 또는 Codex 프로젝트 설치 후 plugin-local doctor(`node /path/to/harness-builder/bin/doctor.mjs --target=/path/to/my-project --platform=claude` 또는 `node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex`)로 수동 재검증할 수 있습니다. source checkout에서는 `node /path/to/agent-skill/scripts/doctor.mjs ...`가 같은 compatibility wrapper입니다. project-local Claude/Codex scaffold를 검증하고, 가능하면 operational/builder/lite 또는 Codex debug profile을 자동 감지하며, 누락 artifact는 non-zero exit로 보고하고 승인된 foundation 누락은 경고합니다.

### 각 플랫폼이 받는 파일

| 플랫폼 | 작성되는 파일 | 비고 |
|---|---|---|
| **Claude Code** | `CLAUDE.md`, `AGENTS.md`, `.claude/agents/*.md`, `.claude/hooks/*.mjs`, `.visual-qa.json`, `.agent-all.json` | `/agent-init`과 같은 operational scaffold를 터미널에서 project bootstrap; marketplace 플러그인 설치는 여전히 `install-all.sh` 또는 `/plugin install`. |
| **Cursor** | `.cursor/rules/*.mdc`, `.cursor/agents/*.md`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | 모두 native. 병렬 subagent에 `is_background: true`. |
| **Copilot CLI** | `.github/copilot-instructions.md`, `.github/hooks/*.json`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | Builder hook stub은 project-local; floor decision protocol은 기본 프롬프트 수준. 선택적 hook helper는 수동 hook 검토 필요. |
| **VS Code Copilot** | `.github/copilot-instructions.md` | VS Code Copilot 확장이 이 파일을 자동 읽음. 이 editor-only 경로에는 floor, visual-qa, thrift, Copilot CLI 자동화 파일을 설치하지 않음. |
| **Codex CLI** | `AGENTS.md`, `.codex/skills/<role>/SKILL.md`, `.codex/skills/debug-codex/SKILL.md`, `.codex/hooks/agent-policy-hook.mjs`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json`, `.debug-artifacts/`, `docs/debug/` | `[mcp_servers.playwright]` 스니펫과 `[[hooks.PreToolUse]]` 같은 현재 command hook 스니펫을 stdout으로 출력. Floor 워크플로는 Codex command hook이 Claude Code의 Task-style subagent 표면을 제공하지 않으므로 프롬프트/순차 dispatch로 동작. Debug는 `run /debug "<failing command>"`로 실행. |
| **Gemini CLI** | `GEMINI.md`, `.gemini/skills/<role>/SKILL.md`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | `mcpServers` 스니펫이 stdout으로 출력 — `~/.gemini/settings.json`에 **수동 merge**. |

### 설치 후 실제로 어떻게 사용하나?

각 도구가 스킬을 자체 방식으로 invoke. harness는 같음; 진입점이 다름:

| 도구 | `/agent-all` 동등 호출 방법 |
|---|---|
| **Claude Code** | `/agent-all "..."` 슬래시 명령 직접 |
| **Cursor** | Cursor 채팅 열기 → "@agent-all-coordinator run /agent-all for ..." (방금 설치한 `.cursor/agents/agent-all-coordinator.md` 사용) |
| **Copilot CLI** | `gh copilot suggest -t "follow .github/copilot-instructions.md to run agent-all for ..."` 또는 저장소 안에서 Copilot 채팅 열기 |
| **VS Code Copilot** | 프로젝트에서 Copilot Chat 열기, 확장이 `.github/copilot-instructions.md` 자동 로드 |
| **Codex CLI** | `codex` → `AGENTS.md` 및 `.codex/skills/` 로드; `run /agent-all for ...` 입력 |
| **Gemini CLI** | `gemini` → `GEMINI.md` 및 `.gemini/skills/` 로드; 워크플로 요청 입력 |

`/explore`는 오늘 Claude Code 전용. `/debug`는 Claude Code와 Codex CLI에서 출시됨; Cursor/Copilot/Gemini debug 포트는 포팅 로드맵에 유지.

---

## 다른 도구에서 업데이트

설치와 동일 — **`--force`로 스크립트 재실행**. 렌더러는 idempotent (hooks 중복 등록 안 함; `thrift-` / `floor-` 명령 경로 센티널 사용) 하지만 `.visual-qa.json` 같은 기존 config 파일 덮어쓰려면 `--force` 필요:

```bash
cd /tmp/agent-skill
git pull                                                          # 최신 버전 가져오기
./scripts/install-platform.sh --platform=cursor --target=/path/to/my-project --force
```

### 실제로 없는 명령들 (실행하지 마세요)

다음 명령들은 자연스러워 보이지만 **저 CLI들의 플러그인 시스템에 오늘 존재 안 함**:

```
❌ gh copilot plugins install harness-floor-copilot
❌ codex plugins install harness-floor-codex
❌ gemini extensions install harness-floor-gemini
```

이 플랫폼들은 아직 AI 워크플로용 플러그인 마켓플레이스가 없음. 대신 `./scripts/install-platform.sh` 사용.

### 플랫폼별 제거

```bash
# Claude/Codex project-local harness cleanup
./scripts/install-platform.sh --platform=claude --target=/path/to/project --uninstall
./scripts/install-platform.sh --platform=codex --target=/path/to/project --uninstall
./scripts/install-platform.sh --platform=codex --target=/path/to/project --uninstall --force-root-clean

# Claude/Codex bundle의 plugin-local cleanup 미리보기
node /path/to/harness-builder/bin/clean.mjs --target=/path/to/project --platform=claude --dry-run
node /path/to/harness-builder-codex/bin/clean.mjs --target=/path/to/project --platform=codex --dry-run

# 다른 플랫폼은 아직 plugin-specific cleanup 사용, 예:
node plugins/harness-thrift-cursor/bin/install.mjs /path/to/project --uninstall
```

Claude cleanup은 생성 sentinel 섹션과 생성 hook/agent/settings 등록을 걷어내며, sentinel 없는 루트 가이드는 `--force-root-clean`이 명시된 경우에만 제거합니다. Codex cleanup은 생성된 `.codex/skills`, `.codex/hooks`, floor/thrift config 파일, debug skill 디렉터리, task template, helper script를 제거합니다. Debug 증거인 `docs/debug/`와 `.debug-artifacts/`는 보존합니다. 기본값은 agent-skill sentinel이 없는 루트 `AGENTS.md`를 보존하고, `--force-root-clean`을 넘기면 생성된 것으로 보이는 루트 `AGENTS.md`까지 제거합니다. Cursor, Copilot, Gemini, VS Code Copilot은 당분간 plugin-specific cleanup 또는 수동 검토를 사용합니다.

---

## 자주 묻는 질문

**`/agent-init`이 내 CLAUDE.md를 덮어쓰나요?**
아니요. 기존 내용은 보존하고 `agent-skill:operational` sentinel 섹션만 추가하거나 교체합니다. 최소 스캐폴드는 `--lite`를 쓰고, 생성된 하니스 산출물을 의도적으로 다시 만들 때만 `--force`를 쓰세요.

**`/agent-all --loop`을 무인으로 두기 안전한가요?**
네 — 네 가지 레이어가 자리 비우기 안전하게 만듦:
1. **하드 캡**: `--max-iter` (50으로 클램프), `--max-cost` (기본 $500), 매 wave 후 평가.
2. **`breakCondition`**: shell 명령 (테스트 suite) 이 exit 0 해야 함; 아니면 루프 Phase 1 재진입.
3. **구현자 검증 (강제)**: 디스패치된 모든 implementer subagent는 완료 선언 전 `superpowers:verification-before-completion` invoke MUST; 실패 → `STATUS: blocked` (조용히 merge 안 됨).
4. **Phase 4 리뷰어 audit**: 모든 reviewer subagent는 구현자가 실제로 verify 했는지 확인 MUST; 건너뛴/실패한 verification → `critical`로 escalate, PR block.
조합: 깨진 코드 sneak through 못 함, 비용 폭발 못 함, 세션 무한 실행 못 함.

**`/thrift`가 컨텍스트 동작을 즉시 바꾸나요?**
네. `/thrift` 이후 매 턴마다 hooks 발사. PreToolUse 제안이 inline으로 표시. summariser가 `.thrift.json`의 설정 임계값에서 발사하고 `/compact` 실행을 요청.

**`/thrift`가 추가한 hooks만 uninstall하려면?**
```
node plugins/harness-thrift/bin/install.mjs /path/to/project --uninstall
```
`.claude/settings.local.json`에서 `thrift-*` hook 항목만 제거 — 다른 hooks는 그대로.

**플러그인 완전 제거?**
```
/plugin uninstall <name>@agent-skill
```
필요시 프로젝트별 아티팩트(`.thrift.json`, `.visual-qa.json` 등) 수동 정리.

**목록에 없는 CLI/IDE에서도 동작?**
lib (`plugins/*/skills/*/lib/*.mjs`)는 순수 Node — 도구에 vendor 가능. `phases/*.md`의 phase 문서는 언어 무관. 포팅 패턴은 `docs/superpowers/specs/2026-05-18-*-impl-spec.md` 참조.

**버그 신고는?**
[GitHub Issues](https://github.com/kim-song-jun/agent-skill/issues). 제목에 플러그인 이름 prefix (예: `[harness-thrift] cache prime fails on Windows`).

---

## Claude 생태계의 다른 플러그인과의 관계

agent-skill은 두 개의 기반 Claude Code 플러그인 위의 **상위 레이어 조합**입니다. 둘 없이도 사용 가능하지만, 함께 사용하면 훨씬 잘 동작하고 — 설치는 몇 초입니다.

```
        ┌──────────────────────────────────────────┐
        │  당신의 프로젝트                          │
        │  /agent-init, /agent-all, /thrift ...    │
        └──────────────────────────────────────────┘
                          ▲
                          │  조합
                          │
        ┌──────────────────────────────────────────┐
        │  agent-skill (이 저장소)                  │
        │  18 플러그인, 5 테마 (A/B/C/D/E)          │
        └──────────────────────────────────────────┘
                ▲                          ▲
                │ wrap                     │ 사용
                │                          │
   ┌────────────────────────┐  ┌────────────────────────────┐
   │  superpowers           │  │  context-mode              │
   │  기반 skills:           │  │  raw 도구 출력을 대화에서  │
   │  brainstorming,        │  │  격리:                     │
   │  writing-plans,        │  │  ctx_execute, ctx_search,  │
   │  dispatching-parallel, │  │  ctx_batch_execute,        │
   │  subagent-driven-dev,  │  │  ctx_fetch_and_index, ...  │
   │  systematic-debugging  │  │                            │
   └────────────────────────┘  └────────────────────────────┘
```

### `superpowers` — 기반 skills

harness 명령들이 모두 wrap하는 재사용 가능한 skill primitives 라이브러리:

| Skill | 하는 일 | 누가 사용 |
|---|---|---|
| `superpowers:brainstorming` | 작업 시작 전 의도 정렬을 위한 구조화된 Q&A | `/agent-init` (Phase 1), `/agent-all` (Phase 1) |
| `superpowers:writing-plans` | 브리프로부터 단계별 plan 작성 | `/agent-all` (Phase 2) |
| `superpowers:dispatching-parallel-agents` | N개 독립 서브에이전트 fan-out 패턴 | `/agent-init` (Phase 3 agents), `/visual-qa` (Phase 3 pages) |
| `superpowers:subagent-driven-development` | task별 implementer + reviewer 사이클 | `/agent-all` (Phase 3 wave dispatch) |
| `superpowers:systematic-debugging` | 체계적 reproduce → isolate → fix 워크플로 | `/debug`가 wrap |
| `superpowers:test-driven-development` | TDD 규율 (테스트 먼저) | `/agent-all` implementer agents에 권장 |
| `superpowers:verification-before-completion` | "주장 전 증거" — 완료 선언 전 테스트 실행 | 모든 harness 명령이 이걸로 마무리 |
| `superpowers:requesting-code-review` | 코드 리뷰 scoping + 수집 패턴 | `/agent-all` (Phase 4 gate) |

**왜 이렇게 레이어링했나?** harness 명령들은 **얇은 코디네이터** — 어느 skill을 언제 invoke할지 오케스트레이트하지만, "어떻게 잘 brainstorm하나"의 실제 prompt engineering은 `superpowers`에 있습니다. superpowers가 skill을 개선하면 모든 harness 명령이 자동으로 혜택을 받습니다.

**설치:** `/plugin install superpowers@claude-plugins-official` (Claude Code 공식 마켓플레이스).

### `context-mode` — raw 출력을 컨텍스트에서 격리

큰 도구 출력 (긴 `git log`, 파일 덤프, MCP 응답)을 가로채서 로컬 SQLite 기반 sandbox에 저장하는 플러그인. 인쇄된 *요약*만 대화 컨텍스트에 들어가고 — raw 콘텐츠는 search로 쿼리 가능한 상태로 sandbox에 머뭅니다.

| 도구 | 언제 쓰나 |
|---|---|
| `ctx_execute(language, code)` | shell/Python/JS 실행; 인쇄된 결과만 컨텍스트에 |
| `ctx_execute_file(path)` | 파일 전체를 로드하지 않고 분석 |
| `ctx_batch_execute(commands, queries)` | 여러 명령을 한 번에 실행; 자동 인덱싱 |
| `ctx_search(queries)` | 인덱싱된 sandbox에 FTS5 쿼리 |
| `ctx_fetch_and_index(url)` | 웹 콘텐츠를 컨텍스트에 덤프하지 않고 fetch + 인덱싱 |
| `ctx_stats` | 이 플러그인이 얼마나 컨텍스트를 절약했는지 확인 |

**harness에 왜 중요한가:** 긴 `/agent-all --loop` 실행이나 `/debug` 세션은 도구 출력을 빠르게 축적합니다. `context-mode` 없이는 raw `git log` / `npm test` 출력이 이후 모든 턴을 bloat. 있으면 그 출력은 sandbox로 가고 요약만 남습니다. **`/thrift`는 직접 통합:** 그 PreToolUse 훅이 큰 출력 명령 (`find`, `git log` 등)을 감지하고 자동으로 `ctx_execute`로 라우팅 제안.

**설치:** `/plugin install context-mode@context-mode` (별도 마켓플레이스).

### harness가 둘을 어떻게 사용

`/agent-all "OAuth 추가"` 실행 시:

1. **Phase 1 (Intent)** → `superpowers:brainstorming` invoke하여 프로젝트에서 "OAuth"가 무엇을 의미하는지 명확화
2. **Phase 2 (Plan)** → `superpowers:writing-plans` invoke하여 단계별 구현 plan 작성
3. **Phase 3 (Dispatch)** → `superpowers:subagent-driven-development` invoke하여 task당 implementer 하나씩 fan-out. implementer는 `superpowers:test-driven-development` 사용 권장. task가 `git log` 등 큰 명령 실행 시, PreToolUse 훅 (`/thrift` 활성 시 설치)이 `context-mode`의 `ctx_execute`로 라우팅하여 컨텍스트 클린 유지.
4. **Phase 4 (Gate)** → `superpowers:requesting-code-review` invoke하여 spec + quality 리뷰
5. **Phase 5 (PR)** → `gh pr create` 직접 사용 (superpowers wrapper 없음)
6. **전반에 걸쳐** → `superpowers:verification-before-completion`이 어떤 phase가 성공 선언 전 `npm test` (또는 스택의 테스트 명령) 실행

harness는 state 파일 (`.agent-all-state.json`), 실패 시 resume, 비용 cap, 크로스 플랫폼 포팅 레이어로 둘을 묶습니다. 각 레이어가 한 가지를 잘 합니다.

### 이 의존성 없이 사용하기

`superpowers` 또는 `context-mode`가 설치 안 됐다면 harness 명령은 **graceful degrade**:

- `superpowers` 없음 → superpowers skill을 invoke할 harness phase는 "skill not available; please install superpowers@claude-plugins-official to enable this phase" 메시지를 emit하고 계속 또는 skip.
- `context-mode` 없음 → `/thrift`의 강제 hooks와 `mcp__plugin_context-mode_*` 도구가 사용 불가; 다른 모든 것은 동작. PreToolUse 훅은 no-op이 됨.

둘 다 몇 초 만에 설치 가능하고 경험을 극적으로 향상 — 강력 권장.

### 인접 도구 — Ralph Loop와 `/goal`

둘 다 harness가 **자동 invoke하지 않습니다**. 하지만 직접 조합 가능. 레시피는 위 [Self-sustaining 워크플로](#self-sustaining-워크플로) 참조.

- **`/goal` (Claude Code 내장)** — 세션 범위 Stop 훅. goal 설정 시 조건 만족까지 iteration 전반에 세션 살아있음. `/agent-all --loop`과 자연스럽게 페어링 (무인 야간 실행).
- **`ralph-loop` (별도 플러그인)** — 범용 간격 스케줄러. `/agent-all --loop`이 Ralph 패턴을 phase state + 비용 cap + break-condition을 추가하여 stateful로 재구현 — 둘 다 필요한 경우 드뭄. Wall-clock 주기성 필요 시 (예: "5분마다 deploy 재확인") 또는 loop-aware하지 않은 명령 chain에 `ralph-loop` 사용.

---

## 더 깊이 들어가기

기술적 상세, 디자인 spec, 새 플랫폼 포팅이 필요한 경우:

- **아키텍처 & 레이아웃** — 플러그인별 design 문서는 [docs/superpowers/specs/](docs/superpowers/specs/) 참조.
- **18개 플러그인 전체 목록** — [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) 참조.
- **변경 히스토리** — [CHANGELOG.md](CHANGELOG.md) 참조. 1752 tests, 모두 통과.
- **플랫폼별 포팅** — `docs/superpowers/specs/`의 `-impl-spec.md` 또는 `-decomposition.md`로 끝나는 spec 참조.
- **크로스 플랫폼 지원 매트릭스** — [docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md](docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md) 참조.
- **Hook precedence (hooks 등록하는 플러그인 여러개 섞을 때)** — [docs/superpowers/specs/2026-05-18-hook-precedence-integration.md](docs/superpowers/specs/2026-05-18-hook-precedence-integration.md) 참조.

---

## 상태

| 레이어 | 상태 | 비고 |
|---|---|---|
| Unit/integration 테스트 | ✅ **1752/1752 통과** | Mock toolCaller + 격리된 lib 테스트; release-doc, policy, Codex hook-schema, task-ledger, Codex exec, release-audit, release-fixture-smoke, command-surface, doctor, cleanup, visual-qa 회귀 포함 |
| Project install 렌더러 (Claude + 5개 플랫폼) | ✅ end-to-end 검증 | `install-all.sh` + `install-platform.sh` |
| 마켓플레이스 등록 | ✅ 18 플러그인 등록 | local + origin 동기화 |
| Claude/Codex skills | ✅ 오늘 출시 | Claude core `harness-builder` / `harness-floor` / `harness-thrift` / `harness-explore` / `harness-debug`; Codex는 `harness-debug-codex` 추가 |
| Claude/Codex CLI 런타임 | ✅ live smoke probe 가능 | `./scripts/release-smoke.sh --fast --with-live-cli`이 설치된 `claude`/`codex` 버전과 Codex `exec [PROMPT]` 지원을 probe함; release fixture smoke도 설치된 Codex `agent-all-codex` 및 `visual-qa-codex` sequential helper를 import하고 Codex debug-only fixture를 검증 |
| 기타 CLI 런타임 | ⚠️ 수동 검증 유지 | Cursor/Copilot/Gemini 런타임 체크는 `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md` 체크리스트에 유지 |
| `/thrift` v2 programmatic compact | ⏳ 연기 | Claude Code의 programmatic compact API 대기 |
| Anthropic/OpenAI/Vertex SDK 연결 | ⏳ 연기 | 현재 mock toolCaller; 프로덕션 연결은 peer dep 필요 |

버전: `harness-floor` `v0.5.1` (visual-qa 런타임 wiring + agent-init i18n patch), 나머지 Claude Code 코어 플러그인 `v0.2.0`, 플랫폼별 포트 `v0.1.0`.

### 언어

Decision-surfacing prompt와 패널이 다국어 지원. `.agent-all.json` `language`를 `"auto"` (기본 — `$LANG` 읽음), `"en"`, 또는 `"ko"`로 설정. 기계 파싱 토큰 (`STATUS: DONE`, `verification_passed`, `VERIFICATION_AUDIT:` 등)은 영문 고정. 언어 추가하려면 `lib/decisions/renderer.mjs`의 `LABELS`에 항목 + 동봉 `addendum.<lang>.md` 추가.

---

## 알려진 한계

- **Cursor / Copilot CLI / Gemini / VS Code Copilot의 decision-surfacing은 기본적으로 프롬프트/soft 수준입니다.** Cursor, Gemini, VS Code Copilot은 이 워크플로용 Task-style tool-call hook을 노출하지 않습니다. Copilot CLI는 선택적 hook helper를 제공하지만 `install-platform.sh`가 `~/.copilot/hooks.json`을 패치하지 않으므로 수동 hook 검토 후에만 사용하세요. Claude Code는 Task-level hard enforcement가 가능하고, Codex CLI는 현재 command hook으로 shell/policy 이벤트를 다루되 floor subagent 워크플로는 프롬프트/순차 방식입니다.

- **Non-TTY auto-pick은 틀릴 수 있음.** 야간 루프는 모든 결정을 subagent의 `recommended_index`로 자동 해결. 잘못된 선택은 다음날에야 드러남. 모든 auto-pick은 `docs/agent-all/iter-<N>/decisions.md`에 reasoning과 함께 기록되어 다음 iteration plan에서 재검토 대상.

- **Policy hook의 description 기반 라우팅.** `floor-policy` hook은 `Task` tool의 `description` (`"Implement Task ..."` / `"Review Task ..."`)으로 implementer/reviewer subagent를 식별. 사용자가 비슷한 단어로 직접 dispatch한 subagent도 protocol 발동. 프로젝트별 opt-out: `.agent-all.json`의 `policy: {decisionSurfacing: false}`.

- **`/explore`는 거의 발동 안함.** 읽기 전용이라 아키텍처 결정이 드뭅니다. 일관성을 위해 hook은 설치되지만 실질적으로 no-op.

- **Per-task scoping pass가 ~15-20% subagent 비용 추가.** Implementer가 두 번 (scoping + impl) dispatch. `--max-cost`가 여전히 cap.

## 로드맵

- Cursor/Copilot/Gemini live runtime 검증 (런타임 체크리스트 따르기)
- `/thrift` v2 summariser, Claude Code의 programmatic compact API 사용
- 실제 Anthropic/OpenAI/Vertex SDK 연결 (mock toolCaller 대체)
- `/explore` 플랫폼별 포트 및 Cursor/Copilot/Gemini용 `/debug` 포트
- Cursor `is_background: true` awaiter용 subagent transcript-listener bridge
- thrift audit telemetry opt-in (어느 강제가 실제 발사됐는지, 실제 비용 절감)

## 라이선스 & 기여

MIT 라이선스. PR 환영 — 1파일 fix 이상은 design discussion을 위해 issue 먼저.

제출 전:
```bash
./scripts/release-smoke.sh --fast        # Claude/Codex release smoke gate
./scripts/release-smoke.sh --fast --with-live-cli  # 설치된 Claude/Codex CLI도 probe
node scripts/release-audit.mjs           # Claude/Codex 릴리즈 준비 상태 매트릭스
node scripts/release-fixture-smoke.mjs   # fresh Claude/Codex 릴리즈 fixture
node --test                              # 1752/1752 통과 필수
node scripts/sync-lib.mjs --check        # vendored shared libs 동기화 확인
```

저장소 컨벤션:
- 모든 플러그인 libs (`plugins/*/skills/*/lib/*.mjs`)는 순수 Node — 호스트 의존성 없음; cross-plugin import 금지 (`tests/lib/cross-platform-isolation.test.mjs`로 enforce)
- Vendored `render.mjs` 사본은 `plugins/harness-builder/skills/agent-init/lib/render.mjs` (canonical 소스)와 byte-identical 유지; `node scripts/sync-lib.mjs`로 동기화
- 신규 플러그인은 `.claude-plugin/marketplace.json` 등록 + `tests/lib/cross-platform-{manifest,isolation}.test.mjs` 갱신 필수
- 신규 hook 등록은 `docs/superpowers/specs/2026-05-18-hook-precedence-integration.md`의 sentinel 기반 프로토콜 따라야 함
