const VALID_STATUSES = new Set(["NEEDS_DECISIONS", "NO_DECISIONS"]);

export function validateDecisionPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    errors.push("payload must be an object");
    return { ok: false, errors };
  }
  if (!VALID_STATUSES.has(payload.status)) {
    errors.push(`status must be one of ${[...VALID_STATUSES].join(", ")}`);
  }
  if (!payload.scope || typeof payload.scope.task_id !== "string") {
    errors.push("scope.task_id required");
  }
  if (payload.status === "NEEDS_DECISIONS") {
    if (!Array.isArray(payload.decisions) || payload.decisions.length === 0) {
      errors.push("decisions array required and non-empty");
    } else {
      payload.decisions.forEach((d, i) => {
        if (!d.id) errors.push(`decisions[${i}].id required`);
        if (!d.title) errors.push(`decisions[${i}].title required`);
        if (!Array.isArray(d.options)) {
          errors.push(`decisions[${i}].options must be array`);
          return;
        }
        if (d.options.length < 2) errors.push(`decisions[${i}] must have at least 2 options`);
        if (d.options.length > 4) errors.push(`decisions[${i}] must have at most 4 options (AskUserQuestion limit)`);
        if (typeof d.recommended_index !== "number" || d.recommended_index < 0 || d.recommended_index >= d.options.length) {
          errors.push(`decisions[${i}].recommended_index out of range`);
        }
        if (!d.reasoning) errors.push(`decisions[${i}].reasoning required`);
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
