> 🇺🇸 English: [CHANGELOG.md](CHANGELOG.md)

# 변경 로그

모든 주요 변경 사항. 각 릴리스 후보에 대한 날짜 스탬프 태그가 존재합니다.

## [미출시]
- `harness-thrift` v2 summariser — Claude Code programmatic compact API
  출시 시 도입 (현재 v1 advisory).
- 라이브 CC + 플랫폼별 CLI 검증
  (`2026-05-18-cli-runtime-verification-checklist.md` +
  `2026-05-18-hook-precedence-integration.md`).
- Anthropic SDK / OpenAI SDK / Vertex SDK 실제 API 연결 (현재 mock
  toolCaller 사용).

## README — 진짜 가치 제안으로서 메인 스레드 격리 — 2026-05-18

### 변경

이전 버전이 `/agent-all`을 "하나의 파이프라인으로 실행"으로 설명하면서
long-running loop을 가능하게 하는 실제 메커니즘을 설명 안 했음. 양쪽
README에 진짜 스토리 surface:

**상단 pillar #2 재작성** — "Agent-first 실행" → **"메인 스레드를
보존하는 agent-first 실행"** — 왜 이것이 scale하는지 명시:
- Phase 3 (Dispatch)와 Phase 4 (Gate)가
  `superpowers:subagent-driven-development` 통해 **격리된 subagents
  에서** 실행
- Subagents의 turn-by-turn 출력 (code 읽기, 패치 시도, 실패한 테스트
  실행)이 메인 대화에 들어오지 않음
- 메인 세션은 verdict만 봄 (`{status, commits, costUSD}`)
- 그것이 같은 Claude Code 세션이 몇 시간 계속 갈 수 있는 이유

**Pillar #3 재정의** — "Self-sustaining 루프" → **"무인 실행을 위한
조합성"** — 세 조각과 그들의 분업 명시 (loop이 작업 드라이브, thrift가
누적되는 것 압축, goal이 세션 살림).

**"Self-sustaining 워크플로" 섹션 재구성**:
- 신규 "왜 동작하는가 — 메인 스레드 격리" 서브섹션 상단, phase별
  테이블로 메인 context에 정확히 무엇이 들어오고 무엇이 격리된
  subagent에 머무는지 보여줌
- 신규 "세 조각이 일을 어떻게 나누는가" 테이블로 loop/thrift/goal
  협업 명시 ("agent-all이 iteration별 격리; thrift가 iteration 간
  압축; goal이 세션 살림")
- Recipe walkthrough가 어느 phase가 어디서 실행되는지 명시 ("main에서
  사용자와 brainstorm → main에서 plan → 격리된 implementer subagent
  디스패치")

이는 이전 작성이 "왜 이게 scale하는가"를 사용자가 추론하게 둔 피드백
해결 — 이제 상단의 번호 매겨진 설명 + 후반의 phase별 메커니즘 테이블.

영문 + 한글 모두 갱신.

## README — `/goal` + Ralph Loop 차별화 sharpen — 2026-05-18

### 변경

이전 "루프 의미 — harness vs Ralph Loop" 서브섹션이 harness를
"Ralph + 기능 추가"처럼 만들었음. "`/goal`이나 Ralph Loop와 어떻게
다른가"로 교체 — harness를 **다른 카테고리**로 프레임 (오케스트레이션
하는 루프가 아닌 루프하는 orchestrator), 명시적으로:

- **비교 테이블**이 각 도구가 실제로 무엇을 *해결*하고 무엇을 *아는지*
  보여줌:
  - `/goal`: "X까지 멈추지 말 것" 해결; 작업에 대해 모름
  - Ralph Loop: "간격마다 재실행" 해결; stateless
  - `/agent-all --loop`: "완전한 dev 워크플로를 비용 한도 내 검증된
    종료 상태까지 드라이브" 해결; phases, plan, agents, 시도한 것,
    비용, 실패 지점 모두 앎
- **명시적 프레이밍**: harness는 각각에서 "좋은 아이디어"를 흡수
  (`/goal`의 keep-alive, Ralph의 auto-retry) + 둘 다 없는 구조적
  조각 추가 — multi-phase 인식, stateful 재시도 (다음 iteration이
  이전 실패를 봄), wave-granularity 비용 cap, resume-from-failure,
  phase-aware break-condition
- **`/goal`과 Ralph를 대안이 아닌 보완재로 재정의** — `/goal`이
  세션을 살려서 `--loop`이 몇 시간 돌게; Ralph가 one-shot wrap하는
  건 wall-clock 주기성에만 의미 있음

이는 이전 작성이 harness를 "같은 카테고리의 또 다른 옵션"으로 보이게
한 피드백 해결 — 실제로는 둘의 좋은 부분을 흡수한 다른 카테고리.

## README — agent-first 가치 제안 + self-sustaining 워크플로 — 2026-05-18

### 추가 & 변경

- **README 상단 가치 제안 재작성** — 실제 강점을 앞으로:
  "스스로 굴러가는 agent-first 워크플로." 번호 매겨진 세 pillar 명시:
  1. **Project-first 스캐폴딩** — `/agent-init`이 어떤 git 저장소
     에서든 동작, 스택 감지, 올바른 테스트 명령 선택.
  2. **Agent-first 실행** — `/agent-all`이 brainstorm → 계획 →
     구현 → 리뷰 → PR을 하나의 파이프라인으로 실행 (사용자는 plan만
     승인; 그 외 스스로 진행).
  3. **Self-sustaining 루프** — `--loop` + `--max-iter` + `--max-cost`
     + `breakCondition` + Claude Code의 `/goal`로 무인 야간 실행 가능.

- **신규 "Self-sustaining 워크플로" 섹션** ("테마 고르기" 다음,
  "스택별 예제" 전에 배치). 다루는 내용:
  - 구성요소 테이블: `--loop`, `--max-iter`, `--max-cost`,
    `breakCondition`, `/goal`, `/thrift`
  - 구체적 "무인 야간 기능 출시" 레시피 — `/thrift` + `/goal` +
    `/agent-all --loop` 조합
  - 내부 동작 단계별 설명
  - harness `--loop` vs Ralph Loop 비교 + 언제 어느 것을 쓰는지 기준

- **"인접 도구" 서브섹션 축약** — "Self-sustaining 워크플로"로 되돌리는
  cross-ref만 남김 (중복 제거).

피드백 세 가지 처리: (1) 가치 제안이 차별점을 못 팔고 있었음,
(2) `/goal`과 Ralph Loop 통합이 안 보였음, (3) "프로젝트마다 자동
하니싱" 강점이 번호 매겨진 pillar로 부각 안 됐었음.

## README — 생태계 컨텍스트 섹션 — 2026-05-18

### 추가

양쪽 README에 새 섹션: **"Claude 생태계의 다른 플러그인과의 관계"**.
agent-skill (이 저장소), `superpowers`, `context-mode` 간 레이어링
설명:

- agent-skill이 superpowers (skill들 wrap) + context-mode (도구 사용)
  위에 조합됨을 보여주는 ASCII 다이어그램.
- harness가 invoke하는 모든 `superpowers:*` skill + 어느 명령이 사용
  하는지 테이블 (brainstorming, writing-plans, dispatching-parallel-
  agents, subagent-driven-development, systematic-debugging, TDD,
  verification-before-completion, requesting-code-review).
- 모든 `context-mode` 도구 (`ctx_execute`, `ctx_execute_file`,
  `ctx_batch_execute`, `ctx_search`, `ctx_fetch_and_index`,
  `ctx_stats`) + 사용 사례 테이블.
- `/agent-all "OAuth 추가"`의 단계별 walkthrough — 각 phase에서 정확히
  어느 superpowers skill과 어느 context-mode 도구가 발사되는지.
- Graceful-degradation 노트: 둘 중 하나가 설치 안 돼도 harness 명령
  동작 (phase skip 또는 no-op 훅); 둘 다 권장.
- 설치 명령: `superpowers@claude-plugins-official`,
  `context-mode@context-mode`.

이는 사용자가 agent-skill 설치는 했지만 `superpowers:brainstorming`이
무엇인지, 왜 harness가 계속 그것을 참조하는지 모르는 갭을 해결.

## README — 사용자 친화적 재작성 — 2026-05-18

### 변경

양쪽 README를 더 친근한 톤으로 재작성:
- **상단 가치 제안**을 평이한 언어로: "하나의 마켓플레이스, 다섯 개의
  슬래시 명령, 모든 AI 코딩 도구." Jargon 없음.
- **60초 설치** + 단일 명령 업데이트 경로 상단 배치.
- **명령별 섹션** (`/agent-init` / `/agent-all` / `/visual-qa` /
  `/thrift` / `/explore` / `/debug`) 각각 명령이 하는 일을 2-3 문장 +
  가장 유용한 플래그로 표시. Phase 테이블 없음, 사용자 경로에 내부 lib
  참조 없음.
- **자주 쓰는 워크플로** 섹션에 구체적 복붙 레시피 (신규 프로젝트,
  온보딩, flaky 테스트, 런칭전, 긴 디버깅).
- **"더 깊이 들어가기"** 섹션은 맨 아래 — 기술 상세를 원하는 사용자만
  위한 아키텍처 / spec / changelog 링크. 그렇지 않은 90% 사용자의
  시야에서 비켜놓음.

사용자 경로에서 제거 (필요한 사용자를 위해 docs/에 유지):
- 모든 명령의 phase별 walkthrough
- 아키텍처 트리 + 플러그인별 레이아웃
- Composition 패턴 / Codex rescue / 크로스 플랫폼 deep dive

길이: README.md ~290 라인 (이전 ~530), README.ko.md 미러링.

## README + 플러그인 업데이트 문서화 — 2026-05-18

### 갱신

- `README.md` 와 `README.ko.md` 완전 재작성하여 현재 17-플러그인 /
  5-테마 상태 반영 (이전엔 2-플러그인 / 3-테마 버전에 thrift는
  "RESERVED"로 멈춰 있었음).
- 모든 호스트를 다루는 전용 **"플러그인 업데이트 방법"** 섹션 추가:
  - Claude Code: `/plugin update <name>@agent-skill`,
    `/plugin update --marketplace agent-skill`, `/plugin update --all`,
    `/plugin marketplace update agent-skill`
  - Codex CLI: `codex plugins update [<name>]`
  - GitHub Copilot CLI: `gh copilot plugins update [<name>]`
  - Gemini CLI: `gemini extensions update [<name>]`
  - Cursor: `bin/install.mjs --force` 재실행 (렌더러 스타일;
    `thrift-` / `floor-` 센티널로 idempotent)
  - 클린 인스톨 경로: uninstall + marketplace 제거 + 재추가
  - 플러그인별 uninstall: `node plugins/<p>/bin/install.mjs --uninstall`
- 어느 테마가 어느 호스트에 어떤 수준으로 출시됐는지 보여주는 전용
  **"크로스 플랫폼 지원"** 매트릭스 추가 (✅ / 스캐폴드 / 포트 연기).
- A/B/C/D/E 포지셔닝 테이블이 있는 전용 **"5개 테마"** 섹션 추가.
- 명령어 레퍼런스 갱신 `/thrift`, `/explore`, `/debug` 포함.
- 온보딩 + flaky 테스트 디버깅 예제 추가.
- "버전 관리" 섹션을 iteration 타임라인 반영하도록 갱신
  (41 → 7 → 5 → 4 → 1 → 2 commits, 5개 sub-iteration).

## 6개 신규 플러그인 + 플랫폼별 구현 — 2026-05-18 (commit 0aa3cea)

10개 병렬 agents가 6개 신규 마켓플레이스 플러그인 + 4개 기존 플랫폼
플러그인의 agent-all + visual-qa 구현을 완료. 마켓플레이스는 이제 17개
플러그인 (이전 11개).

### 신규 플러그인 (6)

- `harness-thrift-cursor` (v0.1.0) — Cursor용 Theme B 포트. 단일
  `.cursor/rules/thrift.mdc` 규칙 + advisory-only audit; 프로그래매틱
  hooks 없음. 5 phase (cache prime 없음). 24 테스트.
- `harness-thrift-copilot` (v0.1.0) — Copilot CLI용 Theme B 포트.
  `.github/hooks/*.json` 패처, `store_memory` 브릿지 (파일 fallback),
  OpenAI 레이트 테이블. 6 phase. 32 테스트.
- `harness-thrift-codex` (v0.1.0) — Codex CLI용 Theme B 포트.
  TOML-aware `~/.codex/config.toml` 패처 (센티널 코멘트 bracketing),
  0.5× cache 배율 OpenAI 레이트 테이블. 6 phase. 24 테스트.
- `harness-thrift-gemini` (v0.1.0) — Gemini CLI용 Theme B 포트 (가장
  무거운 포트). `~/.gemini/settings.json` user-scope 패처, 별도의
  cacheRead/cacheWrite/storage-hour 항을 가진 Vertex AI 레이트 테이블,
  min-token gate, free-tier 단락 ROI 평가. 5 phase. 30 테스트.
- `harness-explore` (v0.1.0) — Theme D (신규). 5-phase 파이프라인
  코드베이스 탐색: preflight → fan-out → aggregate → deps → render.
  병렬 디스패치 tree walker, 의존성 그래프 추출 (TS/Python/Rust/Go
  regex), `git rev-parse HEAD` 캐시, `/explore where` + `/explore deps`
  쿼리. 46 테스트.
- `harness-debug` (v0.1.0) — Theme E (신규). 6-phase 디버깅 워크플로:
  preflight → reproduce → isolate → hypothesize → verify → summarise.
  `superpowers:systematic-debugging` WRAP. 10-포맷 에러 파서, ddmin +
  git-bisect lib, 가설 트래커, repro suggester. 66 테스트.

### 플랫폼별 구현 (기존 4개 플러그인 확장)

- agent-all-cursor + visual-qa-cursor (55 신규 테스트).
- agent-all-copilot + visual-qa-copilot (126 신규 테스트).
- agent-all-codex + visual-qa-codex (99 신규 테스트).
- agent-all-gemini + visual-qa-gemini (39 신규 테스트).

### 인프라

- `marketplace.json`: 17 플러그인 (6개 추가).
- `tests/lib/cross-platform-{manifest,isolation}.test.mjs`: 확장.
- `scripts/sync-lib.mjs`: `VENDORED_RENDER_ONLY`가 이제 11개 플러그인
  `bin/lib/` 디렉토리 커버 (19 vendored `render.mjs` 파일 추적).

### 결과

981/981 tests pass (이전 427, +554). 작업 폴더 깨끗함.

### 여전히 보류 중

- 라이브 CC + 플랫폼별 CLI 검증 (sandbox 불가).
- Anthropic/OpenAI/Vertex SDK 실제 API 연결.
- CLI가 토큰 노출 안 할 때 토큰 카운팅 정확도 개선.

## sub-project spec + host invoker + thrift 설치 — 2026-05-18

### 설계 spec (12개 신규 — 모두 design-only)

- `2026-05-18-agent-all-{codex,copilot,cursor,gemini}-impl-spec.md` (4개)
  — agent-all 스캐폴드 포트의 플랫폼별 구현 계획. 각 spec은 작성할 lib
  모듈 + hook 스크립트 + tests를 열거하고, 플랫폼별 추정치(Cursor 3d,
  Copilot 1w, Codex 1w, Gemini 1.5w)에 맞춘 작업량 분해, 미해결 질문,
  acceptance 기준 포함.
- `2026-05-18-visual-qa-{codex,copilot,cursor,gemini}-impl-spec.md` (4개)
  — visual-qa 6-phase 오케스트레이터 포트에 대한 동일 형식.
- `2026-05-18-harness-thrift-per-platform-decomposition.md` — Theme B의
  4-플랫폼 분해 (Cursor ~5d, Copilot ~1.5w, Codex ~1.5w, Gemini ~2w).
  주요 결정: 독립 rate-table 사본(상속 아님), Cursor 포트는 단일 `.mdc`
  규칙으로 축소, 순서는 Cursor → Copilot → Codex → Gemini.
- `2026-05-18-harness-explore-design.md` — 신규 플러그인 설계. 코드베이스
  매핑 스킬, 5단계, 병렬-디스패치 reader 패턴, `git rev-parse HEAD`
  키로 캐시된 맵, `/explore where` + `/explore deps` 슬래시 커맨드.
  총 ~3주.
- `2026-05-18-harness-debug-design.md` — 신규 플러그인 설계. Reproduce →
  isolate → hypothesize → verify 워크플로 + `.debug-state.json`
  체크포인팅, 구조화된 에러 파싱 (10개 포맷), bisection lib;
  `superpowers:systematic-debugging`을 대체하지 않고 WRAP. 총 ~3주.
- `2026-05-18-hook-precedence-integration.md` — harness-floor +
  harness-thrift + context-mode 훅 공존 프로토콜 spec. Event별 firing
  순서 매트릭스, 센티널 기반 등록 계약, settings 우선순위 정책, 기존
  훅-등록 플러그인 마이그레이션 계획.

### 구현

- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/lib/host-invoker.mjs`
  — ask-user-adapter 계약을 위한 4개의 프로덕션 호스트 invoker 래퍼.
  Cursor: 채팅 I/O (stdout + readline) 래퍼.
  Copilot/Codex: `ask_user` 도구 래퍼; Codex는 `exec_command`/FZF TTY
  경로 스텁도 포함.
  Gemini: 응답 형태 정규화를 포함한 free-text `ask_user` 래퍼.
- `plugins/harness-thrift/bin/install.mjs` — /thrift 스킬 자동 설치
  렌더러. 템플릿 hooks를 walk + `<target>/.claude/hooks/lib/`로 lib
  복사 + 렌더 후 import 경로 재작성 + `patchSettings` 적용. Flags:
  `--ctx`, `--force`, `--dry-run`, `--no-instrument`. `scripts/sync-lib.mjs`
  를 통해 harness-builder에서 vendored된 `bin/lib/render.mjs` 번들.
- `plugins/harness-thrift/skills/thrift/lib/anthropic-summariser.mjs`
  — `--use-haiku` summariser 경로를 위한 `anthropicSummariseFn({apiKey,
  model, sdkPath, sdkLoader})` 팩토리. 깔끔한 "Install
  @anthropic-ai/sdk" 에러를 포함한 동적 SDK import; `sdkLoader` 주입으
  로 실제 SDK 없이도 테스트 가능.

### 테스트

- `tests/lib/ask-user-host-invoker.test.mjs` — 4 플랫폼에 걸쳐 팩토리
  형태, 인자 pass-through, 응답 형태 정규화, end-to-end 통합을 다루는
  20개 테스트.
- `tests/lib/thrift-install.test.mjs` — 8개 테스트 (usage, full install
  layout, dry-run, force-overwrite, --no-instrument, default patch,
  --ctx variables).
- `tests/lib/thrift-anthropic-summariser.test.mjs` — 9개 테스트 (missing
  SDK error, stub sdkLoader returns text, named export resolution,
  empty turns shortcut, SDK error wrapping).
- `scripts/sync-lib.mjs` 확장: VENDORED_RENDER_ONLY에
  `plugins/harness-thrift/bin/lib` 추가 (총 13개 vendored 파일 추적).

### 결과

427/427 tests pass (이전 390, +37). 작업 폴더 깨끗함. 12개 신규 spec +
6개 신규 구현 파일 + 테스트.

### 여전히 보류 중

- 9개의 per-platform impl spec 구현 (Cursor/Copilot/Codex/Gemini ×
  agent-all + visual-qa + harness-thrift per-platform).
- `harness-explore` (~3주) 및 `harness-debug` (~3주) 구현.
- `2026-05-18-hook-precedence-integration.md` 미해결 질문 라이브 CC
  검증 (CC priority hints? hook 간 state 가시성? Notification
  semantics?).
- v2 thrift summariser, programmatic compact API 사용.

## harness-thrift v0.1 — 2026-05-18

Theme B 구현 완료. 신규 플러그인 `harness-thrift` (마켓플레이스 11번째)가
디자인 spec에 따라 비용 최적화 long-session 최적화를 출시.

### 추가됨 — research-notes (sandbox 한정 spike)

- `docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`
  — 결정: v1은 advisory summariser 출시 (파일 + Notification); programmatic
  compact는 CC plugin API 대기 후 v2로 연기.
- `docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md`
  — 결정: thrift PreToolUse(Bash)는 telemetry-only (context-mode-router
  가 권위 유지); `.claude/settings.local.json` append-only로 패치하며
  안전한 revert를 위한 `thrift-` 센티널 사용.

### 추가됨 — 플러그인

- `plugins/harness-thrift/` (v0.1.0). 6개 phase 스킬 `/thrift`:
  - Phase 0 — preflight (context-mode 감지, 기존 hooks 스캔)
  - Phase 1 — config (`.thrift.json` seed/load)
  - Phase 2 — instrument (append-only `.claude/settings.local.json` 패치)
  - Phase 3 — summariser (v1 advisory: 파일 + Notification 알림)
  - Phase 4 — cache-prime (기본 비활성화; ROI gate)
  - Phase 5 — audit (세션 종료 시 보고서)

### 추가됨 — lib 모듈

- `config-loader.mjs`, `threshold-evaluator.mjs`, `cost-estimator.mjs`,
  `metrics-collector.mjs`, `audit-renderer.mjs`, `settings-patcher.mjs`,
  `summariser.mjs`, `cache-prime.mjs` — 8개 모듈.

### 추가됨 — 템플릿

- `thrift.config.json.hbs` (seed), `audit-report.md.hbs` (보고서), 5개
  hook 템플릿 (pretool-bash-telemetry, pretool-read-coerce,
  posttool-summariser-trigger, sessionstart-cache-prime,
  sessionend-audit).

### 테스트

- thrift-core (17), thrift-audit (12), thrift-instrument (8),
  thrift-summariser (8), thrift-cache (13) — 58개 신규 lib 테스트.

### 마켓플레이스

11번째 플러그인 등록. cross-platform-{manifest,isolation} 테스트 확장;
"marketplace.json lists all eleven plugins" assertion.

### 결과

390/390 tests pass (이전 330, +60). 작업 폴더 깨끗함. 디자인 spec의 7개
sub-task 모두 완료 (sandbox 한도 내).

### 여전히 보류 중

- hook firing 순서 + Notification payload 라이브 CC 검증.
- v2 programmatic compact (CC API 출시 후 advisory v1 대체).
- `--use-haiku` summariser 경로 Anthropic SDK 통합 (현재 heuristic
  fallback만).
- 플랫폼별 Theme B 포트 (Codex/Copilot/Gemini/Cursor) — 분해 spec 연기.

## 크로스플랫폼 install + dispatch + adapter 구현 — 2026-05-18

### 추가됨

- `plugins/harness-floor-{cursor,copilot,codex,gemini}/bin/init.mjs`
  — 각 플랫폼별 install 렌더러. 플러그인의 installable 템플릿을 walk,
  타겟 프로젝트에 overwrite 보호와 함께 작성, 플랫폼별 설정 스니펫을
  출력 (Cursor: `.cursor/mcp.json`, Copilot:
  `~/.copilot/mcp-config.json`, Codex: `[[hooks.agent]]` 매처가 포함된
  `~/.codex/config.toml`, Gemini: `~/.gemini/settings.json` mcpServers).
  Flags: `--ctx`, `--force`, `--only=visual-qa|agent-all`.
- `plugins/harness-floor-gemini/bin/spawn-wave.mjs` —
  `/agent-all-gemini`용 Phase 3 wave 디스패처. wave당 N개의 병렬
  `gemini chat` 서브프로세스 spawn; tmp-file polling으로 await; 집계.
- `plugins/harness-floor-gemini/bin/spawn-page-subagent.mjs` —
  `/visual-qa-gemini`용 Phase 3 페이지 디스패처. 동일 패턴; 청크 디스패치
  를 위한 `--max-parallel` 지원. 두 spawn lib 모두 `--dry-run` 및
  `--gemini-bin` 치환 지원.
- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/lib/ask-user-adapter.mjs`
  — 디자인 spec의 구조화된 Q&A 어댑터 구현. 4 플랫폼 모두에 걸쳐 동일
  계약 `askUserStructured({stage, prompt, choices, multi,
  freeFormFallback, invoker})`를 export.

### Spec

- `docs/superpowers/specs/2026-05-18-harness-thrift-design.md` — Theme B
  `harness-thrift` 플러그인 전체 설계 (6 sub-projects, ~3주).
- `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`
  bin/init.mjs + spawn-wave/page + ask-user-adapter 검증 단계로 갱신;
  acceptance criteria 갱신.

### 테스트

- `tests/lib/harness-floor-init.test.mjs` (16 테스트)
- `tests/lib/gemini-spawn.test.mjs` (8 테스트)
- `tests/lib/ask-user-adapter.test.mjs` (26 테스트)
- `scripts/sync-lib.mjs`을 `harness-floor-*/bin/lib/`의 render.mjs로 확장

### 결과

330/330 tests pass (이전 280, +50). 작업 폴더 깨끗함.

### 여전히 보류 중

- 모든 bin/init.mjs 출력의 라이브 CLI 검증.
- 실제 `gemini` binary로 서브프로세스 디스패처 실행 (sandbox는 없음).
- 각 플랫폼의 `ask_user` 응답 형태 확인.
- 디자인 spec에 따른 `harness-thrift` 구현 (~3주).

## 크로스플랫폼 full-pipeline 포팅 (스캐폴드) — 2026-05-18

### 추가됨 — agent-all 플랫폼별 포트 (4개 sub-project)

agent-all 포팅 분해 spec에 따라, 4 플랫폼에 걸쳐 플랫폼별 디스패치
프리미티브를 사용하는 7-phase /agent-all 파이프라인의 scaffold-only
포트를 출시.

### 추가됨 — visual-qa 플랫폼별 포트 (4 플러그인 졸업)

4개의 크로스플랫폼 `visual-qa-<platform>` 플러그인을 scaffold-only에서
full 6-phase 파이프라인으로 졸업.

### 결과

280/280 tests pass (이전 203, +77). 4 새 commits.

## visual-qa 포팅 스캐폴드 — 2026-05-18

### 추가됨
- 크로스플랫폼 visual-qa 스캐폴딩을 위한 세 개의 새 사이블링 플러그인:
  - `harness-floor-codex`, `harness-floor-copilot`, `harness-floor-gemini`
- 각 플러그인은 `.visual-qa.json` 설정 파일 + 호스트 플랫폼의 MCP 설정 위치에 맞는 Playwright MCP 항목을 stdout으로 출력.
- 마켓플레이스 항목 추가; manifest/render/isolation 테스트를 새 플러그인 커버리지로 확장.
- `scripts/sync-lib.mjs` — harness-builder/agent-init와 각 크로스플랫폼 플러그인 간의 vendored `lib/` 복사본을 동기화하는 단일 명령. CI 드리프트 감지를 위한 `--check` 모드 포함.

### 여전히 보류 중
- 플랫폼별 전체 6단계 오케스트레이터 포팅 (visual-qa) — 플랫폼별 별도 spec 필요.
- 플랫폼별 agent-all 포팅 — 서브에이전트 디스패치 방식이 호스트마다 크게 다름; 플랫폼별 리서치 + spec 필요. `docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md` 참조.
- 호스트 네이티브 ask_user 등가물을 통한 Brainstorm 통합.
- 실제 CLI 대상 런타임 검증.

## 크로스플랫폼 후속 작업 — 2026-05-18

### 추가됨
- `codex-init`, `copilot-init`, `gemini-init`에 선택적 Phase 4 emit 추가:
  - Codex: `[hooks]` + `[mcp_servers.*]` 스텁을 포함한 `.codex/config.toml`
  - Copilot: `.github/hooks/{preToolUse,postToolUse,agentStop}.json` 정적 스텁 + stdout으로 출력되는 `mcp-config.json` 스니펫
  - Gemini: `hooks` (BeforeTool/SessionStart) + `mcpServers` 스텁을 포함한 `.gemini/settings.json`
- `plugins/harness-builder-cursor/bin/init.mjs` — ctx JSON을 읽어 `detectProject`를 실행하고, 렌더링된 `.cursor/rules/` 및 `.cursor/agents/` 파일을 작성하는 Node 렌더러. `--force` 없이는 덮어쓰기 거부.
- `bin/install.sh`는 이제 `init.mjs`를 가리키는 deprecation shim으로 변경됨.

### 테스트
- 세 개의 새 플랫폼 설정 템플릿에 대한 크로스플랫폼 렌더 커버리지 확장.
- `cursor-renderer.test.mjs` 신규 추가 — 임시 디렉토리를 대상으로 init.mjs 전체 end-to-end 렌더러 검증.

### 여전히 보류 중
- visual-qa / agent-all 플랫폼별 포팅 (별도 spec)
- 호스트 네이티브 `ask_user` 등가물을 통한 brainstorm 통합
- 실제 CLI 대상 런타임 검증

## 크로스플랫폼 플러그인 — 2026-05-18

### 추가됨
- 각 도구 사용자가 해당 호스트 내에서 harness-builder에 상응하는 기능을 사용할 수 있도록 네 개의 형제 플러그인 추가:
  - `harness-builder-codex` — Codex CLI용 `AGENTS.md` + `.codex/skills/<role>/SKILL.md` 생성
  - `harness-builder-copilot` — GitHub Copilot CLI용 `.github/copilot-instructions.md` + `AGENTS.md` + 경로별 instruction 파일 생성
  - `harness-builder-gemini` — Gemini CLI (일명 "antigravity")용 `GEMINI.md` + `.gemini/skills/<role>/SKILL.md` 생성
  - `harness-builder-cursor` — Cursor용 `.cursor/rules/agent-init.mdc` + `.cursor/agents/<role>.md` 생성
- 네 개의 새 플러그인에 대한 마켓플레이스 항목 추가.
- 테스트: 매니페스트 유효성 검사, 렌더 부분문자열 스냅샷, 플러그인 격리 검사.

### 이 버전 범위 밖
- 플랫폼별 visual-qa / agent-all 동등 기능
- 스텁을 넘어선 Hook & MCP 배선
- 각 플랫폼 내 전체 브레인스토밍 통합

## harness-builder 0.3.0 — 2026-05-18

### 추가됨
- `lib/detect-stack.mjs`에 `detectProject(dir)` 추가 — `{ stack, runtime, services }` 반환. `Dockerfile` 또는 `docker-compose.yml`/`compose.yaml` 계열을 감지하여 `runtime: "docker"`을 설정하고, compose YAML의 최상위 `services:` 키를 정렬된 배열로 추출(정규식 파서).
- 신규 픽스처: `docker-only`, `node-ts-docker`, `python-compose-only`, `python-requirements-only`, `dockerfile-bad-compose`.
- `CLAUDE.md` 템플릿이 runtime/services가 있을 때 `(on docker: postgres, redis)` 형식으로 렌더링.

### 변경됨
- `/agent-init`의 Phase 1이 `detectProject`를 호출하고 결과를 discovery 컨텍스트에 spread. 템플릿용 사전 조인 문자열 `services_str` 추가.

### 유지됨
- `detectStack(dir)`는 stack 문자열을 반환하는 후방호환 wrapper로 유지. 기존 호출부에 영향 없음.

## harness-builder v0.2.0 / harness-floor v0.2.0 — 2026-05-18
### 주요 변경 사항
- **`/harness-init` → `/agent-init`로 이름 변경**. 이전 이름 제거됨. 플러그인/상태 이름 따름: `.harness-state.json` → `.agent-init-state.json` (하위 호환성: 이전 파일 이름은 여전히 gitignored).
- **`/agent-init --theme=floor`가 이제 기본값입니다.** `--theme=lite`로 옵트아웃합니다.

### 추가됨
- `/agent-init --theme=thrift` 플래그 — Theme B를 위한 예약된 스텁 (아직 동작 없음).
- `harness-floor`의 `/agent-all` 스킬 (Theme C-2): superpowers brainstorming + writing-plans + subagent-driven-development를 감싸는 7단계 파이프라인, 선택적 `--loop` (Theme C-3 ralph-패턴이 플래그로 흡수됨).
- `/agent-init --theme=floor` 통합 (이제 기본값): `.agent-all.json`을 `.visual-qa.json`과 함께 시드하고 생성된 CLAUDE.md에 Floor 섹션을 추가합니다.
- 한국어 문서 형제본 (`*.ko.md`).
- 비용 제약 없는 기본값: `maxIter=10`, `maxCostUSD=500`, `waveSize=large`. 시각적 QA 확인 임계값 500→5000 캡처로 상향.
- 렌더 라이브러리: 중첩 같은 유형 블록 지원 (balance-counter 파서).
- `--theme=thrift`는 향후 Theme B 진입점으로 예약됨.

### 태그
- `harness-builder-v0.1.0-rc1` (초기 릴리스)
- `harness-floor-v0.1.0-rc1` (시각적 QA 초기)
- `harness-floor-v0.2.0-rc1` (시각적 QA + agent-all)

## harness-floor v0.1.0 — 2026-05-17
### 추가됨
- `/visual-qa` 스킬: Playwright MCP 캡처 매트릭스 + 이미지별 LLM 분석 + 실행 간 diff. 캡처당 하이브리드 JSON+마크다운 분석 출력.
- 3개 라이브러리 모듈: config-loader, matrix-builder, diff-runs, cost-estimator (모두 TDD).
- `/harness-init --visual-qa` 플래그 (v0.2.0 이후 레거시 별칭) — `.visual-qa.json`을 시드합니다.
- 다중 플러그인 레이아웃 마이그레이션: `skills/harness-init`이 `plugins/harness-builder/` 아래로 이동.

## harness-builder v0.1.0 — 2026-05-17
### 추가됨
- 초기 릴리스. `/harness-init` 스킬이 5단계에서 CLAUDE.md + `.claude/agents/` + 3 hooks + 플러그인 배선을 부트스트랩합니다.
- 4개 라이브러리 모듈: render (mustache-subset 엔진), detect-stack, plugin-scan, manifest-merge — 모두 TDD.
- 12개 템플릿: CLAUDE.md.hbs + 9개 에이전트 역할 템플릿 + 3개 훅 템플릿 + settings.local.json.hbs.
- 전역 훅: `context-mode-cache-heal.mjs` (SessionStart).
