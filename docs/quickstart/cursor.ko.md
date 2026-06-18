> English: [cursor.md](cursor.md)

# Cursor Quickstart

범위: Cursor project scaffold를 쓰고 Cursor rule과 agent asset이 있는지
확인합니다.

## 설치

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=cursor --target=/path/to/my-project
```

## 확인

```bash
test -f /path/to/my-project/.cursor/rules/agent-init.mdc
test -f /path/to/my-project/.cursor/rules/agent-all.mdc
```

## 설치 완료의 의미

target project에 Cursor rule, agent asset, harness config 파일이 생겼습니다.
enforcement 강도는 Cursor가 제공하는 host surface에 따라 달라지며, Claude-style
hard hook parity가 아닙니다.

## 다음 단계

target repository를 Cursor에서 열고 생성된 rule과 agent를 사용하세요. 이
project-local bootstrap은 Cursor의 `/agent-init` equivalent입니다. workflow 예시는
[사용법](../USAGE.ko.md)을 보세요.
