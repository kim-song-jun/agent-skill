> English: [gemini.md](gemini.md)

# Gemini CLI Quickstart

범위: Gemini CLI project scaffold를 쓰고 Gemini memory와 skill asset이 있는지
확인합니다.

## 설치

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=gemini --target=/path/to/my-project
```

## 확인

```bash
test -f /path/to/my-project/GEMINI.md
test -f /path/to/my-project/.gemini/skills/planner/SKILL.md
```

## 설치 완료의 의미

target project에 Gemini memory와 skill 파일이 생겼습니다. MCP/settings
integration은 host-specific이며 Claude-style hook parity가 아닙니다.

## 다음 단계

target repository를 Gemini CLI로 여세요. 이 project-local bootstrap은 Gemini의
`/agent-init` equivalent입니다. workflow 예시는 [사용법](../USAGE.ko.md)을
보세요.
