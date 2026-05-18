> 🇺🇸 English: [README.md](README.md)

# agent-skill

**하나의 마켓플레이스, 다섯 개의 슬래시 명령, 모든 AI 코딩 도구.**

git 저장소에서 `/agent-init` 한 번만 실행하세요. Claude Code (또는 Cursor, Copilot CLI, Codex CLI, Gemini CLI)에 다섯 가지 슈퍼파워가 추가됩니다:

- `/agent-all "로그인 폼 추가"` — 기능 한 줄로 PR까지
- `/visual-qa` — 모든 페이지 스크린샷 + LLM 디자인 리뷰
- `/thrift` — 긴 세션을 저렴하게 (자동 요약, 캐시, 비용 audit)
- `/explore` — 즉시 코드베이스 맵 (`X는 어디에?`를 O(1)로 답변)
- `/debug "테스트가 flaky해요"` — 재현 → bisect → 수정 워크플로

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

이 한 명령으로 마켓플레이스의 모든 것이 업데이트됩니다. 다른 CLI에서는 아래 [다른 도구에서 업데이트](#다른-도구에서-업데이트) 참조.

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

## 더 깊이 들어가기

기술적 상세, 디자인 spec, 새 플랫폼 포팅이 필요한 경우:

- **아키텍처 & 레이아웃** — 플러그인별 design 문서는 [docs/superpowers/specs/](docs/superpowers/specs/) 참조.
- **17개 플러그인 전체 목록** — [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) 참조.
- **변경 히스토리** — [CHANGELOG.md](CHANGELOG.md) 참조. 981+ tests, 모두 통과.
- **플랫폼별 포팅** — `docs/superpowers/specs/`의 `-impl-spec.md` 또는 `-decomposition.md`로 끝나는 spec 참조.
- **크로스 플랫폼 지원 매트릭스** — [docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md](docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md) 참조.
- **Hook precedence (hooks 등록하는 플러그인 여러개 섞을 때)** — [docs/superpowers/specs/2026-05-18-hook-precedence-integration.md](docs/superpowers/specs/2026-05-18-hook-precedence-integration.md) 참조.

버전: Claude Code 코어 플러그인은 `v0.2.0`, 플랫폼별 포트는 `v0.1.0`.
