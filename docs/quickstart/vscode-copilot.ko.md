> English: [vscode-copilot.md](vscode-copilot.md)

# VS Code Copilot Quickstart

범위: VS Code Copilot instructions-only surface를 쓰고 target project에 Copilot
instruction이 있는지 확인합니다.

## 설치

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=vscode-copilot --target=/path/to/my-project
```

## 확인

```bash
test -f /path/to/my-project/.github/copilot-instructions.md
```

## 설치 완료의 의미

VS Code Copilot이 생성된 project instruction을 읽을 수 있습니다. 현재 릴리스는
이 editor-only host에 runtime hook enforcement를 제공하지 않습니다.

## 다음 단계

Copilot이 활성화된 VS Code에서 target repository를 여세요. 이 instructions-only
surface는 VS Code Copilot의 `/agent-init` equivalent입니다. 지원 범위는
[사용법](../USAGE.ko.md)을 보세요.
