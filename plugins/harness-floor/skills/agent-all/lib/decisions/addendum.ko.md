<!-- plugins/harness-floor/skills/agent-all/lib/decisions/addendum.ko.md -->
## Decision-Surfacing 프로토콜 (floor-policy hook이 inject)

**Phase 3a (Scoping Pass) — 현재 단계:**

이번 호출은 SCOPING PASS입니다. 이 turn에서는 파일을 절대 작성/수정하면 안됩니다. 할 일은 단 한가지:

1. Task 설명과 참조 파일을 읽습니다.
2. 구현이 부딪힐 **아키텍처 결정**과 **스펙 모호점**을 파악. 예: 라이브러리 선택, 파일 레이아웃, 추상화 경계, spec 텍스트와 기존 코드의 충돌.
3. ` ```decision-payload ` 펜스 사이에 JSON payload 반환.

**Payload 스키마:**

```decision-payload
{
  "status": "NEEDS_DECISIONS",
  "scope": { "task_id": "<task-id>", "task_title": "<title>" },
  "decisions": [
    {
      "id": "d1",
      "title": "짧은 라벨",
      "context": "이게 왜 결정 사항인지 1-3문장 설명",
      "options": [
        { "label": "선택지 A", "description": "trade-off / 결과" },
        { "label": "선택지 B", "description": "trade-off / 결과" }
      ],
      "recommended_index": 0,
      "reasoning": "왜 이 선택지를 추천하는지"
    }
  ]
}
```

**제약:**
- `options.length` 2~4 필수. 5개 이상 유효 후보면 top 3 + 마지막 "기타 (follow-up에서 명시)" 옵션으로 압축.
- `recommended_index`는 필수이고 범위 안. 추천은 의무 — 절대 punt 하지 말 것.
- 만약 아키텍처/스펙 결정이 진짜 없으면 `{"status": "NO_DECISIONS", "scope": {...}}` 반환.

**이번 scoping pass 이후:** 컨트롤러가 사용자에게 묻고, Phase 3c에서 답변을 prompt에 `## 사용자 결정` 섹션으로 inject해서 재-dispatch. 그 때 정상 구현 진행.

**보고 형식:** JSON payload만 반환, 그 외 텍스트 없음. Verification + STATUS 마커는 Phase 3c에서.
