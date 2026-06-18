> English: [claude.md](claude.md)

# Claude Code Quickstart

범위: Claude Code plugin bundle을 설치하고 Claude가 선택된 `agent-skill`
plugin을 볼 수 있는지 확인합니다.

## 설치

Claude Code 안에서 한 번 실행합니다.

```text
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/plugin install harness-data@agent-skill
/reload-plugins
```

터미널에서 더 빠르게 설치하려면 다음을 사용합니다.

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --claude-code
```

## 확인

```bash
cat ~/.claude/plugins/installed_plugins.json | python3 -m json.tool | grep -B1 agent-skill
```

## 설치 완료의 의미

Claude Code가 선택된 marketplace plugin을 볼 수 있습니다. target repository에서
`/agent-init`을 실행하기 전까지 프로젝트 파일은 생성되지 않습니다.

## 다음 단계

하네스를 적용할 프로젝트를 열고 `/agent-init`을 실행하세요.
project-local setup은 [사용법](../USAGE.ko.md)을 보세요.
