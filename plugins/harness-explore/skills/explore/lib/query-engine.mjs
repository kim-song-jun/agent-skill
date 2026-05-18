// Query engine — `/explore where <symbol>` + `/explore deps <file>`.
//
// All queries operate on a loaded map (the JSON parsed from
// `.explore-cache/<sha>.json`). The caller is responsible for cache
// hydration (see cache-store.mjs).
//
// Contracts:
//   where(map, symbol, opts?)
//     → { matches: [{file, kind, line?, source}], fallback: "exports"|"symbols"|"fuzzy"|"ripgrep"|null }
//     `source` indicates which pass produced the match.
//
//   deps(map, file)
//     → { ok: true, imports: [...], importedBy: [...] }
//     | { ok: false, reason: "not-in-map" | "no-dep-graph" }
//
//   summarize(map, opts?)
//     → string (token-bounded structural summary suitable for system
//       prompt injection). `opts.maxBytes` defaults to ~4096.
//
// `where`'s ripgrep fallback is OPTIONAL — callers pass
// `opts.ripgrep: (symbol) => [{file, line, context}]` if they want it.
// The query engine itself does NOT shell out (kept pure for tests).

const FUZZY_MAX_DISTANCE = 2;

function* iterEntries(map) {
  if (!map || !Array.isArray(map.dirs)) return;
  for (const dir of map.dirs) {
    if (!dir || !Array.isArray(dir.entries)) continue;
    for (const e of dir.entries) yield e;
  }
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > FUZZY_MAX_DISTANCE) return FUZZY_MAX_DISTANCE + 1;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

export function where(map, symbol, opts = {}) {
  if (!symbol || typeof symbol !== "string") {
    return { matches: [], fallback: null };
  }

  // Pass 1 — exact in exports.
  const passExports = [];
  for (const e of iterEntries(map)) {
    if (Array.isArray(e.exports) && e.exports.includes(symbol)) {
      passExports.push({ file: e.path, kind: e.kind ?? "module", source: "exports" });
    }
  }
  if (passExports.length > 0) return { matches: passExports, fallback: "exports" };

  // Pass 2 — exact in symbols[].name.
  const passSymbols = [];
  for (const e of iterEntries(map)) {
    if (!Array.isArray(e.symbols)) continue;
    for (const s of e.symbols) {
      if (s && s.name === symbol) {
        passSymbols.push({ file: e.path, kind: s.kind ?? e.kind ?? "module", line: s.line, source: "symbols" });
      }
    }
  }
  if (passSymbols.length > 0) return { matches: passSymbols, fallback: "symbols" };

  // Pass 3 — fuzzy (Levenshtein ≤ 2) against exports + symbols.
  const passFuzzy = [];
  for (const e of iterEntries(map)) {
    for (const exp of e.exports ?? []) {
      if (levenshtein(exp, symbol) <= FUZZY_MAX_DISTANCE) {
        passFuzzy.push({ file: e.path, kind: e.kind ?? "module", source: "fuzzy", suggested: exp });
      }
    }
    for (const s of e.symbols ?? []) {
      if (s && levenshtein(s.name, symbol) <= FUZZY_MAX_DISTANCE) {
        passFuzzy.push({ file: e.path, kind: s.kind ?? e.kind ?? "module", line: s.line, source: "fuzzy", suggested: s.name });
      }
    }
  }
  if (passFuzzy.length > 0) return { matches: passFuzzy, fallback: "fuzzy" };

  // Pass 4 — optional ripgrep fallback (caller-injected).
  if (typeof opts.ripgrep === "function") {
    const rg = opts.ripgrep(symbol) ?? [];
    return {
      matches: rg.map((r) => ({ file: r.file, kind: "literal", line: r.line, context: r.context, source: "ripgrep" })),
      fallback: "ripgrep",
    };
  }

  return { matches: [], fallback: null };
}

function normalisePath(p) {
  if (!p) return "";
  return p.replace(/\\/g, "/");
}

export function deps(map, file) {
  if (!file || typeof file !== "string") {
    return { ok: false, reason: "no-file" };
  }
  if (!map || !map.depGraph || map.depGraph.skipped) {
    return { ok: false, reason: "no-dep-graph" };
  }
  const want = normalisePath(file);
  const imports = map.depGraph.imports?.[want];
  const importedBy = map.depGraph.importedBy?.[want];
  if (imports === undefined && importedBy === undefined) {
    // Could still be a file present in the map (no edges either way).
    let foundInMap = false;
    for (const e of iterEntries(map)) {
      if (normalisePath(e.path) === want) { foundInMap = true; break; }
    }
    if (!foundInMap) return { ok: false, reason: "not-in-map" };
  }
  return {
    ok: true,
    imports: imports ?? [],
    importedBy: importedBy ?? [],
  };
}

export function summarize(map, opts = {}) {
  const maxBytes = opts.maxBytes ?? 4096;
  if (!map) return "";
  const lines = [];
  lines.push(`# Codebase map (sha=${(map.sha ?? "?").slice(0, 8)})`);
  lines.push(`- ${map.totalFiles ?? 0} files, ${map.totalLines ?? 0} lines, ${(map.dirs ?? []).length} top-level dirs`);
  const langs = Object.entries(map.languages ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  if (langs) lines.push(`- languages: ${langs}`);
  if ((map.publicEntryPoints ?? []).length) {
    lines.push(`- entry points: ${map.publicEntryPoints.slice(0, 8).join(", ")}`);
  }
  lines.push("");
  for (const d of map.dirs ?? []) {
    if (d.incomplete) {
      lines.push(`- ${d.dir}/ (INCOMPLETE: ${d.reason ?? "unknown"})`);
      continue;
    }
    const purpose = (d.purpose ?? "").split(/\r?\n/)[0].slice(0, 120);
    lines.push(`- ${d.dir}/ (${d.fileCount ?? 0} files): ${purpose}`);
    if (Buffer.byteLength(lines.join("\n"), "utf-8") > maxBytes) {
      lines.push(`- ...(${(map.dirs.length ?? 0)} dirs total; summary truncated)`);
      break;
    }
  }
  const out = lines.join("\n");
  if (Buffer.byteLength(out, "utf-8") <= maxBytes) return out;
  // Hard truncate as a last resort.
  return out.slice(0, maxBytes - 20) + "\n...(truncated)";
}
