> English: [README.md](README.md)

# 플랫폼 Quickstart

agent host별 최단 설치 경로와, 설치된 plugin, skill, rule, instruction surface가
보이는지 확인하는 한 가지 명령을 찾을 때 사용합니다.

이 문서는 의도적으로 좁습니다. 전체 프로젝트 설정 문서를 대체하지 않습니다.
확인이 끝나면 [사용법](../USAGE.ko.md)의 `/agent-init` 또는 해당 플랫폼의
project-local bootstrap 단계로 이동하세요.

## 설치 결정표

| Host | Quickstart | 확인하는 것 |
|---|---|---|
| Claude Code | [Claude Code](claude.ko.md) | Claude plugin marketplace 설치가 보이는지 |
| Codex CLI | [Codex CLI](codex.ko.md) | Codex plugin bundle과 skill이 보이는지 |
| Copilot CLI | [Copilot CLI](copilot.ko.md) | Copilot project scaffold 파일이 있는지 |
| Cursor | [Cursor](cursor.ko.md) | Cursor rule과 agent asset이 있는지 |
| Gemini CLI | [Gemini CLI](gemini.ko.md) | Gemini memory와 skill asset이 있는지 |
| VS Code Copilot | [VS Code Copilot](vscode-copilot.ko.md) | instructions-only asset이 있는지 |

## 다음 단계

이 Quickstart가 통과하면 하네스를 적용할 저장소에서 project setup을 진행하세요.
Claude와 Codex 사용자는 `/agent-init`을 사용할 수 있습니다. 다른 host는
`install-platform.sh`가 해당 host의 project-local equivalent를 씁니다. 자세한
프로젝트별 흐름은 [사용법](../USAGE.ko.md), 다른 하네스와의 비교는
[하네스 포지셔닝](../HARNESS_POSITIONING.ko.md)을 보세요.
