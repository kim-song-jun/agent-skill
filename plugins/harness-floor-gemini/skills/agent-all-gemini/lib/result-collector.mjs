// result-collector.mjs — parses per-subprocess JSON output files written by
// `gemini chat --output-file <path> --output-json` calls.
//
// Partial-failure semantics (per spec line ~100, open question #5):
//   - Missing file              → status: "failed", errors: ["no result file"]
//   - Empty file                → status: "failed", errors: ["empty result file"]
//   - SyntaxError (corrupt)     → status: "failed", errors: ["corrupt JSON: <msg>"]
//   - Partial write (truncated) → SyntaxError path above; caller still
//                                 keeps the raw text for debugging.
//   - Valid JSON, unknown shape → status normalized; missing fields default.
//
// Contract — ParsedResult:
//   {
//     ok: boolean,
//     status: "completed" | "blocked" | "failed",
//     taskId: string|number,
//     agentId?: string|null,
//     commits: string[],
//     costUSD: number,
//     exitCode: number,
//     errors: string[],
//     raw?: string,             // present only on parse failure
//   }
//
// TODO: requires `gemini chat --output-json` flag verification — the
// expected schema below is what the spec assumes (status/agentId/commits/
// costUSD/exitCode/errors); confirm against live Gemini CLI build.

import { readFileSync, existsSync, statSync } from "node:fs";

const VALID_STATUS = new Set(["completed", "blocked", "failed", "incomplete"]);

function asArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (v == null) return [];
  return [String(v)];
}

function normalize(payload, taskId) {
  const status = VALID_STATUS.has(payload.status) ? payload.status : "completed";
  return {
    ok: true,
    status,
    taskId,
    agentId: payload.agentId ?? payload.agent_id ?? null,
    commits: Array.isArray(payload.commits) ? payload.commits.map(String) : [],
    costUSD: typeof payload.costUSD === "number"
      ? payload.costUSD
      : (typeof payload.cost_usd === "number" ? payload.cost_usd : 0),
    exitCode: Number.isFinite(payload.exitCode) ? payload.exitCode : 0,
    errors: asArray(payload.errors),
    tokens: payload.tokens || payload.usage || null,
  };
}

export function parseResultFile(jsonPath, taskId = null) {
  const id = taskId ?? jsonPath;
  if (!existsSync(jsonPath)) {
    return {
      ok: false,
      status: "failed",
      taskId: id,
      agentId: null,
      commits: [],
      costUSD: 0,
      exitCode: -1,
      errors: ["no result file"],
    };
  }
  let st;
  try { st = statSync(jsonPath); } catch (e) {
    return {
      ok: false,
      status: "failed",
      taskId: id,
      agentId: null,
      commits: [],
      costUSD: 0,
      exitCode: -1,
      errors: [`stat failed: ${e.message}`],
    };
  }
  if (st.size === 0) {
    return {
      ok: false,
      status: "failed",
      taskId: id,
      agentId: null,
      commits: [],
      costUSD: 0,
      exitCode: -1,
      errors: ["empty result file"],
    };
  }
  let text;
  try { text = readFileSync(jsonPath, "utf-8"); } catch (e) {
    return {
      ok: false,
      status: "failed",
      taskId: id,
      agentId: null,
      commits: [],
      costUSD: 0,
      exitCode: -1,
      errors: [`read failed: ${e.message}`],
    };
  }
  let payload;
  try { payload = JSON.parse(text); } catch (e) {
    return {
      ok: false,
      status: "failed",
      taskId: id,
      agentId: null,
      commits: [],
      costUSD: 0,
      exitCode: -1,
      errors: [`corrupt JSON: ${e.message}`],
      raw: text,
    };
  }
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      status: "failed",
      taskId: id,
      agentId: null,
      commits: [],
      costUSD: 0,
      exitCode: -1,
      errors: ["payload not an object"],
      raw: text,
    };
  }
  return normalize(payload, id);
}

// Collect a batch. `tasks` is [{id, outputFile}, ...].
// Returns { results: ParsedResult[], summary: {completed, failed, blocked, totalCostUSD} }.
export function collectBatch(tasks) {
  const results = tasks.map((t) => parseResultFile(t.outputFile, t.id));
  const summary = {
    completed: 0,
    failed: 0,
    blocked: 0,
    totalCostUSD: 0,
  };
  for (const r of results) {
    if (r.status === "completed") summary.completed += 1;
    else if (r.status === "blocked") summary.blocked += 1;
    else summary.failed += 1;
    summary.totalCostUSD += r.costUSD || 0;
  }
  return { results, summary };
}

export const __internal = { normalize, VALID_STATUS };
