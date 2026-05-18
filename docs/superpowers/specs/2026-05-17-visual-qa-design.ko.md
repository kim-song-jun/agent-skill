> 🇺🇸 English: [2026-05-17-visual-qa-design.md](2026-05-17-visual-qa-design.md)

# Visual-QA 스킬 — 설계 스펙 (테마 C, 하위 스펙 C-1)

**상태:** 승인됨 (브레인스토밍 완료, 계획 대기 중)
**날짜:** 2026-05-17
**작성자:** kimsongjun (sungjun@molcube.com)
**테마:** 3개 중 C (비용 제한 없는 패턴). C 내의 3개 중 하위 스펙 C-1.

**참고 (2026-05-18):** `/harness-init`은 harness-builder v0.2.0에서 `/agent-init`으로 이름이 변경되었습니다. 아래 참고 사항은 원래 설계를 반영하며 해당 시점에서 정확합니다. 현재 코드에서는 `harness-init`과 `agent-init`을 같은 스킬로 취급하세요.

---

## 1. 목적

프로젝트에 `.visual-qa.json` 설정이 있을 때 호출할 수 있는 Claude Code 스킬 — `/visual-qa` — 을 제공합니다. Playwright MCP를 운전하여 스크린샷 매트릭스 (페이지 × 컴포넌트 × 상호작용 상태 × 중단점 + 스크립트된 흐름)를 캡처하고, 각 이미지에 대해 LLM 분석을 실행하고, 이전 실행과 diff하고, `docs/visual-qa/<date-slug>/`에 마크다운 + JSON 보고서를 작성합니다.

스킬은 `harness-builder`와 동일한 마켓플레이스에서 형제 플러그인 `harness-floor`로 패키징됩니다. `/agent-init --visual-qa` (기존 테마 A 스킬에 추가된 플래그)는 신규 `.visual-qa.json`을 프로젝트에 설치합니다.

설계상 비용 제한이 없습니다: 모든 실행 시 모든 스크린샷이 신선한 LLM 분석을 트리거합니다. Diff는 픽셀 수준이 아닌 보고서 수준 (이슈 키)에서 발생합니다.

## 2. 비목표

- 픽셀 diff 시각적 회귀 라이브러리가 아님 — 모든 이미지가 LLM 분석을 거칩니다.
- Playwright 설정 대체품이 아님 — `.visual-qa.json`은 캡처 매트릭스만 설명합니다. 기본 Playwright 튜닝은 프로젝트에 유지됩니다.
- CI 실행기가 아님 — 수동 `/visual-qa` 호출 전용. C-1 범위 밖의 CI 통합.
- 테마 C의 다른 하위 스펙 (agent-all/ralph-loop 래핑)과의 통합 실행기가 아님 — C-2 및 C-3에서 별도로 출시됩니다.

## 3. 입력 / 출력

**입력 (암시적):** 대상 프로젝트 작업 디렉토리, 프로젝트 루트의 `.visual-qa.json`, `baseUrl`의 실행 중인 개발 서버, 사용 가능한 Playwright MCP, 사용 가능한 LLM (기본값 `claude-sonnet-4-6`).

**입력 (명시적 플래그):**
- `--resume` — `.visual-qa-state.json`에서 완료로 표시된 단계를 건너뜁니다.
- `--force` — 오늘의 슬러그 디렉토리를 지우고 처음부터 다시 실행합니다.
- `--yes` — 단계 1 "X 캡처, 예상 비용 $Y, 계속할까요?" 확인을 건너뜁니다.
- `--budget=<USD>` — 누적 예상 비용이 이를 초과하면 중단합니다.
- `--skip-health` — 단계 0 baseUrl 상태 확인을 건너뜁니다.
- `--slug=<custom>` — 출력 디렉토리의 자동 생성 날짜 슬러그를 재정의합니다.

**출력 (실행당):**

```
<project>/
├── .visual-qa.json                                  # 설정 (사용자 편집 또는 시드)
├── .visual-qa-state.json                            # 단계 진행 (gitignore)
└── docs/visual-qa/
    └── 2026-05-17-<slug>/
        ├── report.md                                # 인간 가독 요약
        ├── report.json                              # 구조화됨 (다음 실행 diff용)
        ├── home/
        │   ├── mobile/
        │   │   ├── _page.png
        │   │   ├── _page.analysis.json
        │   │   ├── _page.analysis.md
        │   │   ├── hero-cta__default.png
        │   │   ├── hero-cta__default.analysis.json
        │   │   ├── hero-cta__default.analysis.md
        │   │   ├── hero-cta__hover.png
        │   │   ├── hero-cta__hover.analysis.json
        │   │   └── hero-cta__hover.analysis.md
        │   ├── tablet/
        │   └── desktop/
        ├── settings/
        └── flows/
            └── signup-happy-path/
                ├── 00-signup-empty.png
                ├── 00-signup-empty.analysis.{json,md}
                ├── 01-signup-success.png
                └── 01-signup-success.analysis.{json,md}
```

## 4. 아키텍처

### 4.1 리포 레이아웃 변경

현재 단일 플러그인 레이아웃 (테마 A)은 `harness-floor`가 깔끔하게 맞도록 다중 플러그인 레이아웃으로 이동합니다:

```
agent-skill/
├── .claude-plugin/
│   ├── marketplace.json            # 이제 2개 플러그인 나열
│   └── plugin.json                 # 제거됨 — plugins/harness-builder/로 이동
├── plugins/
│   ├── harness-builder/            # 테마 A에서 리포 루트였음
│   │   ├── plugin.json
│   │   └── skills/agent-init/
│   │       └── ... (변경 없음)
│   └── harness-floor/              # 신규 (테마 C)
│       ├── plugin.json
│       └── skills/visual-qa/
│           ├── SKILL.md
│           ├── phases/
│           │   ├── 0-preflight.md
│           │   ├── 1-config.md
│           │   ├── 2-discover.md
│           │   ├── 3-capture.md
│           │   ├── 4-aggregate.md
│           │   └── 5-summary.md
│           ├── lib/
│           │   ├── config-loader.mjs
│           │   ├── matrix-builder.mjs
│           │   ├── diff-runs.mjs
│           │   └── cost-estimator.mjs
│           └── templates/
│               ├── visual-qa.config.json.hbs
│               ├── analysis-prompt.md.hbs
│               └── report.md.hbs
├── hooks/                          # 변경 없음 (전역 cache-heal)
├── docs/
│   ├── superpowers/
│   │   ├── specs/
│   │   └── plans/
│   └── visual-qa/                  # 이 리포가 하네스될 때만 출력
└── tests/
    ├── lib/                        # harness-builder 라이브러리 테스트 (기존)
    └── visual-qa/                  # 신규 — visual-qa 테스트
        ├── lib/
        ├── templates/
        ├── scenarios/
        └── fixtures/
```

리포 레이아웃 이동은 이 스펙에 번들로 제공됩니다. 왜냐하면 `harness-floor`를 이동 없이 삭제하면 일관성 없는 레이아웃 (한 플러그인은 루트, 한 플러그인은 `plugins/`)이 생성되기 때문입니다. 이동은 메커니컬 (git mv)하고 히스토리를 보존합니다.

### 4.2 업데이트된 플러그인 매니페스트

`.claude-plugin/marketplace.json`:

```json
{
  "name": "agent-skill",
  "description": "Claude Code를 위한 하네스 빌더 + visual-QA + (향후) 최적화 스킬",
  "plugins": [
    { "name": "harness-builder", "source": "./plugins/harness-builder", "description": "/agent-init으로 CLAUDE.md, .claude/agents/, 훅 및 플러그인 배선 부트스트랩" },
    { "name": "harness-floor",   "source": "./plugins/harness-floor",   "description": "Playwright MCP로 시작하는 비용 제한 없는 패턴 (시각적 회귀 + 이미지별 LLM 분석)" }
  ]
}
```

`plugins/harness-floor/plugin.json`:

```json
{
  "name": "harness-floor",
  "version": "0.1.0",
  "description": "Playwright MCP 캡처 및 이미지별 LLM 분석을 사용한 Visual QA 스킬",
  "skills": ["skills/visual-qa"]
}
```

플러그인 수준의 신규 훅 없음. 스킬 자체가 유일한 항목입니다.

### 4.3 단계 파이프라인

`/visual-qa`는 엄격하게 순서대로 6개 단계를 실행합니다. 각 단계는 `.visual-qa-state.json`에 완료를 기록합니다 (테마 A의 `.agent-init-state.json`과 동일한 형태 패턴).

| 단계 | 이름 | 병렬? |
|-------|------|-----------|
| 0 | Preflight (설정 확인, Playwright MCP 확인, 상태 확인) | 아니오 |
| 1 | 설정 + 매트릭스 빌드 + 비용 확인 | 아니오 |
| 2 | 사전 실행 발견 + 슬러그 디렉토리 생성 | 아니오 |
| 3 | 캡처 + 분석 (페이지 수준 분산 `superpowers:dispatching-parallel-agents`를 통해) | **예** |
| 4 | 수집 + Diff + 보고서 | 아니오 |
| 5 | 콘솔 요약 + 종료 코드 | 아니오 |

### 4.4 `.visual-qa-state.json` 형태

```json
{
  "phases": [
    { "phase": 0, "completedAt": "2026-05-17T..." },
    { "phase": 1, "completedAt": "..." }
  ],
  "slug": "2026-05-17-abc1234",
  "matrix": { "totalCaptures": 247, "byPage": { "home": 60, "settings": 30 } },
  "estCostUSD": 4.20,
  "perPageStatus": {
    "home": { "phase3": "completed", "captures": 60, "errors": 0 },
    "settings": { "phase3": "running" }
  }
}
```

### 4.5 `.visual-qa.json` 스키마

브레인스토밍 노트의 §3을 참고하세요. 완전성을 위해 여기에 재현합니다. 필수 최상위 키: `baseUrl`, `breakpoints`, `pages`. 선택: `auth`, `flows`, `analysis`, `output`.

```json
{
  "baseUrl": "http://localhost:3000",
  "auth": {
    "type": "none|cookie|bearer|form",
    "cookieFile": ".visual-qa-auth.json",
    "loginFlow": [
      { "goto": "/login" },
      { "fill": "[name=email]", "value": "${env:VQA_EMAIL}" },
      { "fill": "[name=password]", "value": "${env:VQA_PASSWORD}" },
      { "click": "button[type=submit]" },
      { "waitFor": "[data-testid=dashboard]" }
    ]
  },
  "breakpoints": [
    { "name": "mobile",  "width": 375,  "height": 812 },
    { "name": "tablet",  "width": 768,  "height": 1024 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "pages": [
    {
      "name": "home",
      "path": "/",
      "components": [
        { "name": "header",   "selector": "[data-testid=header]" },
        { "name": "hero-cta", "selector": "[data-testid=hero] button", "states": ["hover", "focus"] }
      ]
    }
  ],
  "flows": [
    {
      "name": "signup-happy-path",
      "steps": [
        { "goto": "/signup" },
        { "screenshot": "signup-empty" },
        { "fill": "[name=email]", "value": "test@example.com" },
        { "click": "button[type=submit]" },
        { "waitFor": "[data-testid=signup-success]" },
        { "screenshot": "signup-success" }
      ]
    }
  ],
  "analysis": {
    "model": "claude-sonnet-4-6",
    "categories": ["accessibility", "alignment", "color-contrast", "copy-quality", "responsive-fit"],
    "severityThreshold": "minor"
  },
  "output": {
    "dir": "docs/visual-qa",
    "keepLastN": 10
  }
}
```

상태 의미론:
- `states` 필드가 없는 컴포넌트는 기본 상태로 캡처됩니다 (중단점당 1개 스크린샷).
- `states: ["hover", "focus"]`를 사용한 컴포넌트는 중단점당 1 + 2 = 3개 스크린샷을 생성합니다.
- 페이지의 `requiresAuth: true`는 해당 페이지-부에이전트 실행의 시작에서 `auth.loginFlow`를 트리거합니다 (각 부에이전트는 자신의 브라우저 탭을 가지므로 부에이전트 간 HttpOnly 쿠키 공유는 취약합니다. 따라서 페이지-부에이전트별로 다시 로그인합니다). `auth.cookieFile`은 단계 0 자격 증명 검증 전용으로 예약됩니다.
- `flows[].steps`는 소형 DSL입니다: `goto | fill | click | hover | waitFor | screenshot`. `screenshot` 작업은 캡처된 이미지 레이블을 이름 지정하고 분석을 트리거합니다.
- `${env:VAR}` 플레이스홀더는 설정 로드 시간에 해결됩니다. 누락된 env 변수는 단계 1을 중단합니다.

## 5. 컴포넌트 상세

### 5.1 단계 0 — Preflight

1. 프로젝트 루트의 `.visual-qa.json` 존재를 확인합니다. 부재 시: `/agent-init --visual-qa` 제안을 출력하고 중단합니다.
2. Playwright MCP 도구 가능성을 확인합니다 (`mcp__plugin_playwright_playwright__browser_navigate` 호출 가능). 불가능 시: MCP 설치 지침을 출력하고 중단합니다.
3. `GET /`을 사용한 `baseUrl` 프로브 (타임아웃 5초). 200이 아니고 `--skip-health`가 설정되지 않은 경우: "개발 서버 다운, 계속할까요?" 사용자 확인을 기다립니다 (또는 `--yes`가 비대화형 모드에서 전달된 경우 중단).
4. `.visual-qa-state.json` (있으면)을 읽습니다. `--resume`이고 `max(state.phases[*].phase) >= 0`이면 단계 0 proper를 건너뜁니다.

### 5.2 단계 1 — 설정 + 매트릭스

1. `lib/config-loader.mjs#loadConfig(path)`는 JSON을 읽고, 파싱하고, 검증하고, `${env:...}`을 해결합니다. 반환: `{ok: true, config}` 또는 `{ok: false, errors: [{path, message}]}`. 오류 시: 오류를 출력하고 중단합니다.
2. `lib/matrix-builder.mjs#buildMatrix(config)`는 평탄 목록을 반환합니다:
   ```javascript
   [
     { kind: "page",      page: "home", bp: "mobile" },
     { kind: "component", page: "home", bp: "mobile", component: "hero-cta", state: "default" },
     { kind: "component", page: "home", bp: "mobile", component: "hero-cta", state: "hover" },
     { kind: "flow_step", flow: "signup-happy-path", stepIndex: 0, label: "signup-empty" }
   ]
   ```
3. `lib/cost-estimator.mjs#estimate(matrix, modelPrice)`는 대략 USD 비용을 반환합니다 (매트릭스 길이 × 이미지당 비용 요소).
4. 인쇄:
   ```
   매트릭스: 3개 페이지, 2개 흐름 전체 247개 캡처.
   예상 LLM 비용: ~$4.20 (claude-sonnet-4-6)
   계속할까요? [Y/n]
   ```
5. `--yes`인 경우 확인을 건너뜁니다. 캡처 > 500이고 `--force`가 설정되지 않은 경우 `--yes`인 경우에도 명시적 확인을 요구합니다.
6. 상태에 `{phase: 1, completedAt}`를 push합니다.

### 5.3 단계 2 — 사전 실행 발견 + 슬러그 디렉토리

1. `<output.dir>/`의 하위 디렉토리를 나열합니다. 완전한 `report.json`을 사용한 가장 최근의 것을 찾습니다 (최고 형식: 디렉토리 이름의 ISO 날짜 접두사 순서).
2. 메모리에 해당 JSON을 `priorRun`으로 숨깁니다 (또는 첫 실행이면 `null`).
3. `keepLastN`이 설정되고 총 하위 디렉토리 ≥ `keepLastN`인 경우 가장 오래된 초과 디렉토리를 삭제합니다 (rm -rf).
4. 오늘의 슬러그를 계산합니다: `YYYY-MM-DD-<7-char-random>`. `--slug=<custom>`이 제공된 경우 재정의합니다.
5. `<output.dir>/<slug>/`를 생성합니다. 이미 존재하고 `--resume`/`--force`가 아닌 경우: "슬러그가 이미 존재합니다"로 중단합니다. `--force`인 경우: 먼저 rm -rf합니다.
6. `{phase: 2, completedAt}`를 상태에 push합니다.

### 5.4 단계 3 — 캡처 + 분석 (병렬)

사전 분산: `superpowers:dispatching-parallel-agents`를 사용하여 스킬 도구를 호출합니다.

매트릭스 항목을 페이지별로 그룹화합니다. 각 페이지마다:

이러한 입력을 사용하여 부에이전트 하나를 분산합니다:
```javascript
{
  page,                  // 페이지 설정 객체
  baseUrl,
  breakpoints,           // 전체 중단점 목록
  authState,             // 쿠키 파일의 경로 또는 null
  analysisConfig,        // { model, categories, severityThreshold }
  outputDir              // <slug-dir>/<page-name>/
}
```

각 페이지-부에이전트는 그 다음 순차적으로 수행합니다:
1. `page.requiresAuth`인 경우: `auth.loginFlow` 단계 DSL (§5.4 단계 4의 흐름에서와 동일한 DSL)을 실행하여 이 부에이전트의 탭에서 세션을 설정합니다. 그 다음 계속합니다.
2. `browser_navigate`를 `baseUrl + page.path`로 이동합니다.
3. 각 중단점에 대해:
   a. `browser_resize(width, height)`
   b. 전체 페이지 스크린샷 → `<outputDir>/<bp>/_page.png`. LLM 분석을 즉시 실행합니다 (§5.6 참고). 이미지 옆에 `.analysis.{json,md}`를 작성합니다.
   c. 각 컴포넌트에 대해:
      - 기본 상태: `browser_take_screenshot` (선택자) → `<outputDir>/<bp>/<component>__default.png`. 분석합니다.
      - 각 `component.states`에 선언된 상태에 대해:
        - 상태 적용: `hover` → `browser_hover`; `focus` → `browser_evaluate('el.focus()')`; `active` → `browser_evaluate('el.classList.add("active")')` (또는 `:active`는 입력 이벤트 없이 캡처하기 어려움 — §6 주의사항 참고); `disabled` → `browser_evaluate('el.setAttribute("disabled", "")')`.
        - 스크린샷 → `<outputDir>/<bp>/<component>__<state>.png`. 분석합니다.

4. 흐름 처리 (페이지 + 중단점 루프 후 별도 pass): `steps[0].goto`가 이 페이지 아래인 각 흐름에 대해 단계 DSL을 실행합니다:
   - `goto x` → `browser_navigate(baseUrl + x)`
   - `fill sel val` → `browser_type(sel, val)`
   - `click sel` → `browser_click(sel)`
   - `hover sel` → `browser_hover(sel)`
   - `waitFor sel` → `browser_wait_for(sel)`
   - `screenshot label` → 전체 페이지 스크린샷을 `<outputDir>/../flows/<flow.name>/<NN-label>.png`로 분석 + 분석

5. `{page: "home", captures: 60, errors: 0, paths: [...]}`를 반환합니다.

페이지-부에이전트 중단 (타임아웃, auth 만료, 3+ 분석 실패)는 해당 페이지를 불완전한 것으로 표시하고 `{page, captures: N, errors: [...], status: "incomplete"}`를 반환합니다. 오케스트레이터는 다른 페이지로 계속합니다.

### 5.5 단계 4 — 수집 + Diff + 보고서

1. `<slug-dir>/` 아래 모든 `.analysis.json` 파일을 읽습니다 (누락되거나 오류로 표시된 파일은 건너뜁니다).
2. `runIssues: [{page, component, state, bp, severity, category, description, suggestion, imagePath}]`로 평탄화합니다.
3. 이슈 키를 계산합니다: `${page}/${component}/${state}/${bp}/${category}/${sha1(description).slice(0,8)}`. 실행 간에 "같은 이슈"를 인식할 수 있을 정도로 안정적입니다.
4. `lib/diff-runs.mjs#diff(runIssues, priorRun?.issues)`는 `{new: [...], resolved: [...], unchanged: [...]}`를 반환합니다.
5. `report.json`을 작성합니다: `{slug, timestamp, matrix, issues: runIssues, diff, perPageStatus, estCostUSD, actualCostUSD}`.
6. `templates/report.md.hbs`를 위의 컨텍스트로 렌더링합니다. 슬러그 디렉토리 루트에 `report.md`를 작성합니다.
7. `{phase: 4, completedAt}`를 상태에 push합니다.

### 5.6 이미지별 LLM 분석

페이지-부에이전트는 LLM 에이전트입니다 (에이전트 도구로 분산 `model = analysis.model`). 각 캡처에 대해:

1. 방금 작성한 `.png`를 `Read` 도구를 통해 읽습니다 (Claude Code는 PNG를 멀티모달 시각 입력으로 읽습니다).
2. 분석을 자신의 모델 출력의 일부로 구성하고 `templates/analysis-prompt.md.hbs`에 의해 지정된 형식을 따릅니다 — 이는 분산 프롬프트에 포함됩니다.
3. 모델 출력은 펜스 ```json 블록 (스키마에 대해 검증) 다음에 발견을 설명하는 마크다운 문단 — 다른 것은 없음.
4. 페이지-부에이전트는 json 블록을 추출하여 `.analysis.json`에 작성합니다. 후행 문단을 `.analysis.md`에 작성합니다. json 블록이 잘못된 형식이거나 스키마가 유효하지 않으면 페이지-부에이전트는 분석을 한 번 다시 시도합니다 (이미지를 다시 읽고, 더 엄격한 접두사를 사용하여 다시 내보냅니다). 여전히 잘못된 형식이면: `{error: "analysis_malformed", raw: "..."}`를 `.analysis.json`에 작성하고 계속합니다.

외부 Claude API 호출은 JS 모듈에서 없습니다 — 부에이전트 자신의 LLM이 작업을 수행합니다. `analysis.model` 설정 필드는 페이지-부에이전트를 분산할 때 에이전트 도구의 `model` 매개변수로 전달됩니다.

캡처당 JSON 형태:
```json
{
  "issues": [
    { "severity": "critical|major|minor", "category": "accessibility|...", "description": "...", "suggestion": "..." }
  ],
  "summary": "one-line"
}
```

JSON 블록 다음에 오는 마크다운은 `.analysis.md` 파일로 이미지 옆에 들어갑니다. JSON은 `.analysis.json`으로 들어갑니다.

### 5.7 단계 5 — 요약

콘솔에 3-5줄을 출력하고 종료 코드를 설정합니다:
```
Visual QA 완료: 247개 캡처, 12개 이슈 (3 critical, 5 major, 4 minor)
vs 사전 실행: +2 신규, -7 해결, 5 미변경
보고서: docs/visual-qa/2026-05-17-abc1234/report.md
```

종료 코드:
- 0 (critical 이슈 없음)
- 1 (any critical 이슈)
- 2 (단계 3에 부분 실패 — 일부 페이지 불완전)

## 6. 오류 처리

| 시나리오 | 동작 |
|----------|-----------|
| `.visual-qa.json` 누락 | 단계 0 중단 + `/agent-init --visual-qa` 제안 |
| Playwright MCP 사용 불가 | 단계 0 중단 + `/plugin install playwright@claude-plugins-official` 제안 |
| `baseUrl` 응답 없음 | 단계 0 사용자에게 계속할지 묻기 (비대화형 모드가 아닌 경우 중단) |
| 설정 스키마 유효하지 않음 | 단계 1 `field: message` 목록과 함께 중단 |
| 누락된 `${env:VAR}` | 단계 1 변수 이름을 지정하여 중단 |
| 행렬 > 500 캡처 | 단계 1 `--force`가 설정된 경우에도 명시적 `--yes` 요구 |
| `--budget` 중행 시 초과 | 단계 3 정상적으로 중단, 부분 보고서 저장 |
| 단일 LLM 호출 잘못된 형식 | 한 번 다시 시도, 그 다음 캡처 오류로 표시, 계속 |
| 한 페이지에서 3+ 분석 오류 | 페이지-부에이전트 BLOCKED, 오케스트레이터 다른 페이지 계속, 단계 5 종료 코드 2 |
| Auth 흐름 실패 (로그인 페이지 리다이렉트 중 실행) | 페이지-부에이전트 BLOCKED, 사용자에게 `auth.cookieFile` 갱신을 요청 |
| 런타임 시 선택자를 찾을 수 없음 | 해당 캡처를 건너뛰고, "누락된 선택자" 섹션에 누적하여 보고서에 보고 |
| `:active` 의사 클래스가 JS 클래스 토글로 도달 불가 | `analysis-prompt.md.hbs`에 제한 문서화하여 모델이 알 수 있도록 합니다. 가능한 캡처 |
| 동일 슬러그 디렉토리가 존재 | `--resume` 또는 `--force` 아닌 경우 중단 |
| 디스크 캡처 중간에 가득 찬 경우 | 중단, 부분 상태를 위치에 남겨 `--resume` 용 |

## 7. 테스트 전략

### 7.1 라이브러리 단위 테스트 (`tests/visual-qa/lib/`)

| 모듈 | 테스트 |
|--------|------|
| `config-loader.mjs` | 5개 유효 + 5개 유효하지 않은 고정 장치 설정. `{ok, errors}` 정확성을 확인합니다. `${env:...}` 존재할 때 해결, 누락되면 오류. |
| `matrix-builder.mjs` | 소형 설정 (1 페이지, 1 컴포넌트, 2 중단점, 1 상태) → 예상 4 항목 매트릭스 (1 페이지 + 2 컴포넌트 상태 × 2 bp). 더하기 1 흐름 → 예상 흐름 단계 추가. |
| `diff-runs.mjs` | (사전, 현재) 고정 장치 쌍: 첫 실행 (사전 null), 변경 없음, 신규 이슈, 해결된 이슈, 수정된 이슈 (같은 키, 다른 설명). `{new, resolved, unchanged}` 배열을 확인합니다. |
| `cost-estimator.mjs` | 행렬 크기 × 모델 가격 테이블 → 예상 USD. 엣지 경우: 빈 행렬 → $0. |

### 7.2 템플릿 스냅샷 테스트 (`tests/visual-qa/templates/`)

`visual-qa.config.json.hbs`, `analysis-prompt.md.hbs`, `report.md.hbs`를 3개 고정 장치 컨텍스트로 렌더링 → 스냅샷.

### 7.3 시나리오 통합 테스트 (`tests/visual-qa/scenarios/`)

Playwright MCP와 LLM을 mock합니다. 페이지-부에이전트 모듈은 `runPage({page, mockBrowser, mockAnalyzer, outputDir})` 함수를 내보냅니다. 테스트는 5가지 시나리오를 드라이브합니다:
1. 첫 실행 (사전 없음) — 보고서 형태, 모든 이슈를 "신규"로 표시하는 것을 확인합니다.
2. 다시 실행, 변경 없음 — 모든 이슈를 "미변경"으로 표시하는 것을 확인합니다.
3. 신규 이슈 — 한 mock 분석 결과가 추가 이슈를 가집니다.
4. 해결된 이슈 — 한 mock 분석 결과가 이슈를 드롭합니다.
5. 부분 실패 — 1/3 페이지가 2 캡처 후 throw; 오케스트레이터가 다른 페이지를 계속하고 보고서가 페이지를 불완전한 것으로 표시하는 것을 확인합니다.

### 7.4 수동 E2E 체크리스트 (`tests/visual-qa/manual-checklist.md`)

개발 서버가 실행 중인 가짜 next.js 고정 장치 프로젝트에 대해 실행합니다. 다음을 체크합니다:
- [ ] 아무 `.visual-qa.json` 없이 `/visual-qa` → 중단 + 제안.
- [ ] `/agent-init --visual-qa`로 시드된 설정이 유효합니다.
- [ ] 첫 실행이 전체 슬러그 디렉토리 + report.md + 이미지별 .png/.json/.md를 생성합니다.
- [ ] Hover 상태가 실제로 호버를 캡처합니다 (기본 상태와 시각적으로 비교).
- [ ] Auth 흐름이 작동합니다: 보호된 페이지 캡처가 도착합니다.
- [ ] `--resume` (Ctrl-C 후)이 마지막 완료된 단계에서 계속합니다.
- [ ] `--force`가 지우고 처음부터 시작합니다.
- [ ] `--budget=0.01`이 단계 1에서 중단합니다.
- [ ] 모든 critical 이슈가 있으면 종료 코드 1입니다.
- [ ] 소스 변경 없이 다시 실행 → "vs 사전 실행: 0 신규, 0 해결".

### 7.5 범위 밖

- CI의 실시간 Playwright 실행 (수동 체크리스트로 다룸).
- 단위 테스트의 실제 LLM 호출 (mock 분석기 사용).
- Playwright MCP 자신의 정확성 검증.

## 8. 테마 A에 미치는 마이그레이션 영향

테마 A의 `skills/agent-init/...`은 `plugins/harness-builder/skills/agent-init/...`으로 이동합니다. 구체적으로:
- `git mv skills/agent-init plugins/harness-builder/skills/agent-init`
- `git mv` 루트 `hooks/`을 `plugins/harness-builder/hooks/`로 (이전 루트 `plugin.json`에서 `${CLAUDE_PLUGIN_ROOT}/hooks/...`를 통해 참조됨)
- `mv .claude-plugin/plugin.json plugins/harness-builder/plugin.json`
- 기존 플러그인의 `source: "./plugins/harness-builder"`과 새로운 플러그인의 `source: "./plugins/harness-floor"`를 추가하도록 `.claude-plugin/marketplace.json` 업데이트
- `tests/lib/` 아래 테스트는 작동 유지 — 상대 경로를 통해 `tests/lib/*.test.mjs`에서 `../../skills/agent-init/lib/*.mjs`로 import하므로, 이는 `../../plugins/harness-builder/skills/agent-init/lib/*.mjs`가 됩니다. 임포트 경로를 업데이트합니다.
- `tests/lib/__snapshots__/` 아래 스냅샷 경로는 이미 `agents_planner.md.hbs__ts-small.snap` 같은 슬래시 대체 이름을 사용 — 상대 템플릿 경로에 의해 키 지정되므로 유효 상태 유지. `tests/lib/render.test.mjs`의 `TEMPLATES_DIR` 상수가 변경됩니다.

마이그레이션은 메커니컬하고 C-1에 착륙합니다. C-2까지 기다리면 `harness-floor`를 형제와 일치하지 않는 레이아웃으로 배송하기 때문입니다.

## 9. 예제

### 첫 실행: 기준선 설정

```
cd my-next-app
npm run dev                  # localhost:3000
/visual-qa
```

`docs/visual-qa/2026-05-18-abc1234/` 생성:
- `report.md` — 3개 페이지에 걸친 모든 247개 캡처 표시
- 이미지별 `.png`, `.analysis.json`, `.analysis.md` 파일
- Diff 섹션 비어 있음 (비교할 이전 실행 없음)
- 종료 코드 0 (첫 기준선에서 중요 이슈 없음)

### 시각적 버그 도입 후 재실행

```
# 버그 도입: hero 버튼 색상을 빨강으로 변경
git commit -am "style: change hero button to red"

/visual-qa
```

출력 `docs/visual-qa/2026-05-18-xyz9876/`:
- 동일한 247개 캡처
- 맨 위 Diff: `+3 새 이슈 (2개 중요 색상 대비, 1개 주요 정렬)`
- 리포트는 새 이슈가 있는 hero 버튼 컴포넌트 표시
- 종료 코드 1 (중요 이슈 감지)

### 인증 흐름 예제

```
# .visual-qa.json 구성:
"auth": {
  "type": "form",
  "loginFlow": [
    { "goto": "/login" },
    { "fill": "[name=email]", "value": "${env:VQA_EMAIL}" },
    { "fill": "[name=password]", "value": "${env:VQA_PASSWORD}" },
    { "click": "button[type=submit]" },
    { "waitFor": "[data-testid=dashboard]" }
  ]
},
"pages": [
  { "name": "dashboard", "path": "/dashboard", "requiresAuth": true }
]

VQA_EMAIL=test@example.com VQA_PASSWORD=pass123 /visual-qa
```

페이즈 3 로그:
```
  Dashboard page requires auth
  Running login flow...
  Captured dashboard at mobile (after login)
  Captured dashboard at tablet (after login)
  Captured dashboard at desktop (after login)
```

## 10. 향후 작업 (이 스펙의 범위 밖)

- **C-2 (agent-all 파이프라인)**: 사용자의 기존 `agent-all` 워크플로우를 `superpowers:subagent-driven-development`로 래핑하는 `harness-floor`의 형제 스킬.
- **C-3 (ralph-loop 패턴 + harness-init 통합)**: `/agent-init --theme=floor` 표면을 하나의 설정으로 agent-all + visual-qa + ralph-loop을 번들합니다.
- **CI 통합**: 별도의 플러그인 또는 스킬로 GitHub Actions에 `/visual-qa`를 배선하고 PR 코멘트 출력을 포함합니다.
- **베이스라인 모드**: 픽셀 diff 먼저, 임계값 초과 시 LLM만 선택지 (테마 B, 비용 최적화 테마에 속할 것).
