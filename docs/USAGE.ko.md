> 🇺🇸 English: [USAGE.md](USAGE.md)

# 사용 가이드

`agent-skill` 플러그인을 위한 일반적인 명령어 레시피.

## 부트스트래핑

### 새로운 프로젝트 (기본값 — 전체 Floor 하네스)

```
mkdir my-app && cd my-app && git init
/agent-init
```

생성:
- `CLAUDE.md` (운영 원칙 + 에이전트 인덱스 + Floor 테마 섹션 포함)
- `.claude/agents/*.md` — 3개에서 9개 역할 파일 (작음/중간/큼)
- `.claude/hooks/*.mjs` — context-mode-router, session-summary, cache-heal, 운영 정책 훅
- `.claude/settings.local.json` — 핵심 훅과 정책 훅 등록
- `.visual-qa.json` + `.agent-all.json` — Floor 구성

### 최소 하네스 (lite)

```
/agent-init --lite
```

task ledger, 정책 훅, `.visual-qa.json`, `.agent-all.json`, 및 CLAUDE.md의 Floor 섹션을 건너뜁니다.

### 기존 프로젝트 (기존 CLAUDE.md 유지)

```
/agent-init --merge
```

거부하는 대신 기존 CLAUDE.md에 하네스 섹션을 추가합니다.

### 다시 실행 / 복구

```
/agent-init --resume       # Ctrl-C 또는 부분 실행 후 계속
/agent-init --force        # 상태를 초기화하고 다시 시작 (덮어씀)
```

## 다중 에이전트 파이프라인 (`/agent-all`)

### 자유로운 프롬프트에서 일회성 실행

```
/agent-all "Add OAuth login with GitHub"
```

페이즈: brainstorming → writing-plans → wave dispatch (병렬 구현 + 검토) → PR.

### 기존 작업 파일에서

```
/agent-all docs/tasks/12-fix-flaky-test.md
```

brainstorming을 건너뜁니다 (이미 완료했으므로), 계획 + 디스패치로 바로 진행합니다.

### 테스트가 통과할 때까지 반복

```
/agent-all "Fix the flaky login test" --loop --max-iter=10
```

`npm test` (`.agent-all.json`의 `loop.breakCondition`에서)가 `stableIters` 연속 반복 동안 종료 코드 0을 반환할 때까지 전체 파이프라인을 다시 실행합니다. 하드 캡이 무한 실행을 방지합니다.

### PR 생성 건너뛰기 (커밋만)

```
/agent-all "Refactor user.ts" --no-pr
```

### 웨이브 크기 재정의

```
/agent-all "Build dashboard" --wave-size=large    # 최대 8개 병렬 서브에이전트
```

## 시각적 QA (`/visual-qa`)

### 첫 실행 (기준선 생성)

```
cd my-app
npm run dev                                       # dev 서버 :3000에서
/visual-qa
```

출력: `docs/visual-qa/<date>-<hex>/report.md` + 이미지별 `.png` + `.analysis.{json,md}`.

### 코드 변경 후 다시 실행

```
/visual-qa                                        # 최신 이전 실행과 비교
```

`report.md`의 맨 위에서 새로운 / 해결된 / 변경되지 않은 이슈를 보고합니다.

### 강제로 새 슬러그 생성 (오늘 실행 덮어쓰기)

```
/visual-qa --force
```

### 예산 보호

```
/visual-qa --budget=2.50
```

예상 비용이 $2.50을 초과하면 캡처 전에 중단합니다.

## 구성: `/goal` + `/agent-all --loop`

`/goal`은 조건이 충족될 때까지 세션 중지를 차단하는 Claude Code 훅입니다. `--loop`와 함께 사용하면 완전히 자동화된 수렴을 할 수 있습니다:

```
/goal "ship the analytics dashboard PR with all tests green"
/agent-all "Build analytics dashboard with auth, charts, export" --loop --max-iter=15 --max-cost=80
```

세션은 다음 중 하나가 발생할 때까지 종료되지 않습니다:
1. 에이전트가 목표 완료를 인정
2. `/goal clear`로 수동으로 지움
3. `--max-iter` 또는 `--max-cost` 도달 (루프 종료, 하지만 목표 훅은 지움까지 차단)

### 패턴: 중첩 목표 + 작업별 루프

```
/goal "complete sprint goal: 3 features + bugfix"
/agent-all "Feature A" && /agent-all "Feature B" && /agent-all "Feature C" && /agent-all "Bugfix" --loop
```

## Codex / Claude Code가 아닌 통합

Codex CLI 프로젝트에서는 Codex 전용 builder/floor 포트를 사용합니다:

```
/codex-init
/codex-init --lite
run /agent-all for "Hard refactor that needs second-opinion"
```

`/codex-init`은 `AGENTS.md`, `.codex/skills/*`, `.codex/hooks/agent-policy-hook.mjs`를 쓰고, `[[hooks.PreToolUse]]` 같은 현재 Codex command hook 형식의 `~/.codex/config.toml` 스니펫을 출력합니다. `/codex-init --lite`는 루트 `AGENTS.md`와 planner/dev/reviewer 스킬만 쓰는 Codex 경량 경로입니다. Codex floor 워크플로는 현재 Codex command hook이 Claude Code의 Task-style subagent dispatch 표면을 제공하지 않기 때문에 프롬프트/순차 dispatch로 동작합니다.

대상 저장소에 shell로 설치할 때는 platform renderer를 사용합니다:

```bash
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lite
```

기본 renderer 경로는 무거운 builder + floor + thrift 번들을 설치합니다. `--lite`는 builder-only 경로이며 floor/thrift 파일과 전역 Codex config 스니펫을 건너뜁니다.

직접 라이브러리로 사용할 때, 핵심 모듈은 이식 가능한 Node.js입니다:

```bash
node -e "
import('./node_modules/agent-skill/plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs')
  .then(m => console.log(m.buildWaves(tasks, waveConfig)))
"
```

(플러그인은 아직 npm에 게시되지 않았습니다; 지금은 파일을 직접 벤더하세요.)

## 문제 해결

### `/agent-init`이 "dirty git tree" 중단

먼저 로컬 변경 사항을 커밋하거나 숨깁니다. `/agent-init`은 단일 부트스트랩 커밋을 깔끔하게 만들기 위해 깨끗한 트리를 고집합니다.

### `/visual-qa`가 "Playwright MCP not available" 중단

playwright 플러그인을 설치합니다:

```
/plugin install playwright@claude-plugins-official
```

### `/agent-all` 루프가 코드 3으로 종료

`--max-iter` 소진됨. 다음 중 하나:
- `--max-iter` 상향 (또는 구성 `maxIter`)
- `.agent-all.json`에서 `loop.breakCondition` 완화
- 차단 중인 항목에 대해 `.agent-all-state.json`에서 마지막 웨이브의 게이트 판정 검사

### `/plugin install` 후 플러그인이 로드되지 않음

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin marketplace update agent-skill
```

그 다음 설치를 다시 시도합니다.

---

## Decision-surfacing — 패널 형태

`/agent-all`이 Phase 3에서 implementer subagent를 dispatch할 때, 첫 동작은 **scoping pass** — read-only로 코드를 읽고 혼자 결정했을 결정 후보들을 JSON payload로 반환. main thread는 각 결정을 subagent의 추천 표시된 1/2/3 패널로 보여줍니다.

세션 출력 예 (대화 모드):

```
=== Task 3: Add OAuth callback handler ===

[Token storage] 기존 코드는 session에 cookie 쓰지만, JWT 토큰은 이 codebase에서
src/lib/auth.ts:42 기준으로 보통 localStorage에 저장됨.

추천 사유: 이 앱의 sessions은 이미 cookie-based; storage 전략 섞으면 복잡도 증가. Cookie가 기존 패턴과 일치.

  1. (Recommended) Cookie (httpOnly, secure) — 기존 session 패턴과 일치
  2. localStorage — 기존 JWT 패턴과 일치, XSS 위험 인지
  3. 서버 측 session store (Redis) — 가장 안전, Redis 의존성 추가

선택: _
```

**Non-TTY 모드** (야간, `--yes`, loop iter ≥ 2)는 recommended를 자동 선택하고 `docs/agent-all/iter-<N>/decisions.md`에 append:

```markdown
# Auto-resolved decisions — iter 7 — 2026-05-21T03:14Z

## Task 3 — Add OAuth callback handler

### Token storage
- Chosen: **Cookie (httpOnly, secure)** (recommended)
- Reasoning: 기존 session 패턴 …
```

**과거 auto-pick 검토:** `grep -A2 "Chosen:" docs/agent-all/iter-*/decisions.md`로 모든 iteration의 자동 선택을 한 번에. Regression 발견 시 다음 iteration plan에 force re-ask 메모.

**프로젝트별 opt-out:** `.agent-all.json` →
```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```
Protocol 전체 스킵. Verification + reviewer-audit hook은 별도로 계속.

**플랫폼별 강제 강도:**
| 플랫폼 | 메커니즘 | 강도 |
|---|---|---|
| Claude Code | `floor-policy` hook (PreToolUse + PostToolUse on Task) | 🟢 Hard |
| Copilot CLI | `.github/hooks/decision-protocol.json` | 🟢 Hard |
| Codex CLI | 프롬프트/순차 floor 워크플로; command hook은 shell/policy 이벤트만 담당 | 🟡 프롬프트 |
| Cursor | `.cursor/rules/decision-protocol.mdc` (always-loaded rule) | 🟡 Soft |
| Gemini CLI | `.gemini/agent-all-decision-protocol.md` (GEMINI.md에서 참조) | 🟡 Soft |
| VS Code Copilot | `.github/agent-all/decision-protocol.md` (copilot-instructions.md에서) | 🟡 Soft |
