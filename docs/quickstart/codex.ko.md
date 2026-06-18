> English: [codex.md](codex.md)

# Codex CLI Quickstart

범위: Codex CLI plugin bundle을 설치하고 Codex skill 파일이 보이는지 확인합니다.
Codex는 canonical public command name을 사용하지만, runtime dispatch는 현재
Codex의 skill 및 prompt-level surface를 따릅니다.

## 설치

marketplace가 아직 등록되지 않았다면 Claude Code 안에서 한 번 등록합니다.

```text
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

그 다음 터미널에서 Codex plugin set을 설치합니다.

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --cli=codex
```

## 확인

```bash
find ~/.codex/plugins/cache/agent-skill -maxdepth 7 -name SKILL.md | sort | grep -E '/(codex-init|agent-all-codex|visual-qa-codex|thrift-codex|debug-codex)/SKILL.md'
```

## 설치 완료의 의미

Codex가 local plugin cache에서 설치된 `agent-skill` bundle을 로드할 수 있습니다.
project 안에서 `/agent-init`을 실행하기 전까지 target repository 파일은 생성되지
않습니다.

## 다음 단계

하네스를 적용할 프로젝트를 Codex에서 열고 `/agent-init`을 실행하세요.
project-local setup은 [사용법](../USAGE.ko.md)을 보세요.
