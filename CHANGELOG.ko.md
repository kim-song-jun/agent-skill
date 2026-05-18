> 🇺🇸 English: [CHANGELOG.md](CHANGELOG.md)

# 변경 로그

모든 주요 변경 사항. 각 릴리스 후보에 대한 날짜 스탬프 태그가 존재합니다.

## [미출시]
- Theme B (`harness-thrift`) — context-mode 공격적 통합, 프롬프트 캐시, 요약 훅 — 설계 보류 중.

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
