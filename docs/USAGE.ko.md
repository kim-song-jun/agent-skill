> 🇺🇸 English: [USAGE.md](USAGE.md)

# 사용 가이드

`agent-skill` 플러그인을 위한 일반적인 명령어 레시피.

처음 설치하거나 init이 필요한지 헷갈리면 먼저 [그림 포함 사용설명서](USER_MANUAL.ko.md)를 보세요. 전역 플러그인 설치와 프로젝트별 `/agent-init` 차이, 바로 사용할 수 있는 상태인지 판단하는 표, `/agent-all` 요청 예시가 들어 있습니다.

하네스를 비교하거나 조직용 general harness를 설계하려면
[하네스 포지셔닝](HARNESS_POSITIONING.ko.md)을 먼저 보세요. `agent-skill`이
standalone runtime이 아니라 cross-host project scaffold인 이유와,
Gajae-Code나 OMO가 더 맞는 경우를 정리해 둔 문서입니다.

## 부트스트래핑

### 새로운 프로젝트 (기본값 — 전체 Floor 하네스)

```
mkdir my-app && cd my-app && git init
/agent-init
```

생성:
- `CLAUDE.md` (운영 원칙 + 에이전트 인덱스 + Floor 테마 섹션 포함)
- `.claude/agents/*.md` — 크기별 기본 역할 + 운영 역할: orchestrator, frontend-dev, backend-dev, integration-dev, verification-reviewer, qa-reviewer, design-reviewer, security-reviewer, data-reviewer
- `.claude/hooks/*.mjs` — context-mode-router, session-summary, cache-heal, 운영 정책 훅
- `.claude/settings.local.json` — 핵심 훅과 정책 훅 등록
- `.visual-qa.json` + `.agent-all.json` — Floor 구성

### 최소 하네스 (lite)

```
/agent-init --lite
```

task ledger, 정책 훅, `.visual-qa.json`, `.agent-all.json`, 및 CLAUDE.md의 Floor 섹션을 건너뜁니다.

### 언어 유지

```
/agent-init --lang=ko
/agent-init --lang=auto
```

선택한 상호작용 언어를 `CLAUDE.md`에 기록하고 `.agent-all.json` `language`를
같은 값으로 유지해 이후 `/agent-all` 프롬프트가 상속하게 합니다.
`--lang=auto`는 `$AGENT_INIT_LANG`, `$LANG`, `$LC_ALL`, `$LC_MESSAGES`,
또는 로케일을 해석한 뒤 확정된 `ko`/`en` 값을 기록합니다.

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
/agent-all .agent-skill/tasks/T-20260611-001-fix-flaky-test.md
```

brainstorming을 건너뜁니다 (이미 완료했으므로), 계획 + 디스패치로 바로 진행합니다.
새 task 파일은 파일명에 `T-YYYYMMDD-NNN` display id를 쓰고,
frontmatter와 `.agent-skill/registry/tasks.json`에는 `AS-TASK-*` canonical id를
기록합니다.

### 테스트가 통과할 때까지 반복

```
/agent-all "Fix the flaky login test" --loop --max-iter=10
```

`npm test` (`.agent-all.json`의 `loop.breakCondition`에서)가 `stableIters`
연속 반복 동안 종료 코드 0을 반환할 때까지 전체 파이프라인을 다시
실행합니다. `--max-iter=0` 또는 `.agent-all.json`의 `loop.maxIter: null`을
사용하면 반복 횟수는 무제한입니다. 그래도 비용/런타임 예산, hard policy
hook, 사용자 중단, 반복 failure signature가 loop를 멈출 수 있습니다.

웹이 아닌 완료 기준은 visual QA 대신 verification adapter를 사용할 수 있습니다.

```
/agent-all "CLI 동작 검증" --loop \
  --break-condition='{"type":"verification-adapter","adapter":"cli","config":{"command":"my-tool --check","goldenStdoutPath":"test/golden/help.txt"}}'

/agent-all "notebook 산출물 갱신" --loop \
  --break-condition='{"type":"verification-adapter","adapter":"notebook-data","config":{"command":"jupyter nbconvert --execute analysis.ipynb --to notebook --inplace","notebooks":["analysis.ipynb"],"requiredArtifacts":["outputs/summary.csv"],"seed":"42","dataSnapshot":"snapshot-id"}}'

/agent-all "SQL 결과 검증" --loop \
  --break-condition='{"type":"verification-adapter","adapter":"sql-db","config":{"files":["queries/validate.sql"],"command":"npm run validate:sql","assertions":[{"id":"row-count","type":"row-count","expected":10}],"requiredArtifacts":["reports/explain.txt"]}}'
```

기본 adapter는 `verify:web-ui`, `verify:cli`, `verify:api-contract`,
`verify:notebook-data`, `verify:sql-db`, `verify:batch-job`입니다. 결과는
`.agent-skill/runs/<run-id>/verification-evidence.jsonl`에
`verification-evidence/v1`로 기록됩니다.

`harness-data`는 notebook, SQL, artifact diff 작업용 `/data-runner` 안내를
추가합니다. 생성되는 task template은 Data Task Addendum을 포함하며,
파괴적 SQL/data 작업은 `allowDestructive=true`가 명시 승인되지 않으면
차단됩니다.

### PR 생성 건너뛰기 (커밋만)

```
/agent-all "Refactor user.ts" --no-pr
```

### 웨이브 크기 재정의

```
/agent-all "Build dashboard" --wave-size=large    # 최대 8개 병렬 서브에이전트
```

## 세션 인계 (`/agent-handoff`)

### handoff와 새 세션 프롬프트 생성

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md
```

작성 파일:
- `.agent-skill/handoff/T-20260611-001-fix-flaky-test.handoff.md`
- `.agent-skill/handoff/T-20260611-001-fix-flaky-test.session.md`

handoff는 완료/남은 작업, blocker, 검증 증거, git 상태, next-action 후보를
요약합니다. session prompt는 source-of-truth 파일, preflight gate, 수정 가능
범위, 검증 gate, 위험 명령 승인 정책을 포함합니다.

### 쓰기 없이 미리보기

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --dry-run
```

### task doc 구조 엄격 검사

```
/agent-handoff .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --strict
```

`--strict`는 표준 task-ledger 섹션 존재만 요구하며, 진행 중인 작업의
unchecked checkbox는 허용합니다. non-TTY 모드 또는 `--yes`에서는 추천 next
action(`/agent-all <task> --resume`)을 자동 선택하고
`.agent-skill/runs/handoff-audit.jsonl`과
`.agent-skill/runs/handoff/interactions.jsonl`에 근거를 기록합니다.

### 생성된 artifact에서 재개

```
/agent-all .agent-skill/tasks/T-20260611-001-fix-flaky-test.md --resume
```

`--resume`은 `.agent-skill/handoff/*.handoff.md`와 `.session.md` 파일을
자동 감지합니다. 마이그레이션 중에는 legacy `docs/tasks/*` sibling도
fallback으로 읽고, metadata를 surface한 뒤 이어서 진행합니다.

## 시각적 QA (`/visual-qa`)

### 첫 실행 (기준선 생성)

```
cd my-app
npm run dev                                       # dev 서버 :3000에서
/visual-qa
```

출력: `.agent-skill/reports/visual-qa/<date>-<hex>/report.md` + 이미지별 `.png` + `.analysis.{json,md}`.

## Artifact policy

생성되는 control-plane 산출물은 기본적으로 `.agent-skill/` 아래에 저장됩니다.
task 문서는 `.agent-skill/tasks/`, spec은 `.agent-skill/specs/`, plan은
`.agent-skill/plans/`, handoff 파일은 `.agent-skill/handoff/`, task registry는
`.agent-skill/registry/tasks.json`, run log는 `.agent-skill/runs/`, visual QA report는 `.agent-skill/reports/visual-qa/`,
debug log는 `.agent-skill/reports/debug/`, thrift audit은 `.agent-skill/reports/thrift/`,
baseline은 `.agent-skill/baselines/`를 사용합니다. 기존 `docs/tasks/` task 문서는 migration/resume을 위해 계속
읽을 수 있습니다. `/agent-init`은 기존 사용자 문서를 삭제하지 않습니다.

`.agent-all.json`의 `"artifact": {"root": ".custom-agent", "exportDocs": false}`로
root를 바꿀 수 있습니다. `exportDocs: true`는 선택한 report를 publication용
`docs/`로 mirror하는 워크플로에서만 명시적으로 켜세요.

Control-plane artifact를 저장하거나 공유하기 전에는 redaction gate가
handoff/session prompt, visual/debug/thrift report, verification evidence,
policy/interaction/spawn log, PR body를 scan합니다. High-severity secret
후보는 기본 차단하고, medium privacy 후보는 mask합니다. allowlist는 원문
값이 아니라 path/rule 단위로만 설정합니다:

```json
{
  "security": {
    "redaction": {
      "allowPaths": ["docs/public-fixtures/**"],
      "allowRules": []
    }
  }
}
```

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
3. `--max-iter`, `--max-cost`, 또는 `--max-runtime-sec` 도달 (루프 종료, 하지만 목표 훅은 지움까지 차단)

### 패턴: 중첩 목표 + 작업별 루프

```
/goal "complete sprint goal: 3 features + bugfix"
/agent-all "Feature A" && /agent-all "Feature B" && /agent-all "Feature C" && /agent-all "Bugfix" --loop
```

## Claude/Codex / Claude Code가 아닌 통합

Codex CLI 프로젝트에서는 Codex 전용 builder/floor 포트를 사용합니다:

```
/agent-init
/agent-init --lite
/agent-init --lang=ko
/agent-init --update-foundations
run /agent-all for "Hard refactor that needs second-opinion"
```

`/agent-init`은 `AGENTS.md`, `.codex/skills/*`, `.codex/hooks/agent-policy-hook.mjs`를 쓰고, `[[hooks.PreToolUse]]` 같은 현재 Codex command hook 형식의 `~/.codex/config.toml` 스니펫을 출력합니다. `/agent-init --lite`는 루트 `AGENTS.md`와 planner/dev/reviewer 스킬만 쓰는 Codex 경량 경로입니다. Codex floor 워크플로는 현재 Codex command hook이 Claude Code의 Task-style subagent dispatch 표면을 제공하지 않기 때문에 프롬프트/순차 dispatch로 동작합니다.

`/agent-init --lang=ko`는 Codex 상호작용 언어를 `AGENTS.md`에 기록합니다. floor 번들을 설치할 때 `.agent-all.json` `language`도 같은 값으로 유지하세요. `/agent-init --update-foundations`는 승인된 foundation(`superpowers@claude-plugins-official`, `context-mode@context-mode`)만 갱신하며 전역 Codex config를 패치하지 않습니다.

대상 저장소에 shell로 설치할 때는 platform renderer를 사용합니다. Claude는 `/agent-init`과 같은 project-local bootstrapper를 쓰고, Codex 및 다른 도구는 각 플랫폼 전용 renderer를 사용합니다:

```bash
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --theme=builder
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --lite
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lang=ko
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --lite
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --no-update-foundations
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --update-foundations  # foundation 갱신 strict 모드
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --theme=debug
```

기본 renderer 경로는 operational scaffold를 설치합니다. Claude가 아닌 플랫폼은 기본으로 무거운 builder + floor + thrift 번들을 설치하며, Codex `all`은 debug skill도 함께 설치합니다. `--theme=debug`는 `run /debug "<failing command>"`용 `.codex/skills/debug/`, `.debug-artifacts/`, `.agent-skill/reports/debug/`만 설치합니다. Claude `--theme=builder`는 `.visual-qa.json`/`.agent-all.json` 없이 무거운 builder scaffold만 설치합니다. `--lang=ko|en|auto`는 생성된 루트 지침을 맞추고, floor config가 설치될 때는 `.agent-all.json` language 값도 함께 맞춥니다. `--lite`는 builder-only 경로이며 floor/thrift/debug 파일과 전역 Codex config 스니펫을 건너뜁니다. Claude/Codex operational 설치는 가능할 때 승인된 foundation(`superpowers@claude-plugins-official`, `context-mode@context-mode`)만 자동 갱신하고, `claude` CLI가 없거나 승인된 foundation 갱신이 실패하면 degraded foundation 경고를 출력한 뒤 계속 진행합니다. Lite는 기본 자동 foundation 갱신을 건너뛰며, 무거운 artifact 설치 없이 strict foundation 갱신이 필요하면 `--lite --update-foundations`를 함께 사용하세요. `--update-foundations`는 갱신 실패를 strict 실패로 만들 때, `--no-update-foundations`는 opt-out할 때, `--dry-run`은 `claude` 호출 없이 승인된 계획만 볼 때 사용하세요. Claude와 Codex `all`, `builder`, `--lite`, 그리고 Codex `--theme=debug` 설치는 post-install doctor를 자동 실행하며, 검증을 의도적으로 미룰 때만 `--no-doctor`를 넘기세요.

릴리즈 artifact는 provenance manifest로 설치/갱신 전에 검증할 수 있습니다:

```bash
node scripts/release-provenance.mjs --release=<rc-tag> --out-dir=.agent-skill/releases/<rc-tag>
./scripts/install-all.sh --verify-checksums --manifest=.agent-skill/releases/<rc-tag>/release-manifest.json --claude-code
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --verify-checksums --manifest=.agent-skill/releases/<rc-tag>/release-manifest.json
./scripts/update.sh --verify-provenance --manifest=.agent-skill/releases/<rc-tag>/release-manifest.json --cli=codex
```

수동 doctor 재실행:

```bash
node /path/to/harness-builder/bin/doctor.mjs --target=/path/to/my-project --platform=claude
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex --profile=builder
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex --profile=lite
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/my-project --platform=codex --profile=debug
```

source checkout에서 실행할 때는 `node /path/to/agent-skill/scripts/doctor.mjs ...` compatibility wrapper가 같은 검사를 수행합니다. doctor는 project-local Claude/Codex scaffold를 검증하고, `--profile=auto`일 때 operational/builder/lite 또는 Codex debug profile을 자동 감지하며, 필수 artifact 누락은 non-zero exit로 보고합니다. 누락되었거나 오래된 생성 파일에는 실행 가능한 `fix:` 명령을 출력하고, `superpowers` 또는 `context-mode`가 없으면 foundation 설치용 `next:` 명령도 함께 출력합니다.

Claude/Codex uninstall과 cleanup:

```bash
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --uninstall
./scripts/install-platform.sh --platform=claude --target=/path/to/my-project --uninstall --force-root-clean
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --uninstall
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project --uninstall --force-root-clean
node /path/to/harness-builder/bin/clean.mjs --target=/path/to/my-project --platform=claude --dry-run
node /path/to/harness-builder-codex/bin/clean.mjs --target=/path/to/my-project --platform=codex --dry-run
```

보수적 cleanup은 생성된 Claude/Codex 역할 파일, hook, floor/thrift config,
Codex debug skill 디렉터리, task template, helper script를 제거합니다.
Debug 증거인 `.agent-skill/reports/debug/`와 `.debug-artifacts/`는 보존합니다. 루트
`CLAUDE.md`/`AGENTS.md` 가이드는 agent-skill sentinel이 있을 때만 정리하며,
생성된 루트 가이드까지 의도적으로 제거하려면 `install-platform.sh --uninstall`에
`--force-root-clean`을 같이 넘기세요.

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

Loop guard가 소진됨. 다음 중 하나:
- `--max-iter` 상향 (또는 구성 `maxIter`), `--max-runtime-sec` 상향, 또는 명시적 반복 무제한으로 `--max-iter=0` 설정
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

`/agent-all`이 Phase 3에서 implementer subagent를 dispatch할 때, 첫 동작은 **scoping pass** — read-only로 코드를 읽고 혼자 결정했을 결정 후보들을 JSON payload로 반환. coordinator는 각 결정을 `agent-interaction/v1`으로 정규화하고, Claude에서는 native `AskUserQuestion`, Codex/Copilot/Cursor/Gemini에서는 prompt/markdown renderer로 보여줍니다.

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

**Non-TTY 모드** (야간, `--yes`, loop iter ≥ 2)는 recommended low/medium-risk 옵션을 자동 선택하고 `.agent-skill/runs/<run-id>/decisions.md`와 `.agent-skill/runs/<run-id>/interactions.jsonl`에 append:

```markdown
# Auto-resolved decisions — iter 7 — 2026-05-21T03:14Z

## Task 3 — Add OAuth callback handler

### Token storage
- Chosen: **Cookie (httpOnly, secure)** (recommended)
- Reasoning: 기존 session 패턴 …
```

**과거 auto-pick 검토:** `grep -A2 "Chosen:" .agent-skill/runs/*/decisions.md`로 모든 iteration의 자동 선택을 한 번에. Regression 발견 시 다음 iteration plan에 force re-ask 메모.

High-risk recommended/default 옵션은 non-TTY에서 자동 승인하지 않습니다.
`.agent-all-state.json`과 `.agent-skill/runs/<run-id>/interactions.jsonl`에
blocked interaction으로 기록하고, run은 사용자/planner 입력을 기다리거나
escalate해야 합니다. `/agent-handoff`와 `/agent-all --resume`도 같은 schema로
resume next-action prompt를 처리하며 handoff는
`.agent-skill/runs/handoff/interactions.jsonl`을 씁니다.

**프로젝트별 opt-out:** `.agent-all.json` →
```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```
Protocol 전체 스킵. Verification + reviewer-audit hook은 별도로 계속.

**Policy engine audit:** hard hook과 loop gate는 공유
`agent-policy-event/v1` -> `agent-policy-result/v1` schema를 사용합니다.
결정은 `.agent-skill/runs/<run-id>/policy-log.jsonl`에 JSONL로 append됩니다.
dynamic `/agent-all` orchestration은 각 role, reason, wave, cost estimate를
`.agent-skill/runs/<run-id>/spawn-log.jsonl`에도 기록합니다. 저장되는 state
필드는 `orchestration:
{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,failureSignatures,blockedReasons,budget}`입니다.
사용자-facing 결정은 `state.interactions`에 저장되고
`.agent-skill/runs/<run-id>/interactions.jsonl`에 append됩니다. Redaction
summary는 `.agent-skill/runs/<run-id>/redaction-audit.jsonl`에 append되고,
원문 없이 rule/count/severity/action metadata만 저장합니다.

**Cost telemetry:** `/agent-all`은 플랫폼이 보고한 cost, token usage, 또는
output-size 기반 fallback 추정을 `agent-cost-telemetry/v1`로 정규화합니다.
run은 `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`에 append하고 최신
summary를 `state.costTelemetry.summary`에 미러링합니다.
`.agent-all.json: telemetry.cost.warnAtRatio`(기본 `0.8`)에서 사용자 확인을
요구하고 `defaults.maxCostUSD`에서 중단합니다. 추정 요금 조정이 필요하면
`telemetry.cost.modelRates`에 프로젝트별 provider rate override를 둡니다.

**Skill utility eval:** `node scripts/skill-eval.mjs --smoke`는 fixture
baseline과 `agent-all`을 pass rate, iteration, token estimate, cost overhead,
manual intervention, reviewer-gate failure, quality-debt finding, rollback으로
비교합니다. 결과는 `.agent-skill/evals/<date>/summary.md`, `summary.json`,
`runs.jsonl`, `artifacts/fixture-manifest.json`에 기록됩니다. CI-safe 보고는
`--smoke --no-write --json`을 사용하고, visual QA, quality gate, dynamic
orchestration, verification-adapter mode까지 포함하는 `--full`은 수동 또는
release-candidate benchmark 용도로 둡니다.

**플랫폼별 강제 강도:**
| 플랫폼 | 메커니즘 | 강도 |
|---|---|---|
| Claude Code | `floor-policy` hook + `renderer-claude.mjs` native `AskUserQuestion` | 🟢 Hard |
| Copilot CLI | `.github/agent-all/decision-protocol.md` + `renderer-copilot.mjs`; 수동 hook 검토 후 선택적 hook helper | 🟡 프롬프트 |
| Codex CLI | 생성 command hook은 shell policy hard-block; `renderer-codex.mjs`로 프롬프트/sequential floor interaction 처리 | 🟡 Mixed |
| Cursor | `.cursor/rules/decision-protocol.mdc` + `renderer-cursor.mjs` | 🟡 Soft |
| Gemini CLI | `.gemini/agent-all-decision-protocol.md` + `renderer-gemini.mjs` | 🟡 Soft |
| VS Code Copilot | `.github/agent-all/decision-protocol.md` + Copilot markdown renderer | 🟡 Soft |
