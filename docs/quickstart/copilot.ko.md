> English: [copilot.md](copilot.md)

# Copilot CLI Quickstart

범위: GitHub Copilot용 project scaffold를 쓰고 Copilot instruction 파일이
있는지 확인합니다. Copilot CLI에는 agent-workflow용 비교 가능한 marketplace가
없으므로 이 경로는 project-local 파일을 씁니다.

## 설치

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=copilot --target=/path/to/my-project
```

## 확인

```bash
test -f /path/to/my-project/.github/copilot-instructions.md
```

## 설치 완료의 의미

target project에 Copilot-oriented `agent-skill` instruction과 support file이
생겼습니다. 이것은 Copilot의 project-local bootstrap 경로이며 Claude-native hook
install이 아닙니다.

## 다음 단계

target repository를 Copilot에서 열고 `.github/copilot-instructions.md`를 따르도록
요청하세요. `/agent-init`과 `/agent-all`에 대응하는 흐름은
[사용법](../USAGE.ko.md)을 보세요.
