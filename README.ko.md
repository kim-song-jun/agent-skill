> 🇺🇸 English: [README.md](README.md)

# agent-skill

**스스로 굴러가는 agent-first 워크플로.** 프로젝트당 `/agent-init` 한 번, 기능당 `/agent-all "..."` 한 번 — agent가 brainstorm → 계획 → 구현 → 테스트 → PR을 알아서 진행하고, **테스트가 통과할 때까지 알아서 반복**합니다. 매 턴 babysitting 필요 없음.

오늘 Claude Code에서 동작, 그리고 **Cursor, GitHub Copilot CLI, Codex CLI, Gemini CLI** 크로스 플랫폼 포트 포함. 17개 플러그인, 5개 슬래시 명령, 하나의 마켓플레이스.

```
/agent-init                              # 모든 git 저장소 부트스트랩 (Phase A — 프로젝트당 한 번)
/agent-all "Google OAuth 추가" --loop    # brainstorm → 계획 → 코드 → 테스트 → PR (Phase C — 기능당)
/visual-qa                               # 모든 페이지 스크린샷, LLM 디자인 리뷰
/thrift                                  # 긴 세션 저렴하게 (자동 요약, audit)
/explore                                 # 코드베이스 맵; /explore where Foo → O(1) lookup
/debug "테스트가 30% 실행에서 flaky"     # 재현 → bisect → 가설 → 검증
```

**핵심 3가지:**

1. **Project-first 스캐폴딩.** `/agent-init`은 어떤 git 저장소에서든 동작 — Next.js, FastAPI, Rust CLI, 모노레포. 스택 감지, 올바른 테스트 명령 선택, `CLAUDE.md` + agents + hooks + config를 한 번의 commit에 생성. 같은 명령, 모든 프로젝트.

2. **메인 스레드를 보존하는 agent-first 실행.** `/agent-all "..."`은 채팅이 아닙니다. brainstorm → 계획 → 구현 → 리뷰 → PR을 **하나의 파이프라인**으로 실행하고, 구현/리뷰 같은 무거운 작업은 **격리된 subagent**에서 일어남 — 그들의 turn-by-turn 출력은 메인 대화에 들어오지 않음. 메인 세션은 작게 유지 (계획 + 판단) → 같은 Claude Code 세션이 context bloat 없이 몇 시간 지속 가능.

3. **무인 실행을 위한 조합성.** 세 조각 — `/agent-all --loop` (작업 드라이브), `/thrift` (메인에 누적되는 것 압축), `/goal` (iteration 간 세션 살림) — 이 합쳐져 CI green 또는 비용 cap 도달 시 깔끔히 종료되는 야간 실행. [Self-sustaining 워크플로](#self-sustaining-워크플로) 참조.

그게 전부입니다. README의 나머지는 참고용 — 필요한 부분만 훑어보세요.

---

## 60초 설치

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
```

프로젝트에서:

```
cd my-project
/agent-init
```

완료. `/agent-all "작은 기능"`으로 실제로 동작하는지 확인해보세요.

---

## 플러그인 최신 상태 유지

```
/plugin update --marketplace agent-skill
```

이 한 명령으로 마켓플레이스에서 **이미 설치된** 모든 것이 업데이트됩니다. 다른 CLI는 [다른 도구에서 업데이트](#다른-도구에서-업데이트) 참조.

### 신규 추가된 플러그인 설치

중요: `/plugin update`는 **이미 설치한 플러그인만** 업데이트. 마켓플레이스는 시간이 지나며 늘어남 (2026-05-18 하루에 6개 신규 추가 — `harness-thrift`, `harness-explore`, `harness-debug` + 3개 thrift CLI 포트). 이들 가져오려면:

```
/plugin marketplace update agent-skill        # 목록 새로고침
/plugin install harness-thrift@agent-skill    # 원하는 신규 플러그인 각각 설치
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/reload-plugins                               # 적용
```

**빠른 확인** — 현재 이 마켓플레이스에서 무엇이 설치돼 있는지:

```bash
cat ~/.claude/plugins/installed_plugins.json | python3 -m json.tool | grep -B1 agent-skill
```

카운트가 4 미만이면 (Claude Code 권장 최소: builder + floor + thrift + explore + debug = 5) 최근 추가분이 빠져 있는 것.

---

## 각 명령이 하는 일

### `/agent-init` — 프로젝트 설정

프로젝트당 한 번만 실행. `CLAUDE.md`, 에이전트 로스터(`.claude/agents/*.md`), 3개의 hooks, visual-qa + agent-all용 설정 파일 생성.

```
/agent-init                 # 기본값: full Floor 하니스
/agent-init --theme=lite    # 최소: CLAUDE.md + agents만
/agent-init --size=large    # 모노레포용 9-agent 로스터
/agent-init --merge         # 기존 CLAUDE.md에 추가 (덮어쓰지 않음)
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

```
npm run dev                     # 다른 터미널에서
/visual-qa                      # 캡처 + 분석
/visual-qa --slug="launch"      # 커스텀 출력 폴더
/visual-qa --budget=20          # LLM 비용 $20로 제한
```

결과: `docs/visual-qa/<date-or-slug>/report.md`.

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

**새 프로젝트 시작, 기능 출시:**
```
mkdir my-app && cd my-app && git init && git commit --allow-empty -m "init"
/agent-init
/agent-all "Markdown을 PDF로 변환하는 CLI 빌드"
```

**낯선 코드베이스 온보딩:**
```
git clone <repo> && cd <repo>
/agent-init --theme=lite
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

세 가지 독립 메커니즘이 조합. 일을 어떻게 나누는지 이해하면 나머지는 설정일 뿐.

### 왜 동작하는가 — 메인 스레드 격리

`/agent-all`의 진짜 trick은 loop이 아니라 **어디서 작업이 일어나는가**입니다.

| Phase | 어디서 실행 | 메인 context로 들어오는 것 |
|---|---|---|
| 0 Preflight | main | git 체크 (~매우 적음) |
| 1 Intent (brainstorm) | main | 사용자와 Q&A (적당히 누적) |
| 2 Plan | main | plan 파일 (적당히) |
| **3 Dispatch** | **fresh subagents** | `{status, commits, costUSD}` 요약만 — implementer의 시행착오는 격리 |
| **4 Gate** | **fresh subagents** | spec/quality verdict만 — reviewer의 읽기는 격리 |
| 5 PR | main | `gh pr create` 결과 (작음) |
| 6 Loop | main | breakCondition exit code (숫자 하나) |

무거운 작업 — 코드 읽기, 패치 작성, 테스트 실행, 실패 수정 — 은 `superpowers:subagent-driven-development`로 dispatch된 **subagent 내부에서** 일어남. 각 subagent는 fresh 대화. 그들의 turn-by-turn 출력은 메인 세션에 들어오지 않음. 메인 세션은 verdict만 봄.

이것이 `/agent-all`이 flat chat 세션이라면 context로 빠져 죽었을 시간을 몇 시간 버틸 수 있는 **이유**. 매 loop iteration은 메인에 2~5K 토큰만 추가 (plan + wave 요약 + gate verdicts) — 50K가 아님.

하지만 그 "적당한 누적"도 결국 따라잡힘. 거기서 `/thrift`가 등장.

### 세 조각이 일을 어떻게 나누는가

| 조각 | 해결 | 아는 것 |
|---|---|---|
| **`/agent-all --loop`** | 실제 워크플로를 비용 한도 내 검증된 완료까지 드라이브 | Phases, plan, 디스패치된 agents, 시도한 것, 누적 비용, 실패 지점 |
| **`/thrift`** | 메인에 *실제로 누적되는* 것 (plans, wave 요약, gate verdicts) 을 세션 bloat 전에 압축 | 토큰 카운트 임계값, 캐시 priming, 세션 종료 audit |
| **`/goal`** | iteration 간 Claude Code가 세션을 끝내지 못하게 막기 | 작업에 대해 모름. 단순 Stop-event blocker. |

짧은 loop (1–3 iteration)엔 `/agent-all --loop` 단독 OK. 야간 또는 multi-hour 실행엔 셋 다 필요:

- `/agent-all --loop`이 **iteration별 작업 격리** 처리 (subagent fan-out)
- `/thrift`가 **iteration 간 메인 스레드 압축** 처리 (임계값에서 자동 요약)
- `/goal`이 **세션 생존성** 처리 (iteration 사이에 종료하지 말 것)

### `/agent-all --loop` 설정 knob

| Knob | 소유 | 기본값 | 효과 |
|---|---|---|---|
| `--loop` | flag | off | Phase 5 후 breakCondition 재진입 활성화 |
| `--max-iter=N` | flag | 1 | iteration 하드캡 (서버 50으로 클램프) |
| `--max-cost=USD` | flag | 500 | 누적 API 비용 하드캡; 매 wave 후 체크 |
| `breakCondition` | `.agent-all.json` | `npm test` (또는 자동 감지) | Shell 명령; exit 0 = "완료" |
| `stableIters` | `.agent-all.json` | 1 | loop이 깔끔히 종료되기 전 필요한 연속 통과 breakCondition 수 |

### 레시피 — 무인 야간 기능 출시

```
/thrift                                                 # 비용 가드레일 설정 (프로젝트당 한 번)
/goal "analytics 대시보드를 모든 CI 통과 상태로 출시"   # 세션이 스스로 살아있음
/agent-all "analytics 대시보드 빌드 (차트, 필터, export)" \
  --loop --max-iter=15 --max-cost=80
# 자리 비움
```

단계별로 무엇이 일어나는가:
1. **`/agent-all`이 iter 1 phase 0–5 실행**: main에서 사용자와 brainstorm → main에서 plan → **격리된 implementer subagent 디스패치** (Phase 3 — 그들 작업은 context를 bloat 안 함) → **격리된 reviewer subagent 디스패치** (Phase 4) → PR
2. **`breakCondition` 실행** (예: `npm test`). 통과 시 loop 깔끔히 종료. 실패 시 같은 task로 phase 1 재진입 + *이전 실패가 보임* → iter 2는 다른 접근 시도.
3. **`/thrift`의 hooks가 지속적으로 발사**: PreToolUse가 큰 도구 출력을 `ctx_execute`로 강제, PostToolUse가 토큰 카운트, 설정된 임계값에서 summariser가 이전 iter 결과 압축 제안. 메인 context 작게 유지.
4. **`/goal`이 매 `/agent-all` iteration 종료 시 Claude Code의 Stop 이벤트 차단**. 세션 살아있음. "모든 CI 통과" 조건 만족 시 자동 clear.
5. **Cap이 깔끔히 발사**: `--max-iter=15` 또는 `--max-cost=80` 도달 시 loop 정지, state가 `.agent-all-state.json`에 보존돼 나중에 `--resume` picking up.

깨어나면 merged PR 또는 "iteration 7에서 auth flow 테스트 여전히 실패로 정지" 정밀한 리포트 — 200K 토큰 미읽기 출력으로 stall된 세션이 아님.

### `/goal`이나 Ralph Loop와 어떻게 다른가

이들은 **다른 문제**를 해결합니다. harness는 "Ralph Loop + 기능 추가"가 아니라 — 루프하는 orchestrator입니다.

| 도구 | 해결하는 문제 | 아는 것 |
|---|---|---|
| **`/goal`** | "조건 만족까지 세션 중지하지 말 것." | 작업에 대해 아무것도 모름. Claude Code의 Stop 이벤트만 block. 순수 keep-alive. |
| **Ralph Loop** | "이 프롬프트를 N분마다 재실행." | 실행 사이에 아무것도 모름. 같은 프롬프트를 stateless로 재발사. |
| **`/agent-all --loop`** | "완전한 dev 워크플로 (brainstorm → 계획 → 코드 → 리뷰 → PR)를 비용 한도 내에서 검증된 종료 상태까지 드라이브." | **Phases, plan, 디스패치된 agents, 시도한 것, 누적 비용, 실패 지점.** |

harness는 각각의 **좋은 아이디어**를 흡수 — `/goal`의 "끝날 때까지 멈추지 말 것", Ralph의 "자동 재시도" — 하고, 둘 다 없는 구조적 조각을 추가:

- **Multi-phase 워크플로** — "아직 계획 중"과 "PR 후 테스트 실패"의 차이를 앎
- **Stateful 재시도** — 매 iteration이 phase 1에 재진입할 때 *이전 실패가 보임*, 그래서 다른 접근 시도 (같은 프롬프트를 맹목적으로 재발사하지 않음)
- **Wave-granularity 비용 cap** — `--max-cost`이 매 wave 후 확인, 실행 종료 시만이 아님, 그래서 비용 폭발 시 기능 중간에 bail 가능
- **Resume-from-failure** — `.agent-all-state.json`이 phase 진행 보존; `--resume`이 루프가 crash한 지점 이어감
- **Phase-aware break-condition** — `breakCondition`이 PR 생성 *후* 평가 (테스트가 실제로 통과해야 하는 시점), 구현 도중이 아님

`/goal`과 Ralph는 **대안**이 아니라 **보완재**:

```
/goal "analytics 대시보드 출시"             # keep-alive (그래서 /agent-all --loop이 몇 시간 돌 수 있음)
/agent-all "..." --loop --max-iter=15       # 실제 작업 수행
```

Ralph가 `/agent-all` *one-shot* (`--loop` 없이) wrap하는 건 wall-clock 주기성에만 의미 있음 (`/ralph-loop 5m /agent-all "deploy 확인"`) — 재시도 의미는 harness가 이미 native하고 더 잘 처리.

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
/agent-init --theme=lite                   # Cargo.toml 감지 → "cargo test"
/agent-all "git 스타일 서브커맨드 추가" --loop --max-cost=25
```

---

## 다른 AI 도구에서 사용

위 모든 명령은 Cursor, GitHub Copilot CLI, Codex CLI, Gemini CLI에서도 동작 — 해당 `*-<platform>` 플러그인만 설치하면 됨.

| 도구 | 설치 명령 |
|---|---|
| **Claude Code** | `/plugin install harness-floor@agent-skill` |
| **Cursor** | `node plugins/harness-floor-cursor/bin/init.mjs /path/to/project` |
| **Copilot CLI** | `gh copilot plugins install harness-floor-copilot` |
| **Codex CLI** | `codex plugins install harness-floor-codex` |
| **Gemini CLI** | `gemini extensions install harness-floor-gemini` |

`harness-builder-*`, `harness-thrift-*` (예: `harness-thrift-codex`) 도 동일. 총 17개 플러그인이 Claude Code native + 다른 4개 CLI 포트 커버.

`/explore`와 `/debug`는 오늘 Claude Code에서만 — 플랫폼별 포트 계획 중.

---

## 다른 도구에서 업데이트

```bash
# Codex CLI
codex plugins update                    # 전체
codex plugins update harness-floor-codex

# GitHub Copilot CLI
gh copilot plugins update

# Gemini CLI (a.k.a. antigravity)
gemini extensions update

# Cursor — install 스크립트를 --force로 재실행
node plugins/harness-floor-cursor/bin/init.mjs /path/to/project --force
```

Cursor 설치는 renderer 스타일: 재실행해도 hooks 중복 등록 안 됨 (sentinel 기반 idempotency). Claude Code 또는 다른 플랫폼의 클린 uninstall은 [자주 묻는 질문](#자주-묻는-질문) 참조.

---

## 자주 묻는 질문

**`/agent-init`이 내 CLAUDE.md를 덮어쓰나요?**
아니요. CLAUDE.md 존재 시 abort. `--merge`로 추가, `--force`로 덮어쓰기.

**`/agent-all --loop`이 안전한가요?**
네. `--max-iter` (캡 50), `--max-cost` (기본 $500), 명확한 테스트 명령으로 하드-bounded. 빠듯한 값 설정하면 무한 실행 불가.

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
        │  17 플러그인, 5 테마 (A/B/C/D/E)          │
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
- **17개 플러그인 전체 목록** — [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) 참조.
- **변경 히스토리** — [CHANGELOG.md](CHANGELOG.md) 참조. 981+ tests, 모두 통과.
- **플랫폼별 포팅** — `docs/superpowers/specs/`의 `-impl-spec.md` 또는 `-decomposition.md`로 끝나는 spec 참조.
- **크로스 플랫폼 지원 매트릭스** — [docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md](docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md) 참조.
- **Hook precedence (hooks 등록하는 플러그인 여러개 섞을 때)** — [docs/superpowers/specs/2026-05-18-hook-precedence-integration.md](docs/superpowers/specs/2026-05-18-hook-precedence-integration.md) 참조.

버전: Claude Code 코어 플러그인은 `v0.2.0`, 플랫폼별 포트는 `v0.1.0`.
