> 🇺🇸 English: [CHANGELOG.md](CHANGELOG.md)

# 변경 로그

모든 주요 변경 사항. 각 릴리스 후보에 대한 날짜 스탬프 태그가 존재합니다.

## [미출시]
- `harness-thrift` v2 summariser — Claude Code programmatic compact API
  출시 시 도입 (현재 v1 advisory).
- 9개의 per-platform impl spec 구현 (agent-all + visual-qa × 4 플랫폼 +
  harness-thrift 분해) — 설계는 아래에 완료.
- `harness-explore` 및 `harness-debug` 구현 — 설계 완료.
- hook precedence integration spec의 라이브 CC 검증.

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
