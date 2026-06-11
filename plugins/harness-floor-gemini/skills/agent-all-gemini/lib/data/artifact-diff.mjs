import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function toRel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statInfo(path) {
  try {
    const stat = statSync(path);
    return { bytes: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function splitLines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function splitCsvLine(line, delimiter = ",") {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        quoted = false;
        continue;
      }
      cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells.map((entry) => entry.trim());
}

function csvShape(text, delimiter = ",") {
  const rows = splitLines(text).filter((line) => line.trim().length > 0);
  if (rows.length === 0) {
    return { kind: "csv", rows: 0, columns: 0, columnNames: [] };
  }
  const header = splitCsvLine(rows[0], delimiter);
  return {
    kind: delimiter === "\t" ? "tsv" : "csv",
    rows: Math.max(0, rows.length - 1),
    columns: header.length,
    columnNames: header,
  };
}

function jsonShape(value) {
  if (Array.isArray(value)) {
    const sample = value.find((entry) => isPlainObject(entry));
    return {
      kind: "json-array",
      rows: value.length,
      columns: sample ? Object.keys(sample).length : null,
      columnNames: sample ? Object.keys(sample).sort() : [],
    };
  }
  if (isPlainObject(value)) {
    return {
      kind: "json-object",
      rows: null,
      columns: Object.keys(value).length,
      columnNames: Object.keys(value).sort(),
    };
  }
  return { kind: "json-scalar", rows: null, columns: null, columnNames: [] };
}

export function readArtifactShape({ cwd = ".", path, type = null } = {}) {
  const rel = toRel(path);
  if (!rel) {
    return { ok: false, path: rel, error: "artifact path is required" };
  }
  const abs = resolve(cwd, rel);
  if (!existsSync(abs)) {
    return { ok: false, path: rel, error: "artifact missing" };
  }
  const ext = String(type || extname(rel).slice(1)).toLowerCase();
  const info = statInfo(abs);
  try {
    if (ext === "csv" || ext === "tsv") {
      return {
        ok: true,
        path: rel,
        ...csvShape(readFileSync(abs, "utf-8"), ext === "tsv" ? "\t" : ","),
        ...info,
      };
    }
    if (ext === "json" || ext === "jsonl") {
      if (ext === "jsonl") {
        const rows = splitLines(readFileSync(abs, "utf-8")).filter((line) => line.trim()).map((line) => JSON.parse(line));
        return { ok: true, path: rel, ...jsonShape(rows), ...info };
      }
      return { ok: true, path: rel, ...jsonShape(JSON.parse(readFileSync(abs, "utf-8"))), ...info };
    }
    if (ext === "parquet") {
      return { ok: true, path: rel, kind: "parquet", rows: null, columns: null, columnNames: [], ...info };
    }
    return { ok: true, path: rel, kind: ext || "file", rows: null, columns: null, columnNames: [], ...info };
  } catch (error) {
    return { ok: false, path: rel, error: error.message };
  }
}

function compareArrays(actual = [], expected = []) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function compareShapePair(pair, cwd) {
  const baseline = readArtifactShape({ cwd, path: pair.baseline, type: pair.type });
  const current = readArtifactShape({ cwd, path: pair.current, type: pair.type });
  const failures = [];
  if (!baseline.ok) {
    failures.push({
      id: "artifact-baseline-missing",
      message: `Baseline artifact unavailable: ${pair.baseline}${baseline.error ? ` (${baseline.error})` : ""}`,
      severity: "major",
    });
  }
  if (!current.ok) {
    failures.push({
      id: "artifact-current-missing",
      message: `Current artifact unavailable: ${pair.current}${current.error ? ` (${current.error})` : ""}`,
      severity: "major",
    });
  }
  if (!baseline.ok || !current.ok) return { baseline, current, failures };

  if (baseline.kind !== current.kind) {
    failures.push({
      id: "artifact-kind-diff",
      message: `${pair.current} kind ${current.kind} differs from baseline ${baseline.kind}`,
      severity: "major",
    });
  }
  const allowRowDelta = Number.isFinite(pair.allowRowDelta) ? Math.abs(pair.allowRowDelta) : 0;
  if (Number.isFinite(baseline.rows) && Number.isFinite(current.rows) && Math.abs(current.rows - baseline.rows) > allowRowDelta) {
    failures.push({
      id: "artifact-row-diff",
      message: `${pair.current} row count ${current.rows} differs from baseline ${baseline.rows}`,
      severity: "major",
    });
  }
  const allowColumnDelta = Number.isFinite(pair.allowColumnDelta) ? Math.abs(pair.allowColumnDelta) : 0;
  if (Number.isFinite(baseline.columns) && Number.isFinite(current.columns) && Math.abs(current.columns - baseline.columns) > allowColumnDelta) {
    failures.push({
      id: "artifact-column-count-diff",
      message: `${pair.current} column count ${current.columns} differs from baseline ${baseline.columns}`,
      severity: "major",
    });
  }
  if (baseline.columnNames?.length || current.columnNames?.length) {
    const checkNames = pair.checkColumnNames !== false;
    if (checkNames && !compareArrays(current.columnNames, baseline.columnNames)) {
      failures.push({
        id: "artifact-column-name-diff",
        message: `${pair.current} column names differ from baseline`,
        severity: "major",
      });
    }
  }
  return { baseline, current, failures };
}

function jsonValueAt(value, pointer) {
  if (!pointer || pointer === ".") return value;
  const parts = String(pointer).startsWith("/")
    ? String(pointer).slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    : String(pointer).split(".");
  let cursor = value;
  for (const part of parts.filter((entry) => entry.length > 0)) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function metricActual(metric, cwd) {
  if (Number.isFinite(metric.actual)) return metric.actual;
  const rel = toRel(metric.path);
  if (!rel) return null;
  try {
    const parsed = JSON.parse(readFileSync(resolve(cwd, rel), "utf-8"));
    const value = jsonValueAt(parsed, metric.jsonPointer ?? metric.jsonPath ?? metric.pathInJson ?? metric.key);
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function compareMetric(metric, cwd, index) {
  const id = toRel(metric.id) || `metric-${index + 1}`;
  const actual = metricActual(metric, cwd);
  const tolerance = Number.isFinite(metric.tolerance) ? Math.abs(metric.tolerance) : 0;
  const failures = [];
  if (actual == null) {
    failures.push({ id: "metric-missing", message: `${id} metric value is missing or non-numeric`, severity: "major" });
  } else if (Number.isFinite(metric.expected) && Math.abs(actual - metric.expected) > tolerance) {
    failures.push({ id: "metric-expected-diff", message: `${id}=${actual} differs from expected ${metric.expected}`, severity: "major" });
  } else if (Number.isFinite(metric.min) && actual < metric.min) {
    failures.push({ id: "metric-min", message: `${id}=${actual} is below min ${metric.min}`, severity: "major" });
  } else if (Number.isFinite(metric.max) && actual > metric.max) {
    failures.push({ id: "metric-max", message: `${id}=${actual} exceeds max ${metric.max}`, severity: "major" });
  }
  return { id, actual, expected: metric.expected, min: metric.min, max: metric.max, failures };
}

function normalizePairs(input = {}) {
  const config = isPlainObject(input) ? input : {};
  const explicit = asArray(config.pairs ?? config.artifacts);
  const fromDirs = [];
  if (config.baselineDir && config.currentDir) {
    for (const file of asArray(config.files ?? config.compare)) {
      fromDirs.push({
        baseline: `${String(config.baselineDir).replace(/\/$/, "")}/${file}`,
        current: `${String(config.currentDir).replace(/\/$/, "")}/${file}`,
        type: config.type,
        allowRowDelta: config.allowRowDelta,
        allowColumnDelta: config.allowColumnDelta,
        checkColumnNames: config.checkColumnNames,
      });
    }
  }
  return [...explicit, ...fromDirs]
    .filter(isPlainObject)
    .map((pair) => ({
      baseline: toRel(pair.baseline ?? pair.before),
      current: toRel(pair.current ?? pair.after ?? pair.path),
      type: pair.type,
      allowRowDelta: Number.isFinite(pair.allowRowDelta) ? pair.allowRowDelta : config.allowRowDelta,
      allowColumnDelta: Number.isFinite(pair.allowColumnDelta) ? pair.allowColumnDelta : config.allowColumnDelta,
      checkColumnNames: pair.checkColumnNames ?? config.checkColumnNames,
    }))
    .filter((pair) => pair.baseline && pair.current);
}

export function compareArtifacts({
  cwd = ".",
  requiredArtifacts = [],
  artifactDiff = null,
} = {}) {
  const config = isPlainObject(artifactDiff) ? artifactDiff : Array.isArray(artifactDiff) ? { pairs: artifactDiff } : {};
  const required = [
    ...asArray(requiredArtifacts).map(String),
    ...asArray(config.requiredArtifacts).map(String),
    ...asArray(config.reports).map(String),
  ].filter(Boolean);
  const artifacts = new Set(required);
  const failures = [];
  const requiredSummary = required.map((path) => {
    const exists = existsSync(resolve(cwd, path));
    if (!exists) {
      failures.push({ id: "artifact-missing", message: `Missing required artifact: ${path}`, severity: "major" });
    }
    return { path, exists };
  });

  const pairs = normalizePairs(config);
  const diffs = pairs.map((pair) => {
    artifacts.add(pair.baseline);
    artifacts.add(pair.current);
    return { pair, ...compareShapePair(pair, cwd) };
  });
  for (const diff of diffs) failures.push(...diff.failures);

  const metrics = asArray(config.metrics).filter(isPlainObject).map((metric, index) => compareMetric(metric, cwd, index));
  for (const metric of metrics) failures.push(...metric.failures);

  const checkedCount = required.length + pairs.length + metrics.length;
  return {
    ok: failures.length === 0,
    summary: checkedCount === 0
      ? "No artifact diff checks configured"
      : `Artifact diff checked ${checkedCount} item(s)`,
    artifacts: [...artifacts],
    failures,
    metadata: {
      requiredArtifacts: requiredSummary,
      diffs,
      metrics,
    },
  };
}
