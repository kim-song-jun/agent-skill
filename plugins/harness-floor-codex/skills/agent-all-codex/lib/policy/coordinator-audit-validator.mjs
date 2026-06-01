const TOKEN_RE = /ORCHESTRATION_AUDIT:\s*(passed|failed|skipped)\b/;

export function validateCoordinatorAudit(text) {
  const match = TOKEN_RE.exec(String(text ?? ""));
  if (!match) {
    return {
      ok: false,
      reason: "Coordinator must include a line `ORCHESTRATION_AUDIT: passed|failed|skipped`. Token missing or value invalid.",
    };
  }
  return { ok: true, status: match[1] };
}
