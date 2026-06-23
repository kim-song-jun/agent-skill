> 🇺🇸 English: [CHANGELOG.md](CHANGELOG.md)

# 변경 로그

모든 주요 변경 사항. 각 릴리스 후보에 대한 날짜 스탬프 태그가 존재합니다.

## 미출시

## Agent-skill v0.7.6 — 2026-06-23

### `.wiki/`를 이제 preflight에서 결정적으로 생성 (optional phase 단계가 아님)

v0.7.4/v0.7.5 auto-loop는 위키 생성을 **Phase 2(plan) 안의 optional·non-fatal 서브스텝**에 의존했습니다 — `ensureWiki`는 오케스트레이터 모델이 그 단계를 실행하고 run이 Phase 2까지 도달해야만 돌았습니다. 실제로는 디렉토리가 정상 run에서 자주 생기지 않았습니다: 게이트는 wired·단위테스트 통과였지만 side effect 자체가 건너뛸 수 있어, `wiki.auto: true`인 프로젝트도 여러 run 동안 `.wiki/`가 아예 없을 수 있었습니다. v0.7.6은 생성을 결정적으로 만듭니다.

- **Preflight 생성 (Phase 0, 4b 단계):** `config.wiki.auto`가 켜져 있으면 `/agent-all`이 이제 preflight에서 `ensureWiki('.wiki')`를 먼저 호출해, optional Phase 2 서브스텝에 의존하지 않고 **모든** run에서 `.wiki/`가 생성됩니다. `ensureWiki`는 idempotent + non-fatal — Phase 2의 이후 호출은 no-op가 되고("started a project wiki" 알림 중복 없음), 위키 실패는 여전히 run을 실패시키지 않습니다.
- **실행 가능한 두 포트:** Claude Code와 Codex `0-preflight.md`에 적용(Codex는 install-anchored `.codex/skills/agent-all/lib` 경로 사용). prose 포트(Copilot/Gemini/Cursor)는 loop를 돌리지 않으므로 영향 없음.
- **Contract 테스트:** CC와 Codex preflight ensure-contract assertion 추가(`config.wiki.auto` 게이트, install-anchored import, 최초 1회 생성 알림) — 결정적 생성이 optional-only 배선으로 silent regression되지 못하게 보장.

Suite: 2282 → 2283 통과 (+1: preflight 결정적 생성 contract).

## Agent-skill v0.7.5 — 2026-06-22

### 토큰 인식 위키 auto-loop — 작성을 경량 모델에 위임

v0.7.4 auto-loop는 **메인 오케스트레이터 모델**이 위키 페이지 prose를 inline으로 작성(비쌈)했습니다. v0.7.5는 그 작성을 **경량 모델 wiki-scribe 서브에이전트**에 위임해, 위키를 키우는 데 메인 스레드/비싼 모델 토큰이 들지 않게 합니다.

- **wiki-scribe 위임 (Claude Code):** Phase 2/5가 이제 `config.wiki.model`(신규, 기본 **`haiku`**) Task 서브에이전트를 띄워 계획/결과를 읽고 페이지 prose `{ bluf, details, contradictions }`만 격리 컨텍스트에서 반환합니다. 비싼 작성은 cheap 티어에서 돌고, 메인 스레드는 compact JSON 반환값만 부담.
- **설계상 install-safe (Option A):** scribe는 작성만 하고 lib는 건드리지 않음 — orchestrator가 스킬 자체 컨텍스트에서 `writePage()`를 호출하므로 `./lib/wiki-log.mjs` import가 install-anchored 유지(scribe가 프로젝트 cwd 기준으로 `./lib`를 해석하는 v0.7.2 ERR_MODULE_NOT_FOUND 클래스 회피). lib 메커니즘은 불변, free code.
- **`wiki.model` config:** config-loader DEFAULTS(기본 `haiku`) + 양 config 템플릿에 추가, 문자열 검증 + 오버라이드 가능(예: `"sonnet"`).
- **Codex 포트 정직성:** Codex는 세션당 단일 모델(per-dispatch 모델 티어 없음)이라 inline 작성 — phase 문서에 명시(`wiki.model`은 Codex에선 inert). 적대 리뷰(SHIP); 편집 잔여 모순 trailer 1건을 잡아 제거(Phase 2가 더 이상 "직접 prose 작성"이라 말하지 않음), 재발 방지 contract-test guard 추가.

Suite: 2278 → 2282 통과 (+4: wiki.model 기본값/검증, CC cheap-model scribe 계약, Codex inline 작성 정직 노트).

## Agent-skill v0.7.4 — 2026-06-22

### agent-all ↔ wiki 자동 루프 (올인원 지식 베이스)

`/agent-all`이 작업하며 `.wiki/` 프로젝트 위키를 **읽고 키웁니다** — `/wiki`를 직접 칠 필요 없이 위키가 스스로 유지됩니다. **기본 켬**(`.agent-all.json` → `wiki.auto`, 기본 `true`; `--no-wiki`로 끔). Claude Code + Codex(실행 가능 위키 포트)에서 동작하고, Copilot/Gemini/Cursor는 "이 포트엔 없음" 정직 노트를 가집니다. 출시 전 적대 검증(lib 라이프사이클 + phase-doc 배선 + scope-honesty, 전부 SHIP, 블로커 0).

- **읽기 → 계획 → 기록 루프, 기존 phase에 통합:** Phase 1이 의도를 위키 인덱스로 라우팅해 매칭 페이지의 과거 결정/모순을 계획에 반영(*읽기* 절반); Phase 2가 첫 실행 시 `.wiki/`를 자동 생성(1회 안내)하고 계획+결정을 grade **C**로 기록; Phase 5가 같은 페이지를 결과로 갱신 — 변경 파일맵·검증 결과·PR/task 크로스링크 — grade **C→B** 승격, 기록된 계획과의 모순 명시, compile 자가 감사(diff=0) 실행.
- **토픽 병합(비대화 방지):** `routePhaseA(의도)`가 같은 주제를 ONE 페이지로 되돌려(실행마다 새 파일이 아니라 갱신), 위키가 폭증 대신 누적됩니다.
- **설계상 install-safe:** 메커니즘은 새 `lib/wiki-log.mjs`에 있고 **로컬 벤더링된** `./wiki-index.mjs`를 import — cross-skill import 안 함(Codex에서 agent-all과 wiki가 다른 디렉터리에 설치되는 v0.7.2 ERR_MODULE_NOT_FOUND 클래스 회피). 두 lib는 각 실행 포트의 agent-all lib에 verbatim 벤더링; Codex phase 문서는 install-anchored `./.codex/skills/agent-all/lib/wiki-log.mjs`를 import.
- **비-치명적:** 모든 wiki export가 `{ ok, ... }`를 반환하고 절대 throw 안 함; wiki 실패는 warn 후 계속 — agent-all 실행을 절대 중단 안 함. 페이지 *내용*은 오케스트레이터(LLM)가 작성; 파일/인덱스/감사 메커니즘만 코드.
- **새 config:** `wiki.auto`(기본 `true`)를 config-loader DEFAULTS + 양 config 템플릿에 추가, boolean 검증. 새 `--no-wiki` 플래그는 Phase 0에서 1회 정규화.

Suite: 2278/2278 통과 (v0.7.3 대비 +20: wiki-log 라이프사이클, config wiki.auto, CC+Codex+prose phase-doc 계약).

## Agent-skill v0.7.3 — 2026-06-22

### Wiki 발견 가능성 + 적대 게이트 하드닝

후속 적대적 검증 라운드(독립 opus 심사자가 *리터럴* 운영자 명령을 실행 + 스위트를 mutation-testing)에서 v0.7.2의 llm-wiki·적대 게이트·메모리/체크포인트가 **런타임에서 진짜로 동작함**을 확인했습니다 — wiki `compile`/`status`/`list`/digest가 live 실행되고, 게이트는 실제 failed 판정에 exit 2로 차단하며, 손상된 `LATEST` 체크포인트는 wave 이력에서 복구됩니다. 검증은 **critical 결함 1건 — 문서화** 와 minor 견고성 gap 2건을 드러냈고, 이번 릴리스에서 닫습니다. (보고된 발견 1건 "`sync-lib --check`가 `wiki-index.mjs`를 커버하지 않음"은 검증 false positive였습니다: `collectDrift()`와 `totalChecked()`가 이미 Codex `wiki-index.mjs` 사본을 감시하므로 — `scripts/sync-lib.mjs`를 읽어 반증, 변경 없음.)

- **`/wiki`가 이제 모든 사용자 대면 surface에서 발견 가능 (critical 문서 수정):** v0.7.0–v0.7.2에 스킬은 출하됐지만 README·README.ko·USER_MANUAL(+ko)·USAGE(+ko)·`marketplace.json` 양쪽 중 **0곳**에 등장 — README를 읽는 신규 사용자는 존재 자체를 알 수 없었습니다(README slash-command 목록에서 빠진 유일한 harness-floor 스킬). 두 README에 `/wiki` 퀵레퍼런스 라인·`### /wiki` 섹션·Floor 테마 항목을, 두 USAGE cookbook에 `/wiki` 레시피를, 두 USER_MANUAL에 `/wiki` 하위 섹션을, 두 marketplace에 harness-floor / harness-floor-codex 설명 노트를, 릴리스 사용설명서 생성기에 `/wiki` 행을 추가했습니다. 각 문서는 Copilot/Gemini/Cursor를 prose-only(실행 가능한 `/wiki` 없음)로 정직하게 라벨링합니다.
- **`wiki-index.mjs route`가 구성 가능한 wiki 루트를 존중 (일관성 수정):** `route`는 `parseIndex(WIKI_DIR_DEFAULT)`를 하드코딩해 디렉터리를 조용히 무시하고 항상 cwd의 `.wiki`를 읽었습니다 — `[dir]`를 받는 `compile`/`status`/`list`와의 비대칭. 이제 `route`는 `WIKI_DIR` 환경변수에서 wiki 루트를 해석하며(인자가 다단어 질의라 positional dir 자리가 없음), 헤더와 `SKILL.md`에 문서화했습니다. cwd를 `/tmp`로 강제해 매칭이 오직 `WIKI_DIR`에서만 오도록 하는 새 `wiki-cli` 테스트로 커버.
- **적대 게이트가 대소문자/토큰 순서에 fail-open하지 않음 (`adversarialAuditBlocks` 하드닝):** 대문자 `VERIFICATION_AUDIT: FAILED`가 `verdict=absent`(exit 0, fail-open)로 파싱되고, 진짜 `failed` 앞의 stray `passed` 토큰이 first-match로 이겼습니다. 이제 함수는 **모든** 판정 occurrence를 대소문자 무시로 스캔하고 **하나라도 `failed`면 차단**(fail-safe)합니다. 게이트 전용 `adversarialAuditBlocks`에 격리(다른 validator가 의존하는 공유 `auditTokenPattern`은 미변경)했고, codex/copilot/cursor에 byte-identical 재벤더링, `gate-check.test.mjs`에서 subprocess 레벨로 검증.

Suite: 2258/2258 통과.

## Agent-skill v0.7.2 — 2026-06-22

### 적대적 검증 리메디에이션 (verify→fix→re-verify 3라운드)

독립 opus 검증자가 *패러프레이즈가 아닌 리터럴 운영자 명령*을 직접 실행하는 다중 라운드 적대 리뷰로, v0.7.1이 unit-test-green이지만 포트별 실제 런타임 결함을 안고 있음을 발견했습니다. 아래 모든 수정은 운영자가 내보내는 정확한 명령/입력을 재실행해 검증했습니다.

- **설치-앵커 phase-doc import (ERR_MODULE_NOT_FOUND 수정, repo-wide):** phase-doc lib import가 bare `./lib/...`라 mandated repo-root cwd에서 `<repo-root>/lib/...`로 해석되어 실제 설치에서 크래시했습니다. install-to-subdir 스킬 전체 — `agent-all-{codex,copilot,cursor}`, `visual-qa-codex`, `debug-codex` — 의 import를 설치 경로로 앵커(예: `./.codex/skills/agent-all/lib/...`)했습니다. 새 `INSTALL_ANCHOR_SCAN` 가드가 (port, skill)별 리터럴 import 문자열을 단언해 클래스를 repo-wide로 닫습니다. (in-place Claude 포트는 `./lib/` 정당; Gemini는 프로젝트 lib 미설치라 reference-logic으로 문서화.)
- **적대 게이트는 결정론적 exit-coded 결정 (C2/C4 정직성):** `adversarialAuditBlocks()`에 런타임 호출자가 없어 차단이 산문이었습니다. `lib/policy/gate-check.mjs`(`adversarialAuditBlocks` 호출, **`VERIFICATION_AUDIT: failed`에 exit 2**, 그 외 0)를 추가해 codex/copilot/cursor에 벤더하고 4포트 Phase-4 게이트에 `printf '%s' "$ADV_AUDIT_TEXT" | node <path>/gate-check.mjs`로 배선했습니다. 차단 *결정*은 이제 코드(exit-coded)이며, SKILL.md는 *호출*이 여전히 오케스트레이터-발행임을 정직하게 명시합니다. doc-contract 테스트가 포트별 리터럴 명령(설치 시뮬레이션)을 실행해 exit 2를 단언합니다.
- **`quality-debt-reviewer`가 모든 포트에서 웨이브를 게이트:** Cursor/Codex가 dispatch는 했으나 verdict를 Phase-4 통과조건에서 누락(정보용)했습니다. 모든 포트에서 quality debt가 차단되도록 binding 조건을 추가했습니다.
- **Gemini 정직한 다운그레이드:** Gemini가 `adversarialVerify`(발화 안 됨)와 실행 불가한 `/agent-handoff` + `--resume`를 광고했습니다. config 템플릿에 `adversarialVerify:false`(기본 gate plan이 더 이상 adversarial dispatch 미생성), phase 문서를 lib 스니펫=reference logic으로 정합화(gemini-init은 프로젝트 lib 미복사), SKILL.md에 `/agent-handoff` 미번들 명시.
- **Wiki compile 게이트의 vacuous pass 제거:** `compile`이 없는 dir, 누락/디렉터리인 `INDEX.md`, malformed-grade 행, 파싱 불가 링크 행, `<3`-컬럼 페이지 행, 비-첫-컬럼 페이지 선언에 대해 `ok ... diff=0`을 보고했습니다. 파서가 이제 모든 셀을 스캔해 page-선언이지만 malformed인 행을 기록하고, `compileSelfAudit`이 누락/비정규 `INDEX.md`에 실패(`statSync().isFile()`)합니다 — 진짜 빈-유효 위키는 여전히 통과.
- **원자적 체크포인트 쓰기 + 크래시 복구:** `memory-bridge` `write()`가 임시 파일에 쓰고 `renameSync`(POSIX 원자적)하여 크래시가 `checkpoint/LATEST`를 truncate하지 않게 했고, `recallLatestCheckpoint`가 `LATEST` 누락/손상 시 최신 per-wave 체크포인트로 폴백합니다.

Suite: 2246/2246 통과.

## Agent-skill v0.7.1 — 2026-06-22

### v0.7.0 실제로 동작하게 만들기 (기능 수정)

강력한 기능 adversarial 검토 결과, v0.7.0은 단위 테스트 기준으로는 green이었지만 실제 설치 시 사실상 동작하지 않았습니다. 모든 포트(Claude Code, Codex, Copilot, Cursor, Gemini)에서 수정 완료:

- **Adversarial 검증기 DEFAULT-ON:** `adversarialVerify`가 기본값 `false`이고 발견 불가능한 상태였습니다 — 실제 에이전트가 한 번도 호출하지 않았습니다. 기본값을 `true`로 전환, config 템플릿·config-loader·SKILL 엔트리포인트에 노출하여 모든 agent-all 실행 시 기본으로 트리거됩니다.
- **실제 블록 강제 적용 (Phase-4 4b 머신 게이트):** wave-block이 강제력 없는 산문(prose)이었습니다. `adversarialAuditBlocks()`가 이제 Phase-4 step 4b의 필수 머신 게이트로 배선된 실제 실행 가능한 함수로, 블록을 조용히 우회할 수 없습니다.
- **실행 가능한 메모리 스니펫:** `storeRepoMemory` / `recallRepoMemory`가 실제 실행 시 `node:path`의 `join` import 누락과 오래된 크로스 플러그인 브릿지 import로 인해 크래시했습니다. 두 import 모두 수정; 메모리 flush/recall이 이제 end-to-end로 동작합니다.
- **인스톨러 lib 복사 (ERR_MODULE_NOT_FOUND 수정):** Codex, Copilot, Cursor 인스톨러가 phase docs가 런타임에 import하는 `lib/` 트리를 재귀적으로 복사하지 않았습니다. 세 인스톨러 모두 전체 lib 서브트리를 복사하여 실제 설치 시 `ERR_MODULE_NOT_FOUND`가 해결되었습니다.
- **실제 /wiki CLI 엔트리포인트:** `/wiki`에 실행 가능한 CLI 엔트리가 없었습니다. 실제 엔트리포인트가 이제 배선되었습니다.
- **기능 테스트 커버리지:** install-coverage, default-adversarial, block-enforcement 기능 테스트 추가. 포트별 실제 install-and-run 프로브로 독립 재검증 완료.

### Cursor 지원 (G13)

- **Cursor 포트 smartness:** adversarial 검증기(DEFAULT-ON), 메모리/체크포인트 통합, prose wiki를 Cursor agent-all 포트로 이식했습니다. 이제 Cursor는 Claude Code, Codex, Copilot, Gemini 포트와 이 기능들에서 완전한 동등성을 갖습니다.

Suite: 2205/2205 통과.

## Agent-skill v0.7.0 — 2026-06-21

### 더 스마트해진 agent-all

- **독립적 adversarial 검증기 (G1):** `adversarialVerify({diff, acceptanceCriteria, breakCondition, cwd})`는 `runVerificationAdapterSpec`을 통해 `breakCondition`을 실행하는 방식으로 판정을 재도출합니다 — 구현자 자기보고(self-report)가 시그니처에 포함되지 않습니다. `VERIFICATION_AUDIT: passed/failed` 감사 문자열과 함께 `verification-evidence/v1`을 발행합니다. `toString()` 구조적 서명 가드가 구조적 독립성이 단일 편집으로 조용히 제거되지 않도록 보장합니다. 실제 `defaultCommandRunner` 통합 테스트 포함.
- **Phase-4 게이트 배선 수정 (G2 + 최종 검토):** Phase-4 adversarial 단계가 저수준 `runVerificationAdapterSpec()`이 아닌 정식 `adversarialVerify()` 래퍼를 직접 호출하도록 배선하여 구조적 독립성 가드에 실제 프로덕션 호출자가 생겼습니다. 새 `phase-gate-contract` 테스트가 이 배선을 고정합니다. `adversarialVerify:false` 기본값으로 기존 호출자는 그린 유지; gate-plan 테스트 +3개 (curated smoke 498→501).
- **No-git 파일+JSONL 메모리 에이전트 (G3):** Layer 1은 Copilot의 `makeFileMirror`/`storeRepoMemory`/`recallRepoMemory`를 `.agent-skill/memory/`에서 자유형식 스크래치패드 필드와 함께 재사용합니다. Layer 2는 `memory-log/v1` 스키마로 `.agent-skill/runs/<runId>/memory-log.jsonl`에 추가합니다. git 작업 없음. G4 재사용을 위해 `sanitizeRunId` + `memoryLogPath`를 익스포트합니다. 컨텍스트 리셋 테스트는 어댑터를 null로 만들어 회상이 디스크에서 읽힘을 증명합니다.
- **자동 플러시 체크포인트와 mid-3a 컨텍스트 생존 (G4):** 캡처가 `3a.0`(디스패치 전)으로 이동하여 스코핑 중 종료도 커버합니다. `flushCheckpoint`는 고정 키 `checkpoint/LATEST` 포인터와 이력 키를 기록하여 종료 후 세션이 `recallLatestCheckpoint`를 통해 wave/iter 좌표 손실 없이 복구됩니다. Phase-0 5b 단계가 디스크에서 `state.resumeCheckpoint`를 재구성하고, Phase 3이 `miniPlans`의 `3a`부터 죽은 wave를 재진입합니다. 진짜 end-to-end 라운드트립 테스트 + no-op 플러시 teeth 검사 포함.
- **합성 증명 + 라이브 실행 runbook (G5):** `adversarial-verifier-isolation.test.mjs`가 G1(정확한 감사 리터럴로 block/pass)과 G4(mid-3a 체크포인트가 디스크에서 라운드트립; no-fileMirror → `ok:false`)의 합성을 삭제된 픽스처 의존성 없이 end-to-end로 증명합니다. `g5-live-proof-checklist.md`는 사용자 주도 라이브 `/agent-all` 증명을 위한 운영자 runbook입니다. 메모리 에이전트 컨텍스트 리셋 테스트가 fresh-mirror + rm-mirror 디스크 회상 증명으로 강화되었습니다.
- **Codex 포트 (G6):** `adversarial-verifier.mjs`, `memory-bridge.mjs`, `memory-agent.mjs`(Codex 로컬 import 재작성 포함)를 `sync-lib`을 통해 `harness-floor-codex`에 벤더링합니다. Codex `4-gate.md` Step 3-adversarial이 `adversarialVerify` 래퍼를 호출합니다(Codex 순차 관용구; 원시 `runVerificationAdapterSpec` 우회 금지). `3a.0` 체크포인트 + Phase-0 재개가 Codex 로컬 메모리 에이전트에 배선됩니다. Codex용 `port-ssot E5` 스킵 해제. 실제 자식 프로세스 adversarial + 체크포인트 테스트.
- **Copilot 포트 (G7):** Codex 셸 관용구가 아닌 Copilot 태스크 프리미티브를 사용하여 검증된 G6 포트를 미러링합니다. Copilot `4-gate.md` Step 3-adversarial이 `adversarialVerify` 래퍼(opus 티어)를 호출합니다. `memory-agent.mjs`가 공유 로컬 import 재작성 변환을 통해 벤더링됩니다(중복 함수 없음). `3a.0` 체크포인트 + Phase-0 재개 배선. Copilot용 `port-ssot E5` 스킵 해제(마지막 지연된 스킵). 이제 CC + Codex + Copilot 모두 smartness 적용.
- **CC 플러그인 자체 완결 (최종 검토 수정):** 플래그십 Claude Code 플러그인의 memory-bridge import가 크로스 플러그인 import 없이 자체 완결(self-contained)되도록 재작성되었습니다. `g5-live-proof-checklist.md` Evidence 4가 CC 로컬 memory-bridge를 가리키도록 업데이트되었습니다.

### llm-wiki 스킬

- **CC 네이티브 llm-wiki 스킬 (G8):** Claude Code 스킬(`harness-floor` / `wiki`)로 전체 Karpathy 패턴 위키를 구현했습니다. `routePhaseA`가 exact-slug, title-substring, disambiguation, tag-only, no-match 케이스를 모두 테스트 커버합니다. `SessionStart` 훅이 일일 상태 다이제스트를 발행합니다. `compile` 명령이 자기 감사 게이트를 실행하여 오래되거나 누락된 페이지를 잡습니다. `formatIndexRow` 익스포트 해제(소비자 없음). Curated smoke 501→523.
- **Codex 근-네이티브 llm-wiki 스킬 (G9):** CC 위키를 실제 Codex 스킬(`harness-floor-codex` / `wiki-codex` → `.codex/skills/wiki`)로 미러링합니다. `wiki-index.mjs` 벤더링; 라우트, 페이지 스키마, 온디스크 픽스처 테스트가 CC와 일치합니다. `PreToolUse` 첫 호출 다이제스트(`SessionStart` 훅 미사용). MIT 귀속 표시 보존. Curated smoke 523→532.
- **Copilot + Gemini prose-only 포트 (G10/G11):** `copilot-instructions.md.hbs`와 `GEMINI.md.hbs` 호스트 컨텍스트 템플릿에 위키 prose를 인라인으로 추가했습니다. 커맨드 동사 스펙(write/update/compile/status/list + bare-query Phase A 라우터), 페이지 스키마(BLUF/Details/Provenance/Contradictions/Related; frontmatter title/slug/grade/tags/updated), 세션 시작 status-digest 지시사항, Karpathy LLM-Wiki(MIT) 귀속 표시, 정직한 prose-only / #27 레이블링을 포함합니다. 실행 가능한 surface, hook, 새 플러그인 없음. Doc-surface 계약 테스트: `tests/lib/copilot/wiki-prose-surface.test.mjs`(19개 테스트), `tests/lib/gemini/wiki-prose-surface.test.mjs`(20개 테스트). Curated smoke 532→571.
- **Cursor 제외** — wiki 포트 없음; Cursor MDC surface가 필요한 툴 디스패치 패턴을 지원하지 않습니다.

Suite: 2205/2205 통과; focused release smoke 571/571 통과.

## Agent-skill v0.6.17 — 2026-06-20

- Copilot 포트를 문서화된 hook 계약으로 정정했습니다:
  versioned `{version: 1, hooks: {...}}` JSON, command entry, 실제 Copilot
  tool matcher(`bash`/`powershell`, `view`, `create`/`edit`), 현재
  `subagentStop` identity field(`agentName`, `sessionId`, `transcriptPath`,
  `stopReason`)를 사용합니다.
- 공개 Copilot CLI에 문서화되지 않은 `read_agent` / `list_agents` / memory
  primitive에 의존하던 active Copilot floor 지시를 제거했습니다.
  `/agent-all`, `/visual-qa`, `/thrift`는 file-backed state, prompt-level task
  result, optional lifecycle hook을 정직하게 문서화합니다.
- Gemini CLI 0.47에 맞게 Gemini floor subprocess orchestration을 정정했습니다.
  wrapper는 `gemini -p ... --output-format json --skip-trust`를 호출하고,
  stdout을 task별 result file로 캡처하며, Gemini auth/error JSON envelope를
  실패 task result로 정규화합니다.
- `harness-thrift-copilot`은 기본 file-backed 동작으로 바꾸고, memory mirror는
  공개 Copilot CLI primitive가 아니라 명시적 private host adapter로만 다룹니다.
- Copilot hook schema, Copilot lifecycle payload 정규화, Gemini subprocess
  flag/output capture, Gemini error envelope, cross-platform visual-qa dispatch
  문서에 대한 회귀 테스트를 추가했습니다.
- Suite: 2037/2037 통과; fast release smoke 498/498 통과.

## Agent-skill v0.6.16 — 2026-06-20

- `scripts/install-all.sh`를 강화해 로컬 Claude plugin-manager 설치 시
  `agent-skill` marketplace를 갱신하고 install 뒤 `claude plugin update`를
  실행하도록 했습니다. 이미 설치된 플러그인도 최신 active version으로 전환됩니다.
- 로컬 Claude/Codex/Copilot 설치 검증 중 발견한 install/update 호출 순서 문제에
  대한 회귀 테스트를 추가했습니다.
- Suite: 2026/2026 통과; fast release smoke 498/498 통과.

## Agent-skill v0.6.15 — 2026-06-20

- 숨김 Codex native `.codex-plugin` manifest를 정정해 Codex CLI native 설치가
  오래된 `0.6.13` 대신 현재 릴리스 버전을 표시하도록 했습니다.
- Codex native manifest 버전이 Claude marketplace manifest와 계속 일치하도록
  cross-platform manifest 계약을 추가했습니다.
- Codex native 설치 기준으로 `v0.6.14`를 대체합니다. `v0.6.14` 태그는 advisory
  diagnostics 릴리스로 그대로 유지됩니다.
- Suite: 2025/2025 통과; fast release smoke 497/497 통과.

## Agent-skill v0.6.14 — 2026-06-20

- 배포되는 Claude advisory hook에 fail-open 진단을 추가했습니다. 잘못된 hook
  JSON과 예상치 못한 cache/summary 파일시스템 오류가 silent `catch {}` 뒤에
  사라지지 않고 제한된 `stderr` warning으로 남습니다.
- advisory hook diagnostics guard를 release-smoke에 추가했습니다.
- Suite: 2021/2021 통과; fast release smoke 493/493 통과.

## Agent-skill v0.6.13 — 2026-06-18

- 생성되는 Claude/Codex policy hook을 강화해 잘못된 hook JSON payload가
  조용히 허용되지 않고 fail-closed 되도록 했으며, 해당 policy hook template에
  silent catch가 남지 않도록 release-gated 계약을 추가했습니다.
- Suite: 2011/2011 통과; fast release smoke 483/483 통과.

## Agent-skill v0.6.12 — 2026-06-18

- 배포되는 Copilot floor agent-all runtime adapter의 미해결 TODO 부채를
  제거하고, 해당 runtime 파일이 안정적인 host-adapter shape 문서를 유지하도록
  release-gated 계약을 추가했습니다.
- Suite: 2007/2007 통과; fast release smoke 479/479 통과.

## Agent-skill v0.6.11 — 2026-06-18

- Codex CLI native plugin manager용 `scripts/update-codex-plugins.sh`를
  추가했습니다. marketplace 등록 fallback, 강제 plugin refresh, `codex plugin
  list` 검증을 포함합니다.
- Suite: 2006/2006 통과; fast release smoke 478/478 통과.

## Agent-skill v0.6.10 — 2026-06-18

- Codex CLI 0.140.0의 native `codex plugin marketplace` /
  `codex plugin add` 표면에 맞게 Codex Quickstart와 README 플랫폼 안내를
  정정했습니다.
- Suite: 2003/2003 통과; fast release smoke 475/475 통과.

## Agent-skill v0.6.9 — 2026-06-18

- `agent-skill`을 Gajae-Code, OMO와 비교하고 재사용 가능한 general harness
  blueprint를 설명하는 하네스 포지셔닝 문서를 추가했습니다.
- Claude, Codex, Copilot, Cursor, Gemini, VS Code Copilot용 플랫폼 Quickstart
  문서를 영문/한국어로 추가하고 설치/확인 경로를 정리했습니다.
- Suite: 2003/2003 통과; fast release smoke 475/475 통과.

## Agent-skill v0.6.8 — 2026-06-18

- 플랫폼 포트의 공개 명령어 표면을 canonical 형태로 통일했습니다. Codex,
  Copilot, Cursor, Gemini는 적용 가능한 곳에서 `/agent-init`, `/agent-all`,
  `/visual-qa`, `/thrift`, `/debug`를 노출하고, 플랫폼별 plugin/source
  디렉터리 이름은 내부 구현 식별자로만 유지합니다.
- Codex 설치 renderer, doctor, cleanup 로직, 문서, 템플릿, release guard를
  갱신해 설치된 스킬이 `.codex/skills/agent-all`,
  `.codex/skills/visual-qa`, `.codex/skills/thrift`,
  `.codex/skills/debug` 같은 canonical 경로에 배치되도록 했습니다.
- active docs, 템플릿, skill metadata에 플랫폼 접미사가 붙은 공개 slash
  command가 다시 새지 않도록 command-surface 회귀 테스트를 추가했습니다.
- Suite: 2001/2001 통과; fast release smoke 473/473 통과.

## Agent-skill v0.6.7 — 2026-06-16

- 176개 테스트 파일 전수 무결성 점검: 실제 계약이 깨져도 통과하던 약한 테스트
  50개를 강화 — 비변별 부분문자열 단언을 완전한 success 패턴으로, 존재-여부만
  보던 검사를 parse/byte/동작 단언으로, regex/SUT-동작 단언을 실제(positive +
  negative)로 교체했습니다. 진짜 날조된 Copilot/Gemini CLI-표면 단언은 차단된
  #27/#28 live-CLI spike 대상으로 flag만 남기고 재추측하지 않았습니다.
- #34 잔여 마무리: `.agents/plugins/marketplace.json`을 release-provenance +
  release-audit로 checksum 가드; README에 정직한 플랫폼 degradation 경계 명시
  (/explore=Claude 전용, /debug=Claude+Codex, Cursor/Gemini는 background
  subagent를 프로그램적으로 await 불가); decision-surfacing 설계기록과
  data-runner SKILL을 실제와 일치하도록 정정; 죽은 `redactJsonArtifact` export
  (0 caller)를 security lib + 모든 벤더 복사본에서 제거.
- Suite: 1999/1999 통과; fast release smoke 471/471 통과.

## Agent-skill v0.6.6 — 2026-06-16

- visual-qa 포트: `element-identity.mjs`와 `targets-filter.mjs` leaf lib를 4개
  포트 전부에 벤더링했습니다. 각 포트의 `shallow-clicker.mjs`가 이들을
  import하는데 벤더링되지 않아 모든 visual-qa 포트에서 dangling import
  (ERR_MODULE_NOT_FOUND)였습니다. sync-lib 타깃으로 추가하고, 각 포트의
  shallow-clicker를 import하는 drift-guard 테스트를 더했습니다.
- `vendor-sync` 테스트를 강화: bare "OK" 부분문자열(드리프트 안내 출력에도
  등장) 대신 "OK — N vendored files match source" 계약(N > 0 + 드리프트 없음)을
  명시적으로 검증합니다.
- Suite: 1999/1999 통과; fast release smoke 471/471 통과.

## Agent-skill v0.6.5 — 2026-06-15

- thrift 훅: 나머지 4개 훅 템플릿에 Node 18/20-safe `fileURLToPath(import.meta.url)`
  dirname 패턴을 적용(기존엔 audit 훅만 적용)하고, 설치된 모든 훅이 `./lib/`
  import을 해소하는지 검증하는 spawn 테스트를 추가했습니다.
- Codex 포트 정리: 죽은 `codex agent dispatch`/`wait` 래퍼 4개를 제거했습니다
  (Codex 0.139.0엔 `agent` 서브커맨드가 없고 실제 경로는 순차 `codex exec`) —
  관련 테스트와 doc-contract 항목도 함께 제거.
- thrift-codex Phase-0 훅 게이트: 검증된 Codex 0.139.0 동작에 맞게 재작성 —
  실제 `[hooks]` 지원(버전 + `--dangerously-bypass-hook-trust` 능력)을 probe하고,
  미지원 시 hard-abort(append-only patcher는 나중에 실패할 수 없음), hook-TRUST
  안내 추가(untrusted 훅은 silently inert; 도구가 bypass 플래그를 자동 사용하지
  않음), 거짓 "Phase 2가 reject한다" 주장 제거.
- thrift coercion telemetry: PostToolUse `coercion-outcome` 상관 훅을 추가해
  `coercionAcceptRate`가 실제 수락을 반영(구조적으로 0% 고정이었음) —
  read-coerce 제안이 target을 담고, 이후 그 target에 대한
  `ctx_execute`/`ctx_execute_file`가 accepted로 표시합니다.
- Suite: 1991/1991 통과; fast release smoke 471/471 통과.

## Agent-skill v0.6.4 — 2026-06-15

- 4개 포트(codex/copilot/cursor/gemini)가 조용히 떨궜던 agent-all SSOT
  파이프라인 계약을 복원했습니다: orchestrator-routing seam(evidence-producing
  작업은 code-shipping 파이프라인이 아니라 플랫폼의 fan-out으로 라우팅),
  audit-token 게이트(모든 reviewer/coordinator/qa dispatch가 `*_AUDIT` 토큰을
  emit해야만 wave 통과), orchestrator-owned commit(서브에이전트 self-commit
  금지), Phase-5 `validateTaskLedger` 수용 게이트 — 각 플랫폼 dispatch idiom에
  맞게 적응.
- 게이트가 실제로 실행되도록 계약 lib를 sync-lib로 벤더링: `task-ledger.mjs`를
  4개 포트 전부, `gate-plan.mjs` + `changed-file-classifier.mjs`를
  copilot/gemini에(cursor는 inline union).
- 포트가 계약점을 다시 떨구면 CI가 잡는 `tests/lib/port-ssot-contract.test.mjs`
  (16개)를 추가 — 수동 포트 충실도가 아니라 기계적으로 강제.
- Suite: 2017/2017 통과; fast release smoke 505/505 통과.

## Agent-skill v0.6.3 — 2026-06-15

- thrift 훅 robustness: cost-estimator가 unknown 모델에서 throw 대신 default
  rate로 fallback하고 `warnings`를 반환합니다(throw가 end-of-session audit를
  조용히 죽였음); SessionEnd audit 훅은 에러를 삼키지 않고 진단을 출력하며,
  `fileURLToPath(import.meta.url)`로 디렉터리를 해석해 Node 18/20 LTS에서도
  sibling-lib import가 동작합니다.
- `/agent-all` Phase 0가 거버넌스 훅 **파일** 존재+실행권한을 검증합니다(설정
  항목만이 아니라); `agent-init` self-update 명령이 `$AGENT_SKILL_REPO`를
  존중해 fork/이관 시 404가 나지 않습니다; `agent-all-codex`의 roster-missing
  복구가 실제 `/codex-init`을 가리킵니다(`--theme` 플래그 없음). agent-init
  papercut 이슈(#33) 종료.
- 소스 체크아웃이 아닌 캐시형 플러그인 레이아웃에서 floor 템플릿 install-aware
  해석 + fail-loud 가드를 검증하는 실설치 통합 테스트를 추가했고,
  `harness-core/lib/security`를 sync-lib drift 대상으로 추가했습니다(미보호이던
  유일한 런타임 소비자).
- 로컬 codex 0.139.0로 Codex가 hook-trust 모델을 지원하고 `agent` 서브커맨드가
  없음을 경험적으로 확인(#31에 기록). Suite: 2001/2001 통과; fast release smoke
  505/505 통과.

## Agent-skill v0.6.2 — 2026-06-15

- 실제(소스 체크아웃이 아닌) 설치 환경에서 문서화된 스킬 경로가 동작하도록
  감사에서 확인된 install-path/안전 결함 5건을 수정했습니다: `/agent-init`은
  harness-floor 설정 템플릿을 설치된 플러그인 경로로 해석하고(`plugin-scan`
  `installPaths` + `resolvePluginRoot`) 빈 `.visual-qa.json` / `.agent-all.json`을
  쓰는 대신 명시적으로 실패합니다; `/thrift` Phase 2는 번들 installer에
  위임하고 훅 lib를 복사합니다(더 이상 silent `ERR_MODULE_NOT_FOUND` 없음);
  `/debug`와 `debug-codex` git-bisect는 run 스크립트를 디스크에 생성합니다;
  `agent-all-cursor`는 dirty 트리에서 `git stash` 대신 abort합니다. thrift 훅
  render+spawn 회귀 가드와 `plugin-scan` install-path 테스트를 추가했습니다.
- 이미지가 포함된 사용자 설명서를 `docs/USER_MANUAL.md`와
  `docs/USER_MANUAL.ko.md`에 추가하고, 릴리즈 매뉴얼 카드/페이지를
  `docs/assets/user-manual/`로 승격했으며, README와 usage 문서에서 초보자
  경로를 바로 연결했습니다.
- 나머지 크로스플랫폼 감사 발견 사항을 추적 이슈(#27–#35, 라벨
  `audit/v0.6.1`)로 등록했습니다. Suite: 1998/1998 통과; fast release smoke
  505/505 통과.

## Agent-skill v0.6.1 patch release — 2026-06-12

- `.thrift.json`이 없는 프로젝트에서 큰 출력 명령이 반복되면 Claude
  context-mode router가 자동으로 `/thrift`를 추천합니다. 훅은 advisory-only
  동작을 유지하며 `.agent-skill/recommendations/` 아래에 durable 추천
  메모를 남깁니다.
- `/agent-all` medium/large wave 기본값에 generic `dev` 역할을 포함해
  기본 dev 작업이 조용히 누락되지 않게 했고, async loop runner용
  `evaluateLoopAsync`를 추가했습니다.
- Codex sequential dispatch prompt에 task 문서 참조를 포함하고, 현재 Codex
  loop 문서에서 지원되지 않는 legacy agent-hook 안내를 제거했습니다.
- Cursor/Copilot/Gemini visual QA comprehensive mode가 `verdict.json`을 통해
  `critical`과 `major` 회귀를 모두 gate하도록 맞췄습니다.
- 공개 예시와 fixture의 사내/로컬 프로젝트명을 generic Enterprise
  Django/Vue 예시로 바꾸고, 로컬 경로나 client name이 없는 한국어 사용자
  매뉴얼을 다시 생성했습니다.

## Agent-skill v0.6.0 release train — 2026-06-12

- Top-level planning docs 추가: `PROJECT_PLAN.md`, `ROADMAP.md`, generated
  `SUPPORT_MATRIX.md`, `docs/architecture/README.md`가 vision, workstream,
  milestone, platform support, active issue taxonomy를 매핑.
- `harness-data` 추가: notebook 실행, SQL 검증, artifact diff, data handoff
  evidence를 위한 `/data-runner` 안내를 제공.
- `verify:notebook-data`와 `verify:sql-db`를 notebook cell error 검사, SQL
  row/schema/null/duplicate/outlier assertion, artifact diff metadata,
  environment/reproducibility evidence, 파괴적 SQL policy 차단,
  `/agent-handoff` data evidence summary까지 확장.
- `/agent-all` non-web loop completion용 verification adapter 추가:
  기존 visual-qa는 `verify:web-ui`로 감싸고, `verify:cli`,
  `verify:api-contract`, `verify:notebook-data`, `verify:sql-db`,
  `verify:batch-job`은 공통 `verification-evidence/v1` 결과 모델로
  `.agent-skill/runs/<run-id>/verification-evidence.jsonl`에 기록.
- `/agent-handoff` 추가: task doc 추출, 안전한 git 상태 수집, sibling
  `.handoff.md`/`.session.md` 생성, machine-readable resume metadata,
  non-TTY 추천 action audit logging, `/agent-all --resume` artifact 자동
  감지를 포함.
- `/agent-all` decision과 `/agent-handoff` resume prompt를 위한 공통
  `agent-interaction/v1` UX plumbing 추가. Claude native `AskUserQuestion`,
  Codex prompt renderer, Copilot/Cursor/Gemini markdown renderer, non-TTY
  recommended-option resolution, high-risk 자동 승인 차단, markdown decision
  review log, `.agent-skill/runs/<run-id>/interactions.jsonl` 기록을 포함.
- 설치 대상이 아닌 `harness-core` capability metadata 추가.
  `AgentCapability` schema validation, Claude/Codex platform adapter renderer,
  generated `SUPPORT_MATRIX.md`, 공유 capability catalog drift test를 포함.
- 공유 Node policy hook engine(`agent-policy-event/v1` →
  `agent-policy-result/v1`) 추가. JSONL audit log, loop policy check,
  verification/reviewer audit 강제, dynamic agent spawn 검증, verification
  adapter lifecycle event, non-TTY decision logging, Claude/Codex hook
  adapter를 포함.
- `/agent-all` cost telemetry(`agent-cost-telemetry/v1`) 추가. 플랫폼이
  보고한 cost 또는 best-effort token/char 추정치를
  `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`에 기록하고
  `state.costTelemetry.summary`에 미러링하며, 예산 80% 경고와 100%
  중단을 공유 policy engine에 연결하고 task ledger/handoff artifact에
  비용 요약을 노출.
- #22용 `scripts/skill-eval.mjs`(`agent-skill-eval-report/v1`) 추가. 세 개의
  deterministic benchmark fixture가 baseline과 `agent-all` smoke run을
  비교하고, full mode는 visual QA, quality gate, dynamic orchestration,
  verification-adapter mode까지 확장합니다. 결과는
  `.agent-skill/evals/<date>/`에 pass rate, iteration, intervention 수,
  reviewer/quality debt 신호, rollback 수, token estimate, 공유 cost
  telemetry 기반 cost overhead와 함께 기록됩니다.
- #23용 public GitHub governance 추가: PR smoke/docs/templates workflow,
  issue template, PR template, `.github/labels.yml`, governance 문서,
  `scripts/github-governance-check.mjs`,
  `scripts/docs-structure-check.mjs`를 추가. 공개 CI는 빠른 smoke,
  manifest/marketplace consistency, docs structure, template drift,
  vendored-lib sync, support matrix drift를 검증하고 local release gate는
  authoritative 상태로 유지.
- #24용 supply-chain provenance 추가:
  `scripts/release-provenance.mjs`가 checkout commit, marketplace checksum,
  plugin별 directory checksum, vendored-lib/template aggregate checksum,
  signed-tag 상태를 담은 `release-manifest.json`과
  `release-manifest.sha256`를 생성합니다. Release audit, release candidate
  evidence, release smoke가 manifest를 검증하고, `install-all.sh`,
  `install-platform.sh`, `update.sh`는 `--verify-checksums` /
  `--verify-provenance --manifest=<path>`로 이를 확인할 수 있습니다.
- #25용 secret/privacy redaction gate 추가. 공유 redaction rule/scanner가
  handoff/session prompt, visual/debug report, verification evidence,
  policy/interaction/spawn log, PR body를 검사합니다. High severity는 기본
  차단, medium severity는 mask되며
  `.agent-skill/runs/<run-id>/redaction-audit.jsonl`에는 원문 없이
  rule/count/severity/action metadata와 path/rule allowlist 계약만 남깁니다.
- `/agent-init`와 `/agent-all`에 Quality Debt Policy gate 추가. 생성된 root
  guidance가 `Quality Debt Policy`를 포함하고, `quality-debt-reviewer`가
  요청되지 않은 fallback, TODO/debt marker, suppression, skipped 또는
  meaningless test, production test/debug path를 감사하며, 공유 policy
  engine이 issue link와 expiry가 있는 task-doc `Quality Debt Exceptions`
  없이는 차단하거나 justification을 요구.
- 상태 기반 dynamic `/agent-all` orchestration 추가. 변경 파일/실패 상태를
  분류해 `requiredAgents`를 계산하고, 반복 failure signature는 구현자 추가
  대신 planner/user decision으로 escalation하며, dynamic spawn은 공유
  policy engine으로 검증하고 `.agent-skill/runs/<run-id>/spawn-log.jsonl`에
  기록.
- `--max-iter=0` 또는 `loop.maxIter: null`로 `/agent-all --loop` 무제한
  반복 모드 추가. 반복 failure signature escalation과 장기 재개용 loop
  state handoff 필드도 포함.
- Deploy branch를 local-only release evidence에서 공개 PR smoke CI + authoritative local release gate로 확장. release-audit는 이제 `tests/manual-checklist.md`의 public PR CI/local release 계약을 검증.
- `.github/workflows/*.yml` 변경을 감지하고 GitHub CLI auth에 `workflow` scope가 없으면 push 전에 실패시키는 no-push branch publishing preflight `scripts/release-publish-preflight.mjs` 추가.
- 실제 대상 프로젝트용 no-write rollout 리허설 `scripts/target-project-smoke.mjs` 추가. Claude/Codex `install-platform.sh --dry-run`과 operational doctor 증거를 묶고, stale scaffold에는 권장 refresh 명령을 출력.
- Claude/Codex harness 요구사항을 authoritative gate에 직접 매핑하는 release-audited User Objective Release Matrix 추가: heavy 기본값 + lite opt-out, 승인된 foundation 자동 갱신, superpowers/context-mode 활성화, persona 세분화, orchestration gate, Enterprise Django/Vue routing, Codex current-CLI parity, doctor/cleanup, HOME config 안전성, deployable release gate 포함.
- clean SHA 증거, 버전/changelog 정렬, live CLI probe 캡처, date-stamped release-candidate tag, rollout/update 경로, 이전 verified tag/SHA rollback을 다루는 release-audited Release Candidate Lifecycle 추가.
- clean SHA 준비 상태, marketplace/manifest 정렬, README/README.ko Versioning 일치, changelog 준비 상태, stale release wording, 권장 date-stamped RC tag 이름, 필수 Claude/Codex gate 명령을 tag claim 전에 검증하는 release-candidate evidence generator `scripts/release-candidate.mjs` 추가.
- `harness-debug-codex` 추가: Codex CLI용 `/debug` 포트. `debug-codex` skill 계약, `run /debug` 공개 진입점, 구조화된 오류 파싱, 가설 상태 유지, superpowers fallback 포함.
- Claude/Codex `/agent-all` Phase 4에 deterministic gate plan 추가: `buildGatePlan`, coordinator-first `orchestrator` dispatch, `ORCHESTRATION_AUDIT`, release-audited Codex mirror parity 포함.
- Claude/Codex orchestrator persona에 role gate matrix를 직접 포함해, 루트 메모리에만 기대지 않고 dispatch 계획과 최종 handoff 양쪽에서 필수 reviewer gate를 선택하도록 강화.
- classifier gate reason과 dispatch별 pass criteria를 Claude/Codex Phase 4 문서 및 Codex sequential review prompt에 연결하고, coordinator gate의 `ORCHESTRATION_AUDIT` 출력 계약을 명시적으로 고정.
- 터미널 Claude project bootstrap 경로에 release fixture coverage를 추가해 `install-platform.sh --platform=claude`가 operational 및 `--lite` scaffold를 만들고 post-install doctor를 실행하며 HOME을 패치하지 않음을 증명.
- Codex release fixture를 강화해 operational/default-heavy와 `--lite` 설치가 post-install doctor 실행 및 성공을 직접 증명하도록 하고, 해당 smoke 계약을 release audit에도 고정.
- Codex `install-platform.sh --theme=builder|floor|thrift` release fixture coverage 추가: 각 단일 theme 설치가 예상 project-local 산출물만 쓰고 global Codex config를 건드리지 않으며, floor sequential helper/runtime 및 thrift no-instrument 증거를 보존함을 증명.
- Claude/Codex install→uninstall release fixture 추가: `install-platform.sh --uninstall`이 dry-run에서는 변경하지 않고, 실제 실행에서는 root guidance, Codex debug evidence, global config를 보존하면서 생성된 project-local agent/skill/hook/config를 제거함을 증명.
- 무거운 Claude/Codex 운영 scaffold에 stack-specific 구현 persona를 승격: 기본 프로젝트 설치가 `frontend-dev`, `backend-dev`를 포함하고, Codex sequential dispatch가 `.codex/skills/<role>/SKILL.md`로 직접 타겟팅할 수 있으며, root/orchestrator guidance가 implementation routing matrix를 포함하도록 doctor와 release fixture로 고정.
- Fresh Claude/Codex 설치가 implementation routing matrix를 root/orchestrator guidance에 렌더링하고 실제 `frontend-dev`/`backend-dev` persona 본문을 포함함을 release fixture가 증명하도록 강화했으며, 이 fixture 계약을 release audit에도 고정.
- Codex operational release fixture를 확장해 sequential `agent-all-codex` dispatch가 설치된 `frontend-dev`/`backend-dev` role skill을 읽어 prompt에 inline해야 통과하도록 하고, Claude 터미널 설치 fixture도 root guidance뿐 아니라 orchestrator 및 stack-specific persona 본문을 검증하도록 강화.
- `scripts/release-smoke.sh` 자체를 Claude/Codex release readiness audit에 추가해, 최종 gate 계약이 live CLI probe, fresh fixture, marketplace dry-run, focused release contract, vendored-lib sync, full-suite mode 연결을 release claim 전에 증명하도록 고정.
- public CLI script의 shebang 및 executable bit를 release-audit packaging coverage로 추가하고, 직접 실행 가능한 release gate script까지 포함.
- 생성되는 Claude/Codex hook 및 task-ledger checker script가 존재하는 프로필에서는 executable bit와 함께 쓰도록 하고, fresh install release fixture가 shebang/mode packaging을 증명하도록 강화.
- Codex 기본 reviewer와 전문 reviewer persona에 Phase 4 `VERIFICATION_AUDIT` 출력 계약을 명시하고, fresh operational/builder 설치의 release fixture/audit가 해당 token surface를 증명하도록 강화.
- Claude QA, 기본 reviewer, 전문 reviewer persona도 Codex와 같은 Phase 4 machine-token 출력 계약을 release fixture와 release audit에서 증명하도록 강화.
- Claude 터미널 `install-platform.sh --theme=builder`가 이제 진짜 builder-only heavy scaffold를 설치하고, floor config를 생략하며, builder-profile doctor를 실행하도록 고정. release fixture도 이를 증명.
- Codex builder/lite 루트 `AGENTS.md`가 이제 floor가 설치된 경우에만 `.agent-all.json` language 정렬을 안내하도록 변경. builder-only 설치가 없는 floor config를 암시하지 않도록 release fixture와 release audit에서 고정.
- Codex debug 포트를 마켓플레이스, Codex 설치 그룹, `install-platform.sh --platform=codex --theme=all|debug`, post-install doctor, release fixture smoke, release audit, release smoke, 공개 검증 문서에 등록. 현재 suite: 1991/1991 통과; fast release smoke: 504/504 통과.
- Claude/Codex 터미널 operational bootstrap이 `claude` 사용 가능 시 승인된 foundation(`superpowers`, `context-mode`)만 자동 갱신하도록 변경. `--update-foundations` strict 모드와 `--no-update-foundations` opt-out 포함.
- 기본 foundation auto-refresh에서 승인된 갱신이 실패해도 Claude/Codex bootstrap은 degraded foundation mode로 계속 진행하도록 강화. strict 실패는 `--update-foundations`에서만 유지.
- `/agent-init` 기본값을 운영형/무거운 scaffold로 변경하고, 최소 경로는 `/agent-init --lite`로 제공.
- task ledger 스캐폴딩, sentinel 병합 정책, Claude hard policy 산출물, Codex command-policy 산출물, Gemini soft rules, 변경 파일 기반 reviewer classifier 추가.
- superpowers와 context-mode를 위한 foundation 감지/업데이트 가이드 추가.
- 현재 Codex command-hook schema와 프롬프트/순차 Codex floor 워크플로에 맞게 릴리즈 문서 갱신.

## Visual-QA runtime wiring + agent-init i18n — 2026-05-22  (`harness-floor` v0.5.1)

### 수정 — visual-qa v0.4.0의 wiring 실제로 작동

v0.4.0이 세 lib (`element-identity`, `targets-filter`, `report-html`) + phase-doc 업데이트는 했지만 기존 `shallow-clicker.mjs` / `config-loader.mjs` / `report.md.hbs`는 그것들을 USE 하도록 수정하지 않았음. `/visual-qa` 명령은 `.visual-qa.json`의 v0.4 키를 무시하고 legacy 단일 스크린샷 흐름 그대로 돌아갔음. 이 patch가 그 gap을 닫음.

- `shallow-clicker.mjs`가 `options.capturePairs` (element당 before/after 2장) + `options.targets` (`resolveTarget` + `parseAction` 경유) 지원. `descriptorFor` 훅 있으면 capture에 `elementId`, `confidence` (`explicit | semantic | path`), `action` 포함.
- visual-qa `config-loader.mjs`에 `applyV04Defaults()` — `comprehensive.{targets,pairs,matching}` + `report.{html,mdSideBySide}` 디폴트 자동 머지. callers가 null check 불필요. `.visual-qa.json`에 falsy 값 주면 opt-out.
- `templates/report.md.hbs`에 조건부 pair table — `screenshots.before` 있으면 2-column `Before / After` (있으면 `Baseline / Current`도). pairs 없으면 기존 단일 이미지 레이아웃 fallback.
- Vendored copies (`shallow-clicker.mjs` × 4 platforms; `config-loader.mjs` × 2) sync 완료. `report.md.hbs × with-issues` 스냅샷 재생성.

### 추가 — `/agent-init` 대화 언어 자동 감지

`/agent-init`이 영문 전용이었음 — `superpowers:brainstorming`이 영문이라서, 한국어 dev 머신이어도 사용자가 처음 한국어 안 치면 영문 대화로 시작됨.

- 새 `--lang=ko|en` 플래그.
- 새 `$AGENT_INIT_LANG` env 변수.
- 자동 감지: `$LANG` / `$LC_ALL` / `$LC_MESSAGES` 한국어 로케일 → `ko`, 아니면 `en`.
- Phase 1이 `interactionLang === "ko"`일 때 brainstorming dispatch에 한국어 directive prepend, 그리고 downstream agent template들에 `{{interactionLang}}` 로 stash.
- 기계 contract 토큰 (`STATUS:`, `VERIFICATION_AUDIT:`, 파일 경로, JSON 키)은 대화 언어와 무관하게 영문 고정.

### 테스트

전체 **1334 → 1340 통과** (+6: shallow-clicker pair mode, targets filter integration, identity hook). `report.md.hbs` 스냅샷 재생성. Cross-platform vendored-lib byte-equality 테스트 통과.

## QA 팀 vs Verification 팀 — 2026-05-22  (`harness-floor` v0.5.0)

기존에 harness가 "reviewer"로 묶어놨던 두 가지 review 관점을 명시적으로 분리.

### 추가

- **QA 팀 페르소나 (`qa.md`)**가 이제 명시적으로 **사용자 측면** 감사. `{{persona}}`를 사용자로 다룸. 결과: acceptance 시나리오 + defect 리포트. Audit 토큰: `QA_AUDIT: passed | failed | skipped`.
- **Verification 팀** (`tester.md` + `reviewer.md`)이 이제 명시적으로 **기술 스택 / spec 준수** 감사. Audit 토큰: `VERIFICATION_AUDIT` (기존).
- **`floor-policy` hook이 QA dispatch 처리.** Description prefix `QA Review Task <N>: <title>`이면 사용자 측면 directive (en/ko 둘 다 동봉) + PostToolUse에서 `QA_AUDIT` 토큰 검증. 기존 `Review Task` prefix는 그대로 Verification directive로 라우팅 — backward compatible.
- **`.agent-all.json` `policy.qaAudit`** 플래그 (기본 `true`) — 사용자 페르소나 없는 프로젝트 (lib, UI 없는 CLI 등)는 opt-out 가능. `false`면 Phase 4 Gate가 QA dispatch 스킵.
- **Phase 4 two-team gate.** 웨이브는 `VERIFICATION_AUDIT ∈ {passed, skipped}` AND `QA_AUDIT ∈ {passed, skipped}`일 때만 pass. 기술 성공 ≠ 사용자 측면 성공: 기술 감사 통과 + QA 감사 실패 → 웨이브 fail, QA defect 리포트가 다음 iteration plan의 입력이 됨.

### 새 lib

- `lib/policy/qa-audit-validator.mjs` — `reviewer-audit-validator`와 parallel. 같은 `{ ok, reason }` 모양.

### 페르소나 템플릿 업데이트

- `agents/qa.md.hbs` — 헤더가 "QA team (user-side)"로 재작성 + audit token 섹션.
- `agents/tester.md.hbs` — 헤더가 "Verification team (tech-stack side)"로 재작성 + audit token 섹션.
- `agents/reviewer.md.hbs` — 헤더가 "Verification team (spec / quality side)"로 재작성 + audit token 섹션.

### 테스트

전체 **1322 → 1334 통과** (+12 새: QA validator 6, hook QA 경로 6). 3개 업데이트된 페르소나 템플릿 × 7개 스택 프로파일 = 21개 render-snapshot 재생성.

### 한계

- `qa.md`는 per-persona — `/agent-init`에서 페르소나 미선언 시 `{{persona}}` 미해결 상태; QA dispatch가 "generic end-user perspective" prose로 fallback.
- 토큰은 영문 고정. 한국어 directive는 그 영문 토큰을 그대로 emit 하라고 지시하는 형태.
- QA-only 실패 시 mid-wave 즉시 abort 없음 — Phase 4가 두 reviewer 모두 완료한 뒤 판단. 기존 3회 retry로 보정 루프 커버.
- Conflict resolution은 binary. severity 가중 없음; QA 실패 → wave 실패. 미래에 `qaAuditSeverity: warn | fail` 추가 가능.

## Visual-QA pairs + element-scope + multi-tier matching — 2026-05-22  (`harness-floor` v0.4.0)

`visual-qa`의 3가지 additive 기능. 모든 새 키는 backward-compatible — 기존 `.visual-qa.json` 그대로 동작.

### 추가

- **Before/after 이미지 페어.** 각 추적 element가 `before.png` (action 전) + `after.png` (action 후) 스크린샷을 가짐. baseline이 있으면 `baseline.png` (이전 accepted run의 `after.png` symlink). 새 레이아웃: `docs/visual-qa/<slug>/captures/<page>/<elementId>/{before,after,baseline}.png`.
- **`comprehensive.targets` 블록** — `includeSelectors`, `excludeSelectors`, `actionsPerElement` (selector별 액션 맵). 자동 발견을 element 단위로 제약하거나 보강. Action 문자열: `click`, `fill:<value>`, `blur`, `select:<index|value>`, `hover`. 선언 순서 first-match 우선; `default`는 fallback.
- **Multi-tier element identity.** 기존의 fragile한 `selector + DOM-path` 매칭을 3-tier fallback chain으로 대체:
  1. `data-vqa-id="..."` 명시 attr (rock-solid, instrumented)
  2. 의미 fingerprint — `{role, accessibleName, nearestHeading, textSnippet[:60]}` (wrapper/reorder refactor 견딤)
  3. Path hash (legacy fallback, 기존 baseline 보존)

  각 capture의 `confidence`가 report.md/html에 노출되어 tier-3로 drift하는 게 가시화.
- **`report.html` self-contained viewer.** Inline CSS + JS, 외부 자산 0. element별 카드에 before/after 썸네일, 클릭하면 fullscreen lightbox, 화살표로 `before` / `after` / `baseline` 토글. `report.html`로 끄기 가능 (기본 `true`).
- **`report.md` 2-column pair table.** 각 verdict 아래에 `Before / After` 표 인라인. baseline 있으면 `Baseline / Current` 행 추가. `report.mdSideBySide`로 끄기 가능 (기본 `true`).

### 새 lib

- `lib/element-identity.mjs` — `computeElementIdentity(descriptor)`, `matchBaseline()`, `implicitRole()`.
- `lib/targets-filter.mjs` — `resolveTarget()`, `parseAction()`.
- `lib/report-html.mjs` — `renderHtml(reportData)`. XSS 방어 entity-encoding 포함.

### 테스트

Suite **1292 → 1322 통과** (+30: element-identity 10, targets-filter 10, report-html 10).

### 알려진 한계

- 의미 fingerprint는 동일 라벨/heading 조합("Save" 버튼 여러 개)에서 충돌 — 중요한 element에 `data-vqa-id` 권장.
- v1 액션은 single-step만. Multi-step 시나리오는 미래 `scenarios` 필드로 deferred.
- `report.html`의 fullscreen API는 Safari ≥ 16 / Chrome ≥ 71 필요 — 미지원 브라우저는 non-modal full-page fallback.
- Storage ~2× 증가 (before + after). `comprehensive.cache.gitDiffScope`가 변경 없는 page는 skip하므로 배율은 활성 페이지에만 적용.
- Baseline symlink는 Windows / non-symlink 파일시스템에서 copy로 fallback.

## `update.sh`가 마켓플레이스 캐시 refresh — 2026-05-22  (`harness-floor` v0.3.3)

### 수정

- **`update.sh`가 이제 재설치 전에 `claude plugin marketplace update agent-skill`을 호출.** 이 단계가 없으면 `uninstall + install`이 stale 마켓플레이스 캐시를 그대로 사용해 같은 commit을 재설치. 증상: "successfully installed"라고 뜨지만 `gitCommitSha`가 안 옮겨감. 검증: 이 수정 후 `update.sh` 한 번 실행으로 5개 essentials 전부 HEAD merge commit으로 수렴.

## `scripts/update.sh` 수정 — 2026-05-22  (`harness-floor` v0.3.2)

### 수정

- **`scripts/update.sh`가 이제 실제로 새 commit를 가져옴.** 기존엔 script가 `install-all.sh` → `claude plugin install`로 위임했지만, `claude plugin install`은 idempotent — 어떤 버전이든 이미 있으면 skip. 그래서 release 후 `update.sh` 돌려도 "Installed: 5"만 뜨고 실제 갱신 안됨.
- 수정: `update.sh`가 이미 설치된 agent-skill 플러그인을 uninstall 후 재설치. 신규 설치 케이스는 그대로 `install-all.sh`로.

### 검증

- 이 수정 후 `bash scripts/update.sh`를 `main`에서 돌리면 `installed_plugins.json`의 `gitCommitSha`가 최신 commit로 갱신됨. 로컬에서 확인 — `harness-floor` SHA가 `2a27d75` (v0.3.0 merge) → `050100f` (v0.3.1 merge)로 이동.

## Decision-surfacing i18n (en / ko) — 2026-05-22  (`harness-floor` v0.3.1)

### 추가

- **`.agent-all.json` `language` 필드** — `"auto"` (기본), `"en"`, `"ko"`. `auto`는 `$LANG`/`$LC_ALL`/`$LC_MESSAGES`를 읽어서 한국어 로케일이면 `ko`, 아니면 `en`. `config-loader.mjs`에서 `resolveLanguage(value)`로 export.
- **로컬라이즈된 renderer** — `renderToAskUserQuestion(decision, { taskTitle, language })`가 prefix를 언어별로 교체 (`Context:` → `맥락:`, `Reasoning for recommendation:` → `추천 사유:`, `(Recommended)` → `(추천)`). v0.3.1에 `en`/`ko` 동봉; 알 수 없는 언어는 `en`으로 fallback.
- **한국어 scoping-pass addendum** — `lib/decisions/addendum.ko.md`이 영문판과 함께 동봉. `floor-policy-hook.mjs`가 프로젝트의 `.agent-all.json` `language`에 따라 선택 (테스트용 `AGENT_ALL_LANGUAGE` env override 가능).
- **로컬라이즈된 verification + reviewer-audit directive** — 같은 듀얼 버전 패턴; 기계 파싱 토큰 (`STATUS: DONE`, `verification_passed`, `VERIFICATION_AUDIT: passed|failed|skipped`)은 의도적으로 영문 고정.

### 테스트

Suite **1280 → 1292 통과** (+12 새 tests: renderer prefix 테이블, language config 검증, `resolveLanguage` 자동 감지, 언어별 hook addendum 선택).

### 비고

- `language: "auto"` 기본값이 대부분의 한국어 dev 환경에서 자동으로 맞춰짐. 로케일과 상관없이 영문 원할 시 `"en"` 명시.
- 기계 파싱 토큰은 영문 고정 — `VERIFICATION_AUDIT:` 등은 안정적 contract; 한국어 directive 텍스트가 subagent에게 "그 영문 토큰 정확히 emit 하라"고 지시.

## Decision-surfacing + policy-hook 강제 — 2026-05-21

### 추가

- **Decision-surfacing 프로토콜.** `/agent-all` Phase 3가 **3a scoping → 3b ask → 3c implement**로 분리. Implementer subagent가 read-only scoping pass를 거쳐 아키텍처/스펙 모호점 결정들을 JSON payload `{options[2-4], recommended_index, reasoning}`로 반환, main이 `AskUserQuestion`으로 1/2/3 패널 표시 (추천 표시 포함), 답변 baked-in으로 재-dispatch. Non-TTY 모드는 recommended low/medium-risk 선택을 자동 선택하고 `.agent-all-state.json`, `docs/agent-all/iter-<N>/decisions.md`, `.agent-skill/runs/<run-id>/interactions.jsonl`에 로그하며, high-risk 선택은 block.
- **단일 `floor-policy` hook** (PreToolUse + PostToolUse on `Task`) — dispatch 시 scoping addendum + verification directive 자동 inject, 반환 시 `verification_passed` / `VERIFICATION_AUDIT: passed|failed|skipped` 토큰 검증. 단일 파일에 internal router — Task 호출 아니면 오버헤드 거의 없음.
- **`.agent-all.json` `policy` opt-out** — `decisionSurfacing`, `verification`, `reviewerAudit` 플래그 모두 기본 `true`. 기존 deep-merge가 자연스럽게 override 처리하도록 `DEFAULTS`에 추가.
- **플랫폼별 parity** — Cursor (`.cursor/rules/decision-protocol.mdc`, soft), Copilot CLI (`.github/agent-all/decision-protocol.md`, `.github/hooks/`로 hard), Codex (`[[hooks.agent]]` snippet을 stdout으로 — 수동 merge, hard), Gemini (`.gemini/agent-all-decision-protocol.md`, soft), VS Code Copilot (`.github/copilot-instructions.md` 읽음, soft).
- **Spec + plan:** `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`, `docs/superpowers/plans/2026-05-21-decision-surfacing-and-policy-hooks.md`.

### 변경

- Phase 3 dispatch 문서가 3a/3b/3c sub-phase로 재구성 (`plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`).
- README "Main-thread isolation" 표가 새 phase-3 토큰 모양 반영 (3a/3c subagents + 3b sequential ask).
- `.agent-all-state.json` 초기 shape에 `decisions: {}` key 추가 (Phase 3b에서 populating).
- README에 "알려진 한계" 섹션 추가 (English + Korean) — Cursor/Gemini/VS Code soft enforcement, non-TTY auto-pick 주의, description 기반 routing, per-task scoping 비용(~+15-20%) 등.

### 수정

- AskUserQuestion `header` 12-char 제한: `lib/decisions/renderer.mjs`가 `slice(0, 12)`로 truncate. Plan-side 버그를 implementer subagent가 Task 2에서 발견.

### 테스트

전체 suite **1246 → 1279 통과** (+33 새 tests across `decisions/`, `policy/`, scenarios, config-loader policy, regression coverage).

### Plan 일탈

- Task 11은 `loadAgentAllConfig(dir)` 새로 만드는 대신 기존 `loadConfig(path)` API 재사용. 효과 동일, API 중복 없음.
- Task 13 (`sync-lib.mjs`가 `decisions/` + `policy/` libs vendoring) 보류. Soft prompt-only 포트는 vendored runtime libs 불필요; hard-enforce 포트는 canonical hook script 직접 참조.

## README 전반 개선 — 2026-05-19

`--qa` 스토리를 README의 headline으로 만든 정리 패스 (이전엔 bolt-on
섹션처럼 붙어있었음).

- **오프닝 태그라인 + 명령 리스트**가 이제 `/agent-all "..." --loop
  --qa`를 대표 featured 명령으로 리드, 한 줄 요약은 "tests만"이
  아니라 "tests와 UI 둘 다 통과" 약속. `/visual-qa` 설명에
  `declared` vs `comprehensive` 모드 한 문장 추가 (명령 레퍼런스에서
  빠져있었음).
- **Pillar #3 재작성** — "세 조각 조합" (일반적)에서 "한-플래그
  end-to-end 검증" (구체적)으로. 최근 작업의 실제 selling point.
- **새 "자주 쓰는 워크플로" 헤드라인**: "UI 기능을 end-to-end로
  출시 (가장 강력한 플로)" — `npm run dev` + `--loop --qa` 두 줄.
- **Self-sustaining 워크플로 섹션 통합**. "Recipe" 서브섹션을
  "조합 가능한 셋"에 병합 (같은 /thrift + /goal + /agent-all 스니펫
  중복이었음), "Ralph Loop와 차이"를 60% 압축 (substance는 유지),
  중복 "단계별" 산문 제거 (`--qa` walkthrough가 이미 커버).
- **Stale 숫자** 정리: 6곳 1019 → 1246 (badge, status 표, going-deeper,
  contributing 체크리스트).
- **수학 오류 수정**: 설치된 플러그인 체크에서 "4 미만" → "5 미만"
  (권장 세트는 5개: builder + floor + thrift + explore + debug).
- 영어/한국어 README 완전 sync.

순 결과: --qa 스토리 추가에도 불구 712 → 690 줄; 섹션 수는 동일,
중복만 감소. 테스트 1246/1246 유지.

## Loop / visual-qa 보강 + README 명확화 패스 — 2026-05-19

Comprehensive 모드 rollout 문서화 중 발견한 진짜 갭들 마감. 각각이
fresh 프로젝트에서 `/agent-all --loop --qa`가 조용히 오동작할 만한
지점이었음.

### 수정 — Phase 6 visual-qa 호출이 hand-waved였음

Phase 6 문서가 `dispatchVisualQASubagent()` placeholder (실존하지
않음)를 참조하고 있었음. 5 플랫폼 (Claude Code native + cursor /
copilot / codex / gemini) 모두 구체적인 `Task`-tool 호출 패턴으로
교체 — 각 플랫폼의 네이티브 디스패치 프리미티브 (`Task` / cursor
background agent / `task` tool / `agent` hook / `gemini chat`
subprocess)로 명시. 매 iter `--slug=loop-iter-<N> --force` 조합으로
iter들이 서로 안 덮어쓰고 Phase 2의 `priorRunPath` 발견은 이전
iter을 baseline으로 찾도록.

### 수정 — `--qa` autoscaffold가 dev 서버 미체크로 config 작성

"안 도는것 같다"의 가장 흔한 실패 모드: 사용자가 `--loop --qa`
실행 → visual-qa Phase 0가 `baseUrl` health-check 실패 → 이유 불명.
이제 `/agent-all` Phase 0가 config 작성 *전에* `curl --max-time 3`로
autoscaffold의 `baseUrl` probe, 안 닿으면 계속할지 prompt
(`--yes` 모드는 "dev 서버 unreachable" 메시지로 명확히 abort).

### 변경 — `--qa` autoscaffold first-run 정책: `auto-pass` → `report`

미묘한 위험: `auto-pass`는 iter 1이 캡처한 것을 항상 새 baseline으로
씀. iter 1이 깨진 UI 있으면 그게 reference가 됨 — iter 2가 이슈 못
잡음 (baseline과 같으니까). 새 기본 `report`는 iter 1에 여전히 loop
통과 (사용자가 0에서 시작 가능) 하지만 모든 이슈를 report에 enumerate
해서 다음 iter가 fix할 컨텍스트 가짐.

### 추가 — README troubleshooting + `--qa` 단계별 walkthrough

5가지 흔한 실패 모드 (dev server down, Playwright MCP missing, flaky
tests 무한 loop, iter 2 비용 폭주, baseline lock-in, autoscaffold vs
existing config) 모두 "증상 / 원인 / 해결" 테이블에. loop+qa 섹션
재구성: 사전 요구사항 → 단계별 → 플래그 레퍼런스 → troubleshooting.
한국어 README sync. 테스트 뱃지 1019 → 1246.

## Comprehensive visual-qa + `/agent-all --qa` E2E 게이트 — 2026-05-19

### 추가 — `/agent-all "..." --loop --qa` 한-플래그 E2E 검증

`--qa`는 loop 완료를 "tests 통과"가 아닌 진짜 end-to-end 체크로 묶는
새 단축형. 다음으로 확장됨:

```
--break-condition='{"type":"composite","steps":[
  {"type":"test-auto"},
  {"type":"visual-qa","mode":"comprehensive"}
]}'
```

tests 먼저 저렴한 게이트로 실행; visual-qa(comprehensive)가 최종
E2E로 실행. 둘 다 통과해야 loop break. `.visual-qa.json` 없으면 sane
defaults로 자동 생성되어 fresh 프로젝트에서 사전 설정 0으로
`/agent-all "build X" --loop --qa` 가능.

5 플랫폼 parity: Claude Code native + cursor / copilot / codex /
gemini 모두 `--qa` 지원. agent-all Phase 0이 최고 우선순위로
처리 — CLI override보다, 대화형 프롬프트보다, 저장된 config보다 위.

### 추가 — visual-qa comprehensive 모드

`.visual-qa.json`에 `mode` 필드 추가 (기본 `declared`, back-compat).
`comprehensive`로 설정 시 visual-qa가 수동 selector 리스트 요구
중단하고 모든 것을 자동 발견:

- **Crawl** — baseUrl에서 BFS, scope.include / scope.exclude 글롭,
  depth cap, maxPages cap. Same-origin only. (`lib/crawler.mjs`)
- **DOM walk** — 각 crawl된 페이지에서 interactive 요소 발견 —
  button, link, input, select, textarea, [role=tab|menuitem|switch|
  checkbox], [data-testid], [data-qa-id]. 안정적 selector 선호도:
  data-testid > data-qa-id > id > stable CSS path. Class 기반 절대
  안 함 (Tailwind / CSS-in-JS 불안정). (`lib/dom-walker.mjs`)
- **Shallow click** — 각 non-input 요소 클릭. 1-step 결과 상태 캡처
  후 re-navigation으로 revert. Dialog 트리거 클릭 catch; revert 실패
  blocker severity로 escalate. (`lib/shallow-clicker.mjs`)
- **DOM-hash cache** — 정규화된 DOM serialisation + 관련 computed
  style의 SHA-256, 이전 LLM verdict와 키로 매칭. hash 안 변한
  컴포넌트는 LLM 호출 전체 스킵. 30일 TTL eviction.
  (`lib/dom-hash.mjs`)
- **Git-diff scoping** — Framework 자동 감지 (Next App Router /
  Pages / Remix), 변경 파일 → 영향 route 매핑; shared-component
  변경 시 "전체 재실행", docs/tests-only diff 시 "전체 스킵"으로
  fallback. (`lib/git-diff-scoper.mjs`)
- **Verdict** — (page, component, category, message-hash) 키의
  issue set을 baseline(prior accepted run) 대비 diff. 새 critical/
  major (구성 가능) 또는 모든 severity-bump regression 시 loop 실패;
  severity drop은 fix로 카운트. baseline 없는 첫 실행은 auto-pass +
  baseline 작성 default. (`lib/verdict.mjs`)

### 추가 — Phase 문서 업데이트

- Phase 1 (`config`) mode 분기. comprehensive는 crawler → DOM walker
  → git-diff 필터 → matrix.
- Phase 2 (`discover`) comprehensive에서 DOM-hash cache 로드 + evict.
- Phase 3 (`capture`) 매 LLM 호출 전 DOM-hash cache 체크;
  `interactions.click` true 시 shallow-click expander invoke.
- Phase 4 (`aggregate`) verdict 계산, `verdict.json` 작성, DOM-hash
  cache 영구화.
- Phase 5 (`summary`) comprehensive 모드 exit code = `verdict.pass ?
  0 : 1`; declared-mode 의미 그대로.

### 추가 — 6 신규 lib, 4 sibling 플러그인에 byte-identical vendor

Source-of-truth `plugins/harness-floor/skills/visual-qa/lib/`; copies
in cursor/copilot/codex/gemini visual-qa-* skills. Sync test가 drift
잡아냄.

### 테스트

- 38 unit (crawler scope/depth/dedup/glob/error, DOM walker 분류 +
  selector 선호, config mode 분기 + autoscaffold)
- 9 unit (shallow-clicker 정상 경로, skip-by-kind, dialog catch,
  throw 봉쇄, revert escalate)
- 28 unit (DOM-hash 안정성 + I/O + TTL, git-diff framework 자동 감지
  + route 매핑)
- 12 unit (verdict diff 알고리즘 + first-run 정책)
- 27 doc-level (--qa flag 계약 5 플랫폼)
- 13 doc-level (visual-qa comprehensive 모드 언급 5 플랫폼)
- 24 cross-platform sync (6 libs × 4 sibling 플랫폼 byte-identical)
- 4 integration (crawler → walker → clicker → cache → verdict 파이프
  일관 구성)

총 **+155 테스트, 스위트 1091 → 1246 통과.**

### Spec

`docs/superpowers/specs/2026-05-19-visual-qa-comprehensive-design.md`에
브레인스토밍 설계 결정 (discovery 전략, 상호작용 깊이, 비용 전략,
verdict 의미, 스테이징 플랜) 기록.

## `/agent-all --loop` 대화형 break-condition 해석 — 2026-05-19

### 추가 — Phase 0 대화형 프롬프트 + 4가지 break-condition 프리셋

기존엔 `breakCondition`이 `.agent-all.json`의 정적 shell 문자열이었음.
"무엇이 완료인가"라는 가장 유용한 결정이 config 파일 잡일로 전락 —
test 명령, visual QA, composite 게이트 중 in-the-flow로 고를 방법
없었음.

새 동작 (5 플랫폼 — Claude Code native + cursor / copilot / codex /
gemini):

- **Phase 0 break-condition 해석.** `--loop` 설정 시 coordinator가 4
  프리셋 중 선택을 요청:
  - `test-auto` — 스택(npm / pytest / cargo / go / …) 자동 감지 후
    표준 테스트 명령 사용.
  - `visual-qa` — 매 iter `visual-qa` 스킬을 subagent로 디스패치.
    선택적 `spec` 경로 지원.
  - `custom shell` — 자유 형식 한 줄 (기존 동작).
  - `composite` — 위의 sequential AND. 첫 실패 시 short-circuit —
    빠른 lint/type 체크로 느린 visual-qa를 게이팅 가능.
  선택 후 `.agent-all.json`에 저장 여부를 묻습니다.
- **`--break-condition=<spec>` CLI 플래그.** 비대화형 override. JSON
  객체 (예: `'{"type":"visual-qa"}'`) 또는 plain shell 문자열
  (`{"type":"shell","cmd":<문자열>}`로 처리).
- **`--reconfigure` CLI 플래그.** `.agent-all.json`에 이미 non-default
  값이 있어도 대화형 프롬프트 강제.
- **비대화형 fallback.** `--yes`, non-TTY 실행, 또는 이미 커스터마이즈된
  `.agent-all.json`은 기존 config를 조용히 재사용 — CI에서 깜짝
  프롬프트 없음.

### 추가 — `lib/break-resolver.mjs` (source-of-truth)

`plugins/harness-floor/skills/agent-all/lib/`에 새 공유 lib. 4 플랫폼
sibling에 byte-identical로 vendor됨:

- `normalizeBreakCondition(input)` — 문자열 또는 `{type, ...}` 객체
  수용; canonical 정규화 spec 또는 잘못된 경우 `null` 리턴.
- `detectStackTestCommand(cwd)` — 파일 기반 스택 감지 (package.json →
  npm test, pyproject.toml → pytest, Cargo.toml → cargo test, go.mod →
  go test, plus Gemfile / composer.json / pom.xml / build.gradle).
- `buildShellCommand(spec, {cwd})` — shell / test-auto / pure composite
  spec을 단일 실행 가능 shell 한 줄로 해석; visual-qa 스텝이 포함된
  경우 `null` 리턴 (non-shell runner 필요).
- `needsVisualQARunner(spec)` — spec 또는 중첩 스텝이 `visual-qa`이면
  true.
- `isDefaultOrMissing(spec)` — Phase 0이 프롬프트 여부 결정에 사용.
- `PRESET_CATALOGUE` — 4 엔트리 (`test-auto`, `visual-qa`, `custom`,
  `composite`) — 각각 `key`, `label`, `description`, 프롬프트 UI용
  `build(opts)`.

### 추가 — Phase 6 spec routing

`phases/6-loop.md`가 더 이상 `breakCondition`을 shell 문자열로 가정하지
않습니다. iteration 시작 시 spec을 정규화하고 `spec.type`에 따라
라우팅:

- `shell` / `test-auto` / pure `composite` → 단일 shell 한 줄로
  빌드, 플랫폼의 shell 프리미티브(`spawnSync sh -c` / `read_bash` /
  `shell_command` / `run_shell_command`)로 실행.
- `visual-qa` → `visual-qa-<플랫폼>` 스킬을 subagent로 디스패치;
  shell로 실행 안 함. throw된 에러는 exit 1로 처리 — visual-qa는
  명시적으로 success를 리포트해야 함.
- visual-qa 포함 `composite` → 각 스텝 순차 실행, 첫 non-zero exit에
  short-circuit.

`config-loader.mjs` 검증을 양쪽 형태 수용하도록 확장; cursor + copilot
vendored 사본 동기화.

### 추가 — 27 + 45 신규 테스트

- `tests/lib/break-resolver.test.mjs` (27 테스트) — 정규화, 스택 감지,
  shell-command 빌드, composite short-circuit 추론, 프리셋 catalogue
  계약.
- `tests/lib/agent-all-loop-interactive.test.mjs` (45 테스트) — 5
  플랫폼 doc-level 계약: Phase 0이 4 프리셋 + 비대화형 fallback +
  save-confirmation + break-resolver lib 참조 문서화; Phase 6가
  `spec.type`에 라우팅, visual-qa에 subagent 디스패치(`sh -c` 안 함),
  composite short-circuit; SKILL.md가 `--break-condition` +
  `--reconfigure` 문서화.

총 스위트: **1019 → 1091 통과**.

## 검증 안전망 + 배포-등급 README polish — 2026-05-19

### 추가 — `/agent-all --loop` 2-레이어 검증 안전망

이전 루프 의미는 `breakCondition` + `--max-iter` + `--max-cost`에 의존.
implementer subagent가 실제 verify 없이 STATUS: completed라고 주장하면
깨진 코드가 PR로 sneak through 가능했음. Phase 3 + Phase 4 문서에 강제
지시 추가하여 갭 해소:

**Phase 3 (Dispatch) — implementer 지시 (5 플랫폼):**

> 완료 선언 전 `superpowers:verification-before-completion` invoke하여
> 프로젝트의 테스트 명령 실행. verification 실패 시 task 완료 표시
> 안 됨 — 대신 `STATUS: blocked, REASON: verification failed` 리포트.
>
> 새 동작 추가 task (feature 작업, hotfix 아님)는
> `superpowers:test-driven-development` invoke하여 구현 전 테스트 작성.
> 권장이며 strict 강제 아님.

**Phase 4 (Gate) — reviewer 지시 (5 플랫폼):**

> wave diff 평가 시, 각 implementer가 `superpowers:verification-before-completion`
> 실제 실행했고 verification 통과했는지 명시적 확인. 건너뛴/실패한
> 경우 코드 품질 verdict 무관 `critical` 이슈로 escalate — Phase 4에서
> wave 블록.

2-레이어 net: implementer가 verify; reviewer가 verification 실제 일어
났는지 audit. 하드 캡 + breakCondition과 결합 — 긴 무인 `--loop` 실행에서
도 깨진 코드 PR로 sneak in 못 함.

5 플랫폼 phase 문서 갱신:
- `plugins/harness-floor/skills/agent-all/phases/{3-dispatch,4-gate}.md`
- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/phases/{3-dispatch,4-gate}.md`

20개 신규 테스트 (`tests/lib/agent-all-verification-directive.test.mjs`)
가 10개 파일 모두에서 지시 언급 + TDD가 권장이고 강제 아님 flag + 2-레이어
안전망 명명 확인.

### 변경 — README 배포 polish

- **상태 배지** README 헤더에 추가 (tests/plugins/themes/license)
- **신규 "사전 요구사항" 섹션** — Node ≥ 20, git, gh, 마켓플레이스
  지원, 플랫폼별 설치를 위한 타겟 CLI 설치됨. `superpowers` +
  `context-mode`를 강력 권장 peer 플러그인으로 명시.
- **Pillar #2** 확장하여 2-레이어 검증 안전망 언급 (깨진 코드 PR로
  sneak in 못 함).
- **FAQ "/agent-all --loop 안전한가요?"** 모든 4 레이어 (하드 캡,
  breakCondition, implementer 검증, reviewer audit) 명시하도록 재작성.
- **신규 "상태" 테이블** 하단 — 무엇이 검증됐는지 (tests, install
  렌더러, 마켓플레이스, Claude Code skills) vs 라이브 CLI 검증 필요한
  것 vs 연기된 것 (v2 thrift, SDK 연결)의 솔직한 매트릭스.
- **신규 "로드맵" 섹션** — 라이브 런타임 검증, v2 thrift, SDK 연결,
  explore/debug 포트, transcript-listener bridge, telemetry opt-in.
- **신규 "라이선스 & 기여" 푸터** — MIT, PR 컨벤션, 제출 전 체크
  (node --test, sync-lib --check), 저장소 컨벤션 (cross-plugin
  import 금지, sentinel 기반 hook 프로토콜).
- 테스트 카운트 전체에서 981 → 1019 갱신.

### 결과

**1019/1019 tests pass** (+20 verification-directive 테스트).

영문 + 한글 README 동기화. 양쪽 CHANGELOG 동기화.

## 크로스 플랫폼 설치 — 누락 builder 렌더러 + orchestrator — 2026-05-18

### 추가

크로스 플랫폼 설치 갭 해결. 오늘 이전엔 `harness-builder-codex`,
`harness-builder-copilot`, `harness-builder-gemini`가 템플릿 + SKILL.md
가 있었지만 shell-callable 설치 도구가 없었음 — 해당 CLI 사용자는
Claude Code 중재 없이 프로젝트 부트스트랩 불가. README가 존재하지 않는
`gh copilot plugins install ...` 같은 가짜 명령을 문서화하고 있었음.

**새 설치 렌더러** (3개 파일):
- `plugins/harness-builder-codex/bin/init.mjs` — `AGENTS.md` +
  `.codex/skills/{planner,dev,reviewer}/SKILL.md` 작성; `config.toml`
  스니펫 stdout으로 출력 (`~/.codex/config.toml`에 merge).
- `plugins/harness-builder-copilot/bin/init.mjs` — `AGENTS.md` +
  `.github/copilot-instructions.md` +
  `.github/instructions/<role>.instructions.md` + `.github/hooks/*.json`
  (3개 파일) 작성; `mcp-config.json` 스니펫 stdout 출력.
- `plugins/harness-builder-gemini/bin/init.mjs` — `GEMINI.md` +
  `.gemini/skills/{planner,dev,reviewer}/SKILL.md` 작성; `settings.json`
  스니펫 stdout 출력.

모두 `harness-builder-cursor/bin/init.mjs` 패턴 따름: `--ctx <path>`,
`--force`, env-var fallback (`PURPOSE`/`SIZE`/등), `detectProject()`로
스택 자동 감지, `--force` 없이 덮어쓰기 거부.

**새 orchestrator 스크립트** (`scripts/install-platform.sh`):

```bash
./scripts/install-platform.sh --platform=cursor --target=...        # 모든 3 테마
./scripts/install-platform.sh --platform=codex --target=. --theme=floor
./scripts/install-platform.sh --platform=vscode-copilot --target=.  # copilot에 별칭
```

지원 플랫폼: `cursor`, `copilot`, `vscode-copilot`, `codex`, `gemini`.
지원 테마: `all` (기본), `builder`, `floor`, `thrift`. 올바른
`bin/init.mjs` + `bin/install.mjs` 렌더러를 iterate하고 끝에 플랫폼별
"작성된 것" 요약 출력.

### 테스트

- `tests/lib/harness-builder-cli-init.test.mjs` — 18개 테스트 (플러그인
  당 6개 × 3 플러그인): 사용법 에러, 존재 안 하는 target, 전체 설치 +
  config 스니펫 stdout, `--ctx` override, `--force` overwrite, env-var
  flow.
- 전체 suite: **999/999 tests pass** (이전 981, +18).

### README 갱신

- "다른 AI 도구에서 사용" 섹션이 플랫폼별 정확한 원-라이너 설치로
  재작성 (`./scripts/install-platform.sh --platform=...`).
- 가짜 명령 (`gh copilot plugins install`, `codex plugins install`,
  `gemini extensions install`) 제거 + "실행하지 마세요 — 존재 안 함"
  으로 명시.
- 신규 "설치 후 실제로 어떻게 사용하나" 테이블이 플랫폼별 진입점
  커버 (Claude Code 슬래시 명령, Cursor 채팅 호출, Copilot CLI
  `gh copilot suggest`, VS Code Copilot Chat, Codex CLI, Gemini CLI).
- "각 플랫폼이 받는 파일" 테이블이 플랫폼별 정확한 작성 파일 표시 —
  더 이상 추측 없음.

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
- **`/agent-init --theme=floor`가 이제 기본값입니다.** `/agent-init --lite`로 옵트아웃합니다 (`--theme=lite`는 호환 alias로 유지).

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
