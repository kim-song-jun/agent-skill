> 🇺🇸 English: [README.md](README.md)

# agent-skill

`/agent-init` 및 (향후) 프로젝트 수준 에이전트 하네스를 부트스트랩하는 형제 스킬들을 위한 Claude Code 플러그인 마켓플레이스.

## 설치

```
/plugin marketplace add https://github.com/<owner>/agent-skill
/plugin install harness-builder@agent-skill
```

## 배포 내용

- `harness-builder` 플러그인 → `/agent-init` 스킬
- 전역 훅 `context-mode-cache-heal.mjs` (SessionStart)

설계는 `docs/superpowers/specs/`를 참고하고, 구현 계획은 `docs/superpowers/plans/`를 참고하세요.

## 테마 (로드맵)

| 테마 | 플러그인 | 상태 |
|-------|--------|--------|
| A. 프로젝트별 하네스 빌더 | `harness-builder` | 개발 중 |
| B. 토큰 비용 최적화 | `harness-thrift` | 계획 중 |
| C. 비용 제한 없는 병렬 모드 | `harness-floor` | 계획 중 |
