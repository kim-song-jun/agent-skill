import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DESTRUCTIVE_SQL_PATTERN = /\b(alter|create|delete|drop|grant|insert|merge|reindex|replace|revoke|truncate|update|vacuum)\b/i;

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripSqlComments(sql) {
  return String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

export function containsDestructiveSql(sql) {
  return DESTRUCTIVE_SQL_PATTERN.test(stripSqlComments(sql));
}

export function readSqlInputs({ cwd = ".", files = [], queries = [] } = {}) {
  const fileEntries = asArray(files).map(String).map((file) => {
    const abs = resolve(cwd, file);
    if (!existsSync(abs)) return { source: file, sql: "", missing: true };
    try {
      return { source: file, sql: readFileSync(abs, "utf-8"), missing: false };
    } catch (error) {
      return { source: file, sql: "", missing: true, error: error.message };
    }
  });
  const queryEntries = asArray(queries).map(String).map((query, index) => ({
    source: `inline-query-${index + 1}`,
    sql: query,
    missing: false,
  }));
  return [...fileEntries, ...queryEntries];
}

export function validateSqlSafety({ cwd = ".", files = [], queries = [], allowDestructive = false } = {}) {
  const entries = readSqlInputs({ cwd, files, queries });
  const failures = [];
  for (const entry of entries) {
    if (entry.missing) {
      failures.push({
        id: "sql-file-missing",
        message: `SQL input unavailable: ${entry.source}${entry.error ? ` (${entry.error})` : ""}`,
        severity: "major",
      });
      continue;
    }
    if (!allowDestructive && containsDestructiveSql(entry.sql)) {
      failures.push({
        id: "destructive-sql",
        message: `Destructive SQL detected in ${entry.source}; set allowDestructive=true only with explicit approval`,
        severity: "critical",
      });
    }
  }
  return {
    ok: failures.length === 0,
    entries,
    failures,
    destructiveSources: entries
      .filter((entry) => !entry.missing && containsDestructiveSql(entry.sql))
      .map((entry) => entry.source),
  };
}

function parseJsonCandidate(text) {
  const body = String(text ?? "").trim();
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // Some runners emit a final JSON line after logs.
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

export function parseSqlRunnerResult(stdout) {
  const parsed = parseJsonCandidate(stdout);
  if (!parsed) return null;
  return {
    assertions: asArray(parsed.assertions).filter(isPlainObject),
    rowCount: parsed.rowCount ?? parsed.row_count,
    rowCounts: isPlainObject(parsed.rowCounts) ? parsed.rowCounts : {},
    schema: parsed.schema,
    schemas: isPlainObject(parsed.schemas) ? parsed.schemas : {},
    nullCounts: isPlainObject(parsed.nullCounts) ? parsed.nullCounts : {},
    duplicateCounts: isPlainObject(parsed.duplicateCounts) ? parsed.duplicateCounts : {},
    outlierCounts: isPlainObject(parsed.outlierCounts) ? parsed.outlierCounts : {},
    explainPlan: parsed.explainPlan ?? parsed.explain,
    explainPlanPath: parsed.explainPlanPath ?? parsed.explainPath,
    artifacts: asArray(parsed.artifacts).map(String),
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    metadata: isPlainObject(parsed.metadata) ? parsed.metadata : null,
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valueForAssertion(assertion, runnerResult = {}) {
  if (assertion.actual !== undefined) return assertion.actual;
  const key = assertion.key ?? assertion.id ?? assertion.name;
  switch (assertion.type) {
    case "row-count":
      return key && runnerResult.rowCounts ? runnerResult.rowCounts[key] ?? runnerResult.rowCount : runnerResult.rowCount;
    case "schema":
      return key && runnerResult.schemas ? runnerResult.schemas[key] ?? runnerResult.schema : runnerResult.schema;
    case "null-count":
      return runnerResult.nullCounts?.[key] ?? null;
    case "duplicate-count":
      return runnerResult.duplicateCounts?.[key] ?? null;
    case "outlier-count":
      return runnerResult.outlierCounts?.[key] ?? null;
    default:
      return assertion.actual;
  }
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => String(value) === String(right[index]));
}

function assertionFailure(assertion, actual, index) {
  const id = String(assertion.id ?? assertion.name ?? `${assertion.type || "assertion"}-${index + 1}`);
  return {
    id: "sql-assertion-failed",
    message: `${id} failed: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(assertion.expected ?? { min: assertion.min, max: assertion.max })}`,
    severity: assertion.severity ?? "major",
  };
}

export function evaluateSqlAssertions(assertions = [], runnerResult = {}) {
  const normalized = asArray(assertions).filter(isPlainObject);
  const results = normalized.map((assertion, index) => {
    const id = String(assertion.id ?? assertion.name ?? `${assertion.type || "assertion"}-${index + 1}`);
    if (typeof assertion.passed === "boolean") {
      return {
        id,
        type: assertion.type ?? "runner",
        passed: assertion.passed,
        message: assertion.message,
        failure: assertion.passed ? null : {
          id: "sql-runner-assertion-failed",
          message: assertion.message || `${id} failed in SQL runner output`,
          severity: assertion.severity ?? "major",
        },
      };
    }
    const actual = valueForAssertion(assertion, runnerResult);
    let passed = true;
    if (assertion.type === "schema") {
      passed = arraysEqual(actual, assertion.expected);
    } else {
      const numeric = numberOrNull(actual);
      if (numeric == null) passed = false;
      else if (assertion.expected !== undefined) passed = numeric === Number(assertion.expected);
      else if (assertion.min !== undefined && numeric < Number(assertion.min)) passed = false;
      else if (assertion.max !== undefined && numeric > Number(assertion.max)) passed = false;
      else if ((assertion.type === "null-count" || assertion.type === "duplicate-count" || assertion.type === "outlier-count") && assertion.max === undefined) {
        passed = numeric === 0;
      }
    }
    return {
      id,
      type: assertion.type ?? "value",
      actual,
      expected: assertion.expected,
      min: assertion.min,
      max: assertion.max,
      passed,
      failure: passed ? null : assertionFailure(assertion, actual, index),
    };
  });
  const failures = results.map((result) => result.failure).filter(Boolean);
  return { ok: failures.length === 0, assertions: results, failures };
}

export function validateSqlPlan({
  cwd = ".",
  files = [],
  queries = [],
  assertions = [],
  allowDestructive = false,
  runnerResult = null,
} = {}) {
  const safety = validateSqlSafety({ cwd, files, queries, allowDestructive });
  const runnerAssertions = runnerResult?.assertions ?? [];
  const assertionResult = evaluateSqlAssertions([...asArray(assertions), ...runnerAssertions], runnerResult ?? {});
  const failures = [...safety.failures, ...assertionResult.failures];
  return {
    ok: failures.length === 0,
    failures,
    safety,
    assertions: assertionResult.assertions,
    destructiveSources: safety.destructiveSources,
  };
}
