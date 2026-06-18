> English: [codex.md](codex.md)

# Codex CLI Quickstart

범위: Codex CLI plugin bundle을 설치하고 Codex skill 파일이 보이는지 확인합니다.
Codex는 canonical public command name을 사용하지만, runtime dispatch는 현재
Codex의 skill 및 prompt-level surface를 따릅니다.

## 설치

Codex CLI 0.140.0 이상은 native plugin manager를 포함합니다. `agent-skill`
checkout에서 native updater를 사용합니다.

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
cd /tmp/agent-skill
./scripts/update-codex-plugins.sh
```

수동 fallback도 같은 단수형 Codex plugin surface를 사용합니다. marketplace를 한
번 등록합니다.

```bash
codex plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

이미 등록되어 있다면 snapshot을 갱신합니다.

```bash
codex plugin marketplace upgrade agent-skill
```

그 다음 Codex plugin set을 설치하거나 갱신합니다.

```bash
codex plugin add harness-builder-codex@agent-skill
codex plugin add harness-floor-codex@agent-skill
codex plugin add harness-thrift-codex@agent-skill
codex plugin add harness-debug-codex@agent-skill
```

## 확인

```bash
codex plugin list | grep -E 'harness-(builder|floor|thrift|debug)-codex@agent-skill[[:space:]]+installed, enabled'
```

## 설치 완료의 의미

Codex가 native plugin manager에서 설치된 `agent-skill` bundle을 로드할 수 있습니다.
project 안에서 `/agent-init`을 실행하기 전까지 target repository 파일은 생성되지
않습니다.

## 다음 단계

하네스를 적용할 프로젝트를 Codex에서 열고 `/agent-init`을 실행하세요.
project-local setup은 [사용법](../USAGE.ko.md)을 보세요.
