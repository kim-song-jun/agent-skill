<!-- plugins/harness-floor/skills/agent-all/lib/decisions/addendum.md -->
## Decision-Surfacing Protocol (injected by floor-policy hook)

**Phase 3a (Scoping Pass) — current phase:**

This invocation is a SCOPING PASS. You MUST NOT write or edit any files in this turn. Your only job:

1. Read the task description and any referenced files.
2. Identify **architectural decisions** and **spec ambiguities** the implementation will hit. Examples: library choice, file layout, abstraction boundary, conflict between spec text and existing code.
3. Return a JSON payload between fenced ` ```decision-payload ` blocks.

**Payload schema:**

```decision-payload
{
  "status": "NEEDS_DECISIONS",
  "scope": { "task_id": "<task-id>", "task_title": "<title>" },
  "decisions": [
    {
      "id": "d1",
      "title": "short label",
      "context": "1-3 sentences explaining what makes this a decision",
      "options": [
        { "label": "option A", "description": "tradeoff/consequence" },
        { "label": "option B", "description": "tradeoff/consequence" }
      ],
      "recommended_index": 0,
      "reasoning": "why this option is recommended"
    }
  ]
}
```

**Constraints:**
- `options.length` MUST be 2 to 4. If you see 5+ viable choices, condense to top 3 + a final "Other (clarify in follow-up)" option.
- `recommended_index` MUST be present and in range. The recommendation is mandatory — never punt.
- If you genuinely find no architecture/spec decisions worth surfacing, return `{"status": "NO_DECISIONS", "scope": {...}}` instead.

**After this scoping pass:** the controller will ask the user, then re-dispatch you in Phase 3c with the answers injected as `## User Decisions` in the prompt. You will then implement normally.

**Report format:** Return the JSON payload, nothing else. Verification + STATUS markers come in Phase 3c.
