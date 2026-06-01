# Decision-Surfacing + Policy-Hook 강제 — 디자인

**날짜:** 2026-05-21
**상태:** Design (plan 대기)
**작성:** sungjun + brainstorming 세션
**범위:** 5개 harness 명령어 (`/agent-all`, `/visual-qa`, `/debug`, `/explore`, `/agent-init`) + 6개 플랫폼 포트 (Claude Code, Cursor, Copilot CLI, VS Code Copilot, Codex CLI, Gemini CLI)

> 영문 원본: [2026-05-21-decision-surfacing-and-policy-hooks-design.md](2026-05-21-decision-surfacing-and-policy-hooks-design.md). 한국어 sibling은 핵심 요약 — 정확한 JSON 스키마, hook routing 의사코드, 30개 limitation 항목 등은 영문판 참조.

## 1. 요약

오늘 `superpowers:subagent-driven-development`로 디스패치되는 subagent들은 아키텍처 및 스펙 해석 결정을 **독립적으로** 내립니다. main thread는 verdict만 봅니다. 컨텍스트 격리는 좋지만 사용자 판단에 눈이 멉니다.

이 디자인은 **decision-surfacing 프로토콜**을 도입합니다: 코드 작성 전 implementer subagent가 **scoping pass**를 수행, 결정 후보들(options + 추천 포함)을 구조화된 payload로 반환, main이 사용자에게 인터랙티브 패널 (Claude Code에서는 `AskUserQuestion`; 다른 플랫폼은 stdin/rule)로 묻기. 답변 baked-in으로 subagent 재-dispatch.

프로토콜은 **단일 hook 쌍** (`PreToolUse` + `PostToolUse` on `Task`)으로 강제 — phase markdown이 실수로 빼먹어도 강제됩니다. 동일 hook 쌍이 현재 prompt-only로 처리되는 두 인접 규칙도 같이 검증: **verification-before-completion**과 **reviewer audit cross-check**.

## 2. 배경

`superpowers:subagent-driven-development`의 `implementer-prompt.md`에는 이미 질문 패턴이 존재합니다 (L21-27, L62-66, L100-112). 4가지 status: `DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`.

빠진 것:
- 패턴이 **opt-in** — implementer가 질문 여부 결정. 대부분 안함.
- 질문이 **자유 형식 prose**, 구조화 없음. main이 1/2/3 표로 렌더할 수 없음.
- batched pre-coding scoping pass 없음 — 질문이 작업 중 ad-hoc 등장.
- non-TTY fallback 없음 — implementer가 그냥 BLOCKED.
- 병렬-wave coordination 없음 — N개 implementer가 N번 독립적으로 질문.

이 디자인은 `superpowers` **포크 없이** 이 gap을 메웁니다. Harness가 dispatch 시점에 hook으로 protocol addendum을 inject하고, main-subagent 사이를 중재하는 router를 추가.

## 3. 디자인 결정 (브레인스토밍 세션 결과)

| 결정 | 선택 | 근거 |
|---|---|---|
| 결정 범위 | 아키텍처 + 스펙 모호점 (~3-8 per task) | signal vs main 컨텍스트 비용 균형 |
| 타이밍 | 코드 전 scoping pass | 예측 가능한 토큰 사용; subagent가 답변과 함께 fresh 재-dispatch |
| 적용 범위 | 5 commands × 6 platforms | 패턴은 foundational; 일관성 우선 |
| Non-TTY 정책 | recommended 자동 선택 + state log | `/agent-all --loop --qa` 야간 워크플로 보존 |
| 병렬 wave routing | Task별 그룹 + 순차 UI | 명확한 ask 컨텍스트, AskUserQuestion 호출당 비용 수용 |
| 추천 출처 | Subagent가 `{options[2-4], recommended_index, reasoning}` 반환 | 단일 round-trip; AskUserQuestion의 "first = Recommended" 관용구 부합 |

## 4. 아키텍처

### 4.1 구성요소 (canonical location)

```
plugins/harness-floor/skills/agent-all/lib/decisions/
  schema.mjs              결정 payload JSON 스키마 + validator
  renderer.mjs            payload → AskUserQuestion (CC) / stdin (다른 CLI)
  non-tty-resolver.mjs    recommended 자동 선택, state log에 append
  addendum.md             Task tool prompt에 inject되는 텍스트

plugins/harness-floor/skills/agent-all/lib/policy/
  verification-validator.mjs    PostToolUse: STATUS=DONE → verify log 있나?
  reviewer-audit-validator.mjs  PostToolUse: reviewer → 'VERIFICATION_AUDIT: ...' 있나?

plugins/harness-floor/bin/
  floor-policy-hook.mjs    PreToolUse + PostToolUse internal router 한 파일
  install-floor-policy.mjs  settings.local.json에 install/uninstall

plugins/harness-floor/skills/agent-all/lib/
  decision-router.mjs     wave coord: scoping → batched ask → re-dispatch

plugins/harness-floor/skills/agent-all/phases/
  3-dispatch.md           3a/3b/3c sub-phase 업데이트
```

### 4.2 데이터 흐름

상세는 영문 spec §4.2 다이어그램 참조. 요약:
- Phase 3a: N개 implementer 병렬 dispatch (scoping). hook이 prompt에 addendum 자동 inject.
- 각자 `NEEDS_DECISIONS` payload 반환.
- decision-router가 task별로 그룹화 → TTY면 순차 AskUserQuestion, non-TTY면 자동 resolve + log.
- Phase 3c: 답변 inject한 채 implementer 병렬 재-dispatch.
- PostToolUse hook이 verification log + audit token 검증.

## 5. 결정 payload 스키마

영문 spec §5 참조. 핵심 제약:
- `decisions[].options.length` 2-4 필수 (AskUserQuestion hard limit).
- `recommended_index`는 options 범위 내 정수.
- 5+ 후보면 top 3 + "Other (clarify in follow-up)"로 압축.

## 6. Phase 3 sub-phase

- **3a Scoping**: implementer 병렬 dispatch (addendum 포함). `NEEDS_DECISIONS` payload 또는 `NO_DECISIONS` 반환. Edit/Write 금지 (prompt-only 강제; PostToolUse가 violation 잡아냄).
- **3b Ask**: `decision-router.mjs`가 payload 수집, task별 그룹화. TTY면 순차 `AskUserQuestion`, non-TTY면 auto-resolver. 답변 `.agent-all-state.json` `state.decisions[<task_id>]`에 persist.
- **3c Implementation**: 답변 inject (`## User Decisions for This Task`)한 새 prompt로 implementer 재-dispatch. PostToolUse hook이 `STATUS: DONE`+verification log 검증.

## 7. Hook 프로토콜

`plugins/harness-floor/bin/floor-policy-hook.mjs` 단일 파일이 `PreToolUse`+`PostToolUse` 둘 다 export. Sentinel: `floor-policy-`.

### 7.1 PreToolUse 라우팅

- `toolName !== 'Task'` → passthrough (0.1ms exit)
- description이 `^Implement Task` 매치 → addendum + verification directive inject
- description이 `^Review Task` 매치 → reviewer audit directive inject

### 7.2 PostToolUse 라우팅

- 비-`Task` → passthrough
- implementer 결과: `STATUS: DONE`인데 `verification_passed` 토큰 없으면 reject (exit 2)
- reviewer 결과: `VERIFICATION_AUDIT: passed|failed|skipped` 토큰 없으면 reject

### 7.3 Cheap-matcher 원칙

각 handler는 `Task` 도구 아닐 때 0.1ms 안에 exit. JSON 파싱은 도구명 + description 필터 통과 후만. Common case 도구 호출당 오버헤드: negligible.

## 8. Wave coordination

`decision-router.mjs`만 새 구성요소. 동작:
1. 모든 scoping-pass 반환을 await (병렬).
2. `task_id`로 bucket, wave 순서.
3. 각 task: 순차 `AskUserQuestion` 호출 (또는 non-TTY resolver).
4. 결과를 `.agent-all-state.json`에 매번 persist → `--resume`이 batch 중간에도 복원 가능.
5. 답변 map을 phase 3c 재-dispatch에 전달.

실패 모드:
- scoping subagent crash → `NEEDS_DECISIONS: []`로 처리 (default 진행). Warning 로그.
- 사용자가 AskUserQuestion 취소 → 전체 phase 3 `paused`로 표시, state 저장, exit. `/agent-all --resume`이 다시 물음.

## 9. Non-TTY 정책

감지: `--yes` flag, `process.stdout.isTTY === false`, 또는 `--loop` iteration > 1.

발동되면 `non-tty-resolver.mjs`가 각 결정의 `recommended_index` 선택, `.agent-all-state.json`에 다음 형태로 append:

```json
"decisions": {
  "task-3": { "d1": { "chosen_index": 0, "auto_resolved": true, "timestamp": "..." } }
}
```

요약을 `docs/agent-all/iter-<N>/decisions.md`에 작성 — 다음날 아침 리뷰가 auto-pick들을 surface.

## 10. 플랫폼별 포트 매트릭스

| 플랫폼 | Hook 메커니즘 | 렌더러 | 강도 |
|---|---|---|---|
| Claude Code | `.claude/settings.local.json` hooks | `AskUserQuestion` MCP-style 도구 | 🟢 Hard |
| Copilot CLI | `.github/hooks/*.json` | stdin prompt | 🟢 Hard |
| Codex CLI | `~/.codex/config.toml`의 `[[hooks.PreToolUse]]` shell/policy 이벤트; floor 워크플로는 프롬프트/순차 dispatch | stdin prompt | 🟡 혼합: shell policy는 hard, floor orchestration은 prompt-level |
| Cursor | `.cursor/rules/decision-protocol.mdc` (always-loaded rule) | 채팅 prompt | 🟡 Soft (prompt-only) |
| Gemini CLI | `GEMINI.md` 섹션 | 채팅 prompt | 🟡 Soft (prompt-only) |
| VS Code Copilot | `.github/copilot-instructions.md` | 채팅 prompt | 🟡 Soft (prompt-only) |

`lib/decisions/`는 플랫폼-무관 Node. 각 포트 plugin의 `bin/install.mjs`가 적절한 hook/rule 아티팩트를 emit, 공유 lib 참조.

## 11. Opt-out

`.agent-all.json` 프로젝트별 opt-out:

```json
{ "policy": { "decisionSurfacing": true, "verification": true, "reviewerAudit": true } }
```

기본: 셋 다 `true`. `false`로 설정 시 hook router가 해당 규칙의 inject + 검증을 skip.

## 12. 한계 (영문 spec §12 전체 + README.ko "알려진 한계" 섹션 참조)

핵심 10개:

1. Cursor / Gemini / VS Code Copilot은 soft enforce만 가능 (tool-call hook 없음).
2. Reviewer-audit grep은 fragile — 정확한 토큰 `VERIFICATION_AUDIT: passed|failed|skipped` 매치. Prompt addendum이 token format 강제로 mitigation.
3. Decision-surfacing이 `subagent-driven-development`의 "continuous execution" 규칙을 의도적으로 깸 (task 시작 전에만 1회 pause; 완료된 task 사이는 pause 안함).
4. AskUserQuestion 4-option hard limit. 5+ 후보면 top 3 + "Other"로 condense.
5. Non-TTY auto-pick이 틀릴 수 있음. 모든 auto-pick이 reasoning과 함께 `docs/agent-all/iter-<N>/decisions.md`에 로그.
6. Per-task scoping pass가 ~15-20% subagent dispatch 비용 추가.
7. Hook 강제는 user가 직접 입력한 Edit/Write에는 적용 안됨 — by design.
8. `description` 기반 implementer 식별이 false-positive 가능 — opt-out flag가 escape hatch.
9. v1에 confidence scoring 없음 — recommendation은 binary.
10. `/explore`는 패턴이 거의 발동 안함 (read-only). 일관성 위해 설치, 실용적으로 no-op.

## 13. README + 문서 업데이트 계획

`README.md`:
- "Self-sustaining workflows" 근처에 decision-surfacing + non-TTY auto-pick callout.
- Status 바로 아래에 **"Known limitations"** 섹션 (1, 5, 7, 8번 한계).
- "Main-thread isolation" 표 업데이트 (Phase 3a/3b/3c 토큰 비용).

`docs/USAGE.md` (+ `.ko.md`):
- **"Decision-surfacing"** 섹션 추가: 발동 조건, 패널 형태, auto-pick 해석.

플랫폼별 README (각 포트 plugin):
- 강제 강도 (hard/soft) 표시 — 한계 #1.

## 14. 테스트 접근

- Unit: schema validator, renderer, validators, non-TTY resolver, hook router.
- Integration: decision-router, hook 통합 (mock dispatch + return).
- Cross-plugin isolation: 기존 테스트 그대로 통과해야.
- Smoke: end-to-end `/agent-all "trivial task" --yes` non-TTY 흐름.

목표: 1649/1649 green 유지. 새 lib/hook surface에는 focused tests 추가.

## 15. Out of scope (v1)

- Confidence scoring (한계 #9 참조).
- `/explore`, `/agent-init`에 대한 decision-surfacing 확장 (hook 설치 외 거의 fire 안함).
- `/thrift`와 programmatic compact 통합 (별도 로드맵).
- Auto-pick 정확도 telemetry (future version).
