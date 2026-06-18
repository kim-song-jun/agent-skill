> English: [HARNESS_POSITIONING.md](HARNESS_POSITIONING.md)

# 하네스 포지셔닝

이 문서는 `agent-skill`이 현재 유명한 coding-agent harness들과 어떻게
다르고, 여러 저장소에 재사용 가능한 general agent harness를 만들 때 어떤
도움이 되는지 설명합니다.

여기서 언급하는 외부 프로젝트는 독립 프로젝트입니다. 비교는 2026-06-18에
확인한 공개 GitHub 문서를 기준으로 했습니다.

- [Gajae-Code](https://github.com/Yeachan-Heo/gajae-code)
- [Oh My OpenAgent / OMO](https://github.com/code-yeongyu/oh-my-openagent)

## 짧은 결론

`agent-skill`은 **project-local harness generator**입니다. 또 하나의 독립
agent runtime이 되려는 것이 아니라, Claude Code, Codex CLI, Copilot CLI,
Cursor, Gemini CLI, VS Code Copilot 각각의 파일 레이아웃에 같은 운영
워크플로를 설치합니다.

다음이 중요하면 `agent-skill`이 맞습니다.

- 하나의 canonical 명령 표면: `/agent-init`, `/agent-all`, `/visual-qa`,
  `/thrift`, `/debug`
- audit, repair, uninstall, reinstall 가능한 project-local scaffold
- verification-first 흐름: tests, visual QA, reviewers, policy hooks, doctor,
  release gates
- 보수적 host 통합: 기본값으로 global config를 패치하지 않고, host가 요구할 때
  수동 merge snippet 또는 명시적 update 경로 제공
- 서로 다른 agent host를 쓰는 팀도 같은 하네스 방법론을 공유

Gajae-Code나 OMO가 더 맞는 경우도 분명합니다. Gajae-Code는 tmux/worktree
evidence 흐름을 가진 focused external runner가 필요할 때 좋고, OMO는
OpenCode 중심의 강한 multi-agent orchestration, model routing, Team Mode,
LSP/AST 도구, embedded MCP가 필요한 경우에 맞습니다.

## 비교표

| 기준 | `agent-skill` | Gajae-Code | OMO / Oh My OpenAgent |
|---|---|---|---|
| 기본 형태 | 여러 host에 설치되는 project-local scaffold + plugin set | 기존 도구 옆에서 실행하는 external coding-agent runner | OpenCode 중심 agent OS + Codex Light edition |
| 공개 workflow | `/agent-init`, `/agent-all`, `/visual-qa`, `/thrift`, `/debug` | `deep-interview`, `ralplan`, `ultragoal`, 선택적 `team` | `ultrawork` / `ulw`, Team Mode, Codex Light components |
| portability 목표 | Claude, Codex, Copilot, Cursor, Gemini, VS Code Copilot에서 같은 운영 방식 | 선택한 repo/worktree에서 기존 도구 옆 실행 | Ultimate은 OpenCode, Light는 Codex |
| enforcement 모델 | host별 adapter: hard hook 가능하면 hard, 아니면 prompt/sequential contract | external runner + tmux/worktree 경계 | OpenCode hook/tool/MCP, Codex Light는 Codex plugin surface |
| 검증 성격 | release-audited docs, fresh fixtures, doctors, provenance, visual QA, policy gates | planning/execution evidence 중심 | doctor, model setup, rules injection, LSP/AST, hash-anchored edit |
| 잘 맞는 경우 | 여러 repo/host에 재사용 가능한 운영 하네스를 표준화하려는 팀 | 작은 공개 표면의 focused external runner가 필요한 사용자 | 강한 OpenCode-first agent system을 원하는 사용자 |

## `agent-skill`의 차별점

### 1. 하네스를 install 가능한 project contract로 본다

핵심 산출물은 일회성 프롬프트가 아닙니다. `/agent-init`은 root guidance,
agent/skill definitions, task ledger, policy hooks, config, doctor-compatible
scaffold를 실제 파일로 씁니다. 그래서 사람이 검토할 수 있고, release fixture로
테스트할 수 있습니다.

### 2. host가 달라도 명령어는 맞춘다

내부 source directory는 플랫폼별 이름을 유지하지만, 사용자가 보는 명령은
가능한 한 동일합니다.

```text
/agent-init
/agent-all
/visual-qa
/thrift
/debug
```

각 host adapter가 이 명령을 해당 host의 실제 primitive로 매핑합니다. Claude는
native slash-command와 hook surface를 씁니다. Codex는 현재 command surface가
동일한 Task lifecycle을 제공하지 않는 부분에서 prompt-level 또는 sequential
skill dispatch를 씁니다. Copilot, Cursor, Gemini, VS Code Copilot도 각 host가
지원하는 가장 강한 scaffold를 받습니다.

### 3. autonomy보다 verification을 먼저 둔다

검증 없는 자율성은 재작업을 만듭니다. 그래서 `agent-skill`은 기본 경로에
gate를 둡니다.

- `agent-all`은 계획, dispatch, review, state 기록을 수행
- `visual-qa`는 페이지, 상태, breakpoint, interaction을 스크린샷으로 검증
- verification adapter는 CLI, API, notebook, SQL, batch, web UI evidence를 기록
- policy hook은 host가 hard hook을 지원하는 곳에서 파괴적 명령과 품질부채
  우회를 차단
- release script는 tag 전에 docs, installer, fresh fixture, provenance, vendored
  library, full tests를 검증

### 4. 기본값으로 숨은 global mutation을 피한다

프로젝트 bootstrap 산출물은 target repo 안에 생성합니다. user-level config가
필요한 host에서는 snippet을 출력하거나 명시적 승인 경로를 요구합니다. 이
방식은 공유 머신, 병렬 세션, 이미 세팅된 host config가 있는 팀에 안전합니다.

### 5. general harness blueprint로 재사용할 수 있다

이 저장소는 plugin bundle일 뿐 아니라 agent harness를 만드는 반복 가능한
아키텍처 예시입니다.

1. **Command contract:** 사용자가 기억할 작은 공개 workflow를 정의합니다.
2. **Project scaffold:** 일회성 프롬프트가 아니라 repo-local 파일을 씁니다.
3. **Host adapters:** 같은 방법론을 각 host의 실제 primitive에 매핑합니다.
4. **Policy layer:** hard hook이 있으면 강제하고, soft surface는 정직하게 문서화합니다.
5. **Verification layer:** tests, visual QA, domain evidence를 1급 산출물로 둡니다.
6. **State layer:** loop state, task identity, handoff, cost telemetry, run evidence를
   `.agent-skill/` 아래에 보존합니다.
7. **Release layer:** publish 전에 docs contract, fresh fixture install, doctor,
   provenance manifest, full tests를 요구합니다.

이 패턴이 transferable합니다. 팀이 host runtime을 바꿔도 같은 하네스 구조를
유지할 수 있습니다.

## 무엇을 선택할까

`agent-skill`을 선택할 때:

- 팀이 둘 이상의 agent host를 씀
- plugin update 이후에도 남는 repo-local operating contract가 필요함
- raw agent throughput보다 PR/review/test/visual-QA discipline이 중요함
- conservative install/uninstall과 release evidence가 필요함
- 자체 harness를 만들 때 audit된 예시를 참고하고 싶음

Gajae-Code를 선택할 때:

- host-specific plugin install보다 focused external runner가 필요함
- tmux/worktree-backed execution과 evidence가 workflow 중심임
- 넓은 plugin bundle보다 작은 public method surface를 선호함

OMO를 선택할 때:

- OpenCode가 주 runtime임
- 공격적인 multi-agent orchestration, model routing, Team Mode, LSP, AST search,
  embedded MCP tooling을 한 시스템에서 원함
- project-local cross-host scaffold보다 OMO/LazyCodex 계열의 Codex Light
  components를 원함

## 정직한 한계

`agent-skill`은 cross-host operational harness로 가장 강합니다. 모든
runtime-specific 혁신을 대체하려는 도구는 아닙니다.

- OMO의 OpenCode-native Team Mode나 hash-anchored edit stack을 대체하려는 것이 아님
- Gajae-Code의 external runner와 tmux-centered workflow를 대체하려는 것이 아님
- host마다 hook/subagent lifecycle 노출 수준이 달라 enforcement 강도가 달라짐
- global marketplace install과 project-local init이 별도 단계라 사용자가 이 구분을
  이해해야 함

트레이드오프는 의도적입니다. 공개 workflow는 안정적으로 유지하고, project file은
audit 가능하게 남기며, 각 host의 실제 능력에 맞게 정직하게 적응합니다.
