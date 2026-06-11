import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonCandidate(text) {
  const body = String(text ?? "").trim();
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // Some runners print logs plus a final JSON line.
  }
  for (const line of body.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      continue;
    }
  }
  return null;
}

export function parseNotebookRunnerResult(stdout) {
  const parsed = parseJsonCandidate(stdout);
  if (!parsed) return null;
  return {
    artifacts: asArray(parsed.artifacts ?? parsed.requiredArtifacts).map(String),
    failures: asArray(parsed.failures).filter(isPlainObject),
    assertions: asArray(parsed.assertions).filter(isPlainObject),
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    environment: isPlainObject(parsed.environment) ? parsed.environment : null,
    seed: parsed.seed,
    dataSnapshot: parsed.dataSnapshot ?? parsed.datasetSnapshot,
    metadata: isPlainObject(parsed.metadata) ? parsed.metadata : null,
  };
}

export function environmentSummary(extra = {}) {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    ...extra,
  };
}

function inspectCell(cell, notebookPath, cellIndex) {
  const outputs = Array.isArray(cell?.outputs) ? cell.outputs : [];
  const failures = [];
  for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
    const output = outputs[outputIndex];
    if (output?.output_type !== "error") continue;
    const ename = output.ename || "NotebookError";
    const evalue = output.evalue ? `: ${output.evalue}` : "";
    failures.push({
      id: "notebook-cell-error",
      message: `${notebookPath} cell ${cellIndex + 1} output ${outputIndex + 1} has ${ename}${evalue}`,
      severity: "major",
    });
  }
  return {
    executionCount: cell?.execution_count ?? null,
    outputCount: outputs.length,
    failures,
  };
}

export function inspectNotebookFile({ cwd = ".", path } = {}) {
  const rel = typeof path === "string" && path.trim() ? path.trim() : null;
  if (!rel) {
    return {
      path: rel,
      ok: false,
      failures: [{ id: "notebook-path-missing", message: "Notebook path is required", severity: "major" }],
    };
  }
  const abs = resolve(cwd, rel);
  if (!existsSync(abs)) {
    return {
      path: rel,
      ok: false,
      failures: [{ id: "notebook-missing", message: `Missing notebook: ${rel}`, severity: "major" }],
    };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf-8"));
  } catch (error) {
    return {
      path: rel,
      ok: false,
      failures: [{ id: "notebook-invalid-json", message: `${rel} is not valid notebook JSON: ${error.message}`, severity: "major" }],
    };
  }
  const cells = Array.isArray(parsed.cells) ? parsed.cells : [];
  const cellSummaries = cells.map((cell, index) => inspectCell(cell, rel, index));
  const failures = cellSummaries.flatMap((cell) => cell.failures);
  return {
    path: rel,
    ok: failures.length === 0,
    cellCount: cells.length,
    executedCellCount: cellSummaries.filter((cell) => cell.executionCount !== null).length,
    errorCount: failures.length,
    failures,
  };
}

export function inspectNotebooks({ cwd = ".", notebooks = [] } = {}) {
  const reports = asArray(notebooks).map(String).map((path) => inspectNotebookFile({ cwd, path }));
  const failures = reports.flatMap((report) => report.failures);
  return {
    ok: failures.length === 0,
    notebooks: reports,
    failures,
    summary: reports.length === 0
      ? "No notebooks configured"
      : `Inspected ${reports.length} notebook(s); cell errors=${failures.filter((failure) => failure.id === "notebook-cell-error").length}`,
  };
}
