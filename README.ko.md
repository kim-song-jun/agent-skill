> 🇺🇸 English: [README.md](README.md)

# agent-skill

Claude Code 플러그인 마켓플레이스로, **`/agent-init`**과 기본적으로 비용 제약이 없는 에이전트 하네스 생태계를 제공합니다.

한 번의 명령어(`/agent-init`)로 완전한 에이전트 하네스를 부트스트랩합니다: CLAUDE.md, 역할 특화 서브에이전트 파일, 훅, 플러그인 배선, 그리고 (기본적으로) 시각적 QA와 다중 웨이브 파이프라인 실행을 위한 Floor 테마 번들.

## 빠른 시작

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
```

그 다음 모든 git 리포지토리에서:

```
/agent-init                        # 전체 Floor 하네스 (기본값)
/agent-init --theme=lite           # 최소: CLAUDE.md + agents + hooks만
/agent-init --theme=thrift         # 예약됨: 토큰 비용 최적화 (Theme B 계획 중)
/agent-init --size=large --force   # 9개 에이전트 명단으로 다시 빌드
```

그 다음 다음 중 하나를 실행합니다:

```
/agent-all "Add user signup form"                  # 전체 파이프라인 → PR
/agent-all "Fix flaky test" --loop --max-iter=5    # 성공할 때까지 반복
/visual-qa                                          # 스크린샷 매트릭스 + LLM 분석
```

## 테마 (기본값: `--theme=floor`)

| 테마 | 번들되는 항목 | 기본값? | 사용 시점 |
|-------|-------------------|----------|----------|
| `floor` | CLAUDE.md + agents + 3 hooks + `.visual-qa.json` + `.agent-all.json` + Floor 섹션 | ✅ 기본값 | 대부분의 프로젝트 — 비용 제약 없음, 모든 것 제공 |
| `lite` | CLAUDE.md + agents + 3 hooks만 | 선택 | 제약이 있는 환경 / 빠른 프로토타입 |
| `thrift` | (예약됨) Theme B — context-mode 공격적 사용, 프롬프트 캐시, 요약 훅 | 계획 중 | 비용 민감한 장기 실행 프로젝트 |

## 예제 워크플로우

### 1. 새로운 기능 프로젝트를 end-to-end로 부트스트랩

```
mkdir my-app && cd my-app && git init
/agent-init                                         # ← floor 하네스 설치
/agent-all "Build a todo list with auth"            # ← brainstorm→plan→dispatch→PR
```

### 2. Next.js 개발 서버에서 시각적 회귀 테스트

```
cd my-next-app                                      # 이미 .visual-qa.json 있음
npm run dev                                         # localhost:3000
/visual-qa                                          # 모든 페이지 × 해상도 캡처
# → docs/visual-qa/2026-05-18-abc1234/report.md
```

### 3. 자체 반복 수정 루프

```
/agent-all "Fix bug where login redirects 3x" \
  --loop \
  --max-iter=10 \
  --max-cost=20
```

`npm test` (구성된 breakCondition)가 `stableIters` 연속 실행 동안 종료 코드 0을 반환하거나, maxIter/maxCost에 도달할 때 중지합니다.

### 4. 자동 실행을 위해 `/goal`과 합성

```
/goal "ship feature X to staging"                   # 만족할 때까지 중지 차단
/agent-all "Implement feature X" --loop             # 반복
```

`/goal` 훅은 당신 (또는 에이전트)이 목표 완료를 확인할 때까지 세션을 활성 상태로 유지합니다. `--loop`와 함께 사용하면 완전 자동 수렴을 할 수 있습니다.

## Codex / Claude Code가 아닌 플랫폼

lib 모듈(`plugins/*/skills/*/lib/*.mjs`)과 템플릿(`*.hbs`, `*.json`)은 순수 Node.js / 순수 데이터 — 이식 가능합니다. 페이즈 프롬프트는 Claude Code 기술 스킬이며 다른 플랫폼에 맞춰 조정이 필요합니다.

`harness-floor`와 함께 `codex@openai-codex` 플러그인을 사용하면, `agent-all` 페이즈 3 디스패치는 웨이브가 막힐 때 `codex:rescue` 기술을 통해 Codex에 위임할 수 있습니다. 어려운 작업을 위한 제2 의견 구현자로 유용합니다.

순수 Codex CLI 사용:
- `agent-skill` lib 코드 설치: `node -e "..."` (또는 lib 파일 직접 벤더)
- 기술 오케스트레이션을 Codex 프롬프트로 다시 구현 (페이즈 문서가 좋은 자료)
- 훅 시스템은 Claude Code 특정; Codex 고유 훅 동등물로 복제 (사용 가능한 경우)

## 아키텍처 한눈에

```
agent-skill/
├── plugins/
│   ├── harness-builder/        # /agent-init (theme A)
│   └── harness-floor/          # /visual-qa, /agent-all (theme C)
├── hooks/                      # global SessionStart hooks
└── docs/superpowers/{specs,plans}/
```

3개 테마; 2개 구현 + 1개 예약:
- **A (harness-builder)** — `/agent-init`을 통한 프로젝트별 하네스 빌더
- **B (harness-thrift)** — 토큰 비용 최적화 — **계획 중**, `--theme=thrift`로 예약됨
- **C (harness-floor)** — 비용 제약 없는 패턴: `/visual-qa` + `/agent-all`

## 로드맵

- Theme B (harness-thrift): context-mode 공격적 통합, 프롬프트 캐시 최적화, 요약 훅, 픽셀 diff 시각적 QA 모드
- 가장 많이 스킵되는 페이즈에 대한 옵트인 텔레메트리
- `gh` PR 댓글 통합 (시각적 QA 리포트용)
- 분산 웨이브 디스패치 (다중 머신)

## FAQ

**Q: `/agent-init`이 내 CLAUDE.md를 덮어쓸까요?**
A: 아니요. 기본값은 CLAUDE.md가 존재하면 중단입니다. `--merge`를 사용하여 하네스 섹션을 추가하거나, `--force`로 덮어씁니다.

**Q: `/agent-all --loop`이 안전한가요?**
A: `maxIter` (하드 캡 50), `maxCostUSD` (기본값 $500), 및 `breakCondition`으로 제한됩니다. 낮은 비용 한도와 명확한 테스트 명령을 설정하면 무한 실행할 수 없습니다.

**Q: Floor 테마를 원하지 않으면 어떻게 하나요?**
A: `/agent-init --theme=lite`를 사용합니다. 기본 CLAUDE.md + agents + 3 hooks만 얻습니다.

**Q: 에이전트 명단을 커스터마이징할 수 있나요?**
A: `/agent-init` 후에 `.claude/agents/*.md`를 편집합니다. 순수 마크다운입니다.

**Q: Codex/Cursor/다른 도구와 작동하나요?**
A: lib 코드와 템플릿은 이식 가능합니다; 기술 오케스트레이션은 Claude Code 특정입니다. 위의 "Codex / Claude Code가 아닌 플랫폼"을 참조하세요.

## 버전 관리

- `harness-builder`: v0.2.0 (현재) — `/harness-init`이 `/agent-init`으로 이름 변경됨
- `harness-floor`: v0.2.0 (현재) — `agent-all` 기술이 `visual-qa` 옆에 추가됨

전체 이력은 [CHANGELOG.md](CHANGELOG.md)를 참조하세요.
