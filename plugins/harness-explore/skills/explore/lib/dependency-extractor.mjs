// Dependency extractor — regex-based import/export scanner for v1.
//
// Per-language scanners are intentionally small + transparent. They
// look for line-anchored statements (no multi-line parsing, no AST).
// Accuracy tradeoffs are documented in
// `references/design-notes.md`.
//
// Public contract:
//   languageOf(filePath) → "ts" | "py" | "rs" | "go" | null
//   extract(filePath, language) → { imports: string[], exports: string[] }
//     `imports` are RAW spec strings (e.g., "./session", "react",
//     "crate::auth"). Resolution to in-repo paths is a separate step
//     (see resolveRelative).
//   resolveRelative(rawImport, fromFile, opts?) → string | null
//     Returns an absolute path if the import can be resolved to an
//     in-repo file; null for bare-module / external imports.
//   scanTypeScript / scanPython / scanRust / scanGo — exported for
//     direct unit testing (each takes source text + returns
//     {imports, exports}).

import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname, join, isAbsolute, sep } from "node:path";

const EXT_TO_LANG = {
  ".ts": "ts", ".tsx": "ts", ".cts": "ts", ".mts": "ts",
  ".js": "ts", ".jsx": "ts", ".mjs": "ts", ".cjs": "ts",
  ".py": "py", ".pyi": "py",
  ".rs": "rs",
  ".go": "go",
};

export function languageOf(filePath) {
  return EXT_TO_LANG[extname(filePath)] ?? null;
}

const MAX_BYTES = 1024 * 1024; // skip files > 1 MB

export function extract(filePath, language) {
  if (!language) return { imports: [], exports: [] };
  if (!existsSync(filePath)) return { imports: [], exports: [], error: "not-found" };
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_BYTES) return { imports: [], exports: [], skipped: "too-large" };
  } catch {
    // fall through to read
  }
  let source;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (e) {
    return { imports: [], exports: [], error: e.message };
  }
  switch (language) {
    case "ts": return scanTypeScript(source);
    case "py": return scanPython(source);
    case "rs": return scanRust(source);
    case "go": return scanGo(source);
    default: return { imports: [], exports: [] };
  }
}

// ---------- TypeScript / JavaScript ----------
//
// Recognised forms (line-anchored, single-statement):
//   import X from "spec"
//   import { A, B } from "spec"
//   import * as ns from "spec"
//   import "spec"            (side-effect)
//   const X = require("spec")
//   export ... from "spec"   (re-export — both an export AND an import)
//
// Exports recognised:
//   export const|let|var|function|class|interface|type|enum NAME
//   export default function NAME?
//   export { A, B as C }
// Document limitations: dynamic `import()` not captured;
// `export * from "x"` captured as import only (no re-exported names).

const TS_IMPORT_RE = /^\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']\s*;?\s*$/gm;
const TS_REEXPORT_RE = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']\s*;?\s*$/gm;
const TS_REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

const TS_EXPORT_DECL_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const TS_EXPORT_NAMED_RE = /^\s*export\s*\{\s*([^}]+)\}\s*;?\s*$/gm;
const TS_EXPORT_DEFAULT_BARE_RE = /^\s*export\s+default\s+(?!function|class|async)/gm;

export function scanTypeScript(src) {
  const imports = new Set();
  const exports = new Set();

  // Strip line and block comments (very crude — see design-notes.md).
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  for (const m of stripped.matchAll(TS_IMPORT_RE)) imports.add(m[1]);
  for (const m of stripped.matchAll(TS_REEXPORT_RE)) imports.add(m[1]);
  for (const m of stripped.matchAll(TS_REQUIRE_RE)) imports.add(m[1]);

  for (const m of stripped.matchAll(TS_EXPORT_DECL_RE)) exports.add(m[1]);
  for (const m of stripped.matchAll(TS_EXPORT_NAMED_RE)) {
    for (const part of m[1].split(",")) {
      const cleaned = part.trim().split(/\s+as\s+/).pop().trim();
      if (cleaned) exports.add(cleaned);
    }
  }
  if (TS_EXPORT_DEFAULT_BARE_RE.test(stripped)) exports.add("default");
  // `export default function foo` / `export default class Foo`
  for (const m of stripped.matchAll(/^\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exports.add(m[1]);
    exports.add("default");
  }

  return { imports: [...imports], exports: [...exports] };
}

// ---------- Python ----------
//
// Recognised:
//   import a, b
//   import a.b as c
//   from a.b import c, d
//   from .rel import x
//   from ..rel import x
// Exports = top-level `def`, `class`, and bare assignments at column 0
// to ALL_CAPS or normal names. `__all__` is read if present.
// Limitation: dynamic __import__, importlib, conditional imports inside
// `if`/`try` blocks are still captured (regex doesn't care about scope).

const PY_IMPORT_RE = /^\s*import\s+([^\n#]+)/gm;
const PY_FROM_IMPORT_RE = /^\s*from\s+(\.+[A-Za-z0-9_.]*|[A-Za-z0-9_.]+)\s+import\s+/gm;
const PY_DEF_RE = /^def\s+([A-Za-z_][\w]*)\s*\(/gm;
const PY_CLASS_RE = /^class\s+([A-Za-z_][\w]*)\s*[(:]/gm;
const PY_ASSIGN_RE = /^([A-Z_][A-Z0-9_]*)\s*=/gm;
const PY_ALL_RE = /^__all__\s*=\s*\[([^\]]*)\]/m;

export function scanPython(src) {
  const imports = new Set();
  const exports = new Set();
  const stripped = src.replace(/^[ \t]*#.*$/gm, "");

  for (const m of stripped.matchAll(PY_IMPORT_RE)) {
    // "import a, b.c as d, e"
    for (const item of m[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/)[0].trim();
      if (name) imports.add(name);
    }
  }
  for (const m of stripped.matchAll(PY_FROM_IMPORT_RE)) {
    imports.add(m[1]);
  }
  for (const m of stripped.matchAll(PY_DEF_RE)) exports.add(m[1]);
  for (const m of stripped.matchAll(PY_CLASS_RE)) exports.add(m[1]);
  for (const m of stripped.matchAll(PY_ASSIGN_RE)) exports.add(m[1]);

  const allMatch = stripped.match(PY_ALL_RE);
  if (allMatch) {
    for (const part of allMatch[1].split(",")) {
      const name = part.trim().replace(/^["']|["']$/g, "");
      if (name) exports.add(name);
    }
  }

  return { imports: [...imports], exports: [...exports] };
}

// ---------- Rust ----------
//
// Recognised:
//   use crate::foo::bar;
//   use super::baz;
//   use self::x;
//   use external_crate::module::Item;
//   use a::b::{c, d};
// v1 returns the FULL use-path as the import string. Resolution to a
// file path is best-effort (resolveRelative handles `crate::` and
// `super::` against a Cargo workspace root if detectable; otherwise
// returns null).
// Exports: `pub fn`, `pub struct`, `pub enum`, `pub mod`, `pub trait`,
//          `pub const`, `pub type`.

const RS_USE_RE = /^\s*(?:pub\s+)?use\s+([^;]+);/gm;
const RS_PUB_RE = /^\s*pub\s+(?:async\s+)?(?:unsafe\s+)?(fn|struct|enum|mod|trait|const|static|type)\s+([A-Za-z_][\w]*)/gm;

export function scanRust(src) {
  const imports = new Set();
  const exports = new Set();
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  for (const m of stripped.matchAll(RS_USE_RE)) {
    const path = m[1].trim().replace(/\s+/g, " ");
    imports.add(path);
  }
  for (const m of stripped.matchAll(RS_PUB_RE)) {
    exports.add(m[2]);
  }

  return { imports: [...imports], exports: [...exports] };
}

// ---------- Go ----------
//
// Recognised:
//   import "fmt"
//   import alias "fmt"
//   import (
//     "fmt"
//     alias "github.com/x/y"
//   )
// Exports = capitalised top-level identifiers in func / type / const / var.
// Limitation: build-tag-gated imports and `cgo` blocks are captured
// verbatim; the caller resolves them as best-effort.

const GO_IMPORT_SINGLE_RE = /^\s*import\s+(?:[A-Za-z_]\w*\s+)?["']([^"']+)["']/gm;
const GO_IMPORT_BLOCK_RE = /^\s*import\s*\(\s*([\s\S]*?)\)/gm;
const GO_FUNC_RE = /^\s*func\s+(?:\([^)]*\)\s+)?([A-Z][\w]*)\s*\(/gm;
const GO_TYPE_RE = /^\s*type\s+([A-Z][\w]*)\s+/gm;
const GO_CONST_RE = /^\s*(?:const|var)\s+([A-Z][\w]*)\s+/gm;

export function scanGo(src) {
  const imports = new Set();
  const exports = new Set();
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  for (const m of stripped.matchAll(GO_IMPORT_SINGLE_RE)) {
    imports.add(m[1]);
  }
  for (const m of stripped.matchAll(GO_IMPORT_BLOCK_RE)) {
    const body = m[1];
    for (const line of body.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("//")) continue;
      const sm = t.match(/^(?:[A-Za-z_]\w*\s+|_\s+|\.\s+)?["']([^"']+)["']/);
      if (sm) imports.add(sm[1]);
    }
  }
  for (const m of stripped.matchAll(GO_FUNC_RE)) exports.add(m[1]);
  for (const m of stripped.matchAll(GO_TYPE_RE)) exports.add(m[1]);
  for (const m of stripped.matchAll(GO_CONST_RE)) exports.add(m[1]);

  return { imports: [...imports], exports: [...exports] };
}

// ---------- resolution ----------
//
// Best-effort resolver. Returns the absolute path of an in-repo file
// if the import looks resolvable; otherwise null (bare module / external).
//
// Inputs:
//   rawImport — the import string returned by extract()
//   fromFile  — absolute path of the importing file
//   opts.tsconfigPaths — optional { "@app/*": ["src/*"] } map for TS
//   opts.repoRoot — absolute repo root (for `crate::` style resolution)
//
// Supported resolutions:
//   - "./x", "../x" → resolve relative to fromFile's dir; try common
//     extensions (.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.rs/.go) and
//     /index.<ext>.
//   - TS path aliases (single trailing `*` form only).
//   - Python "from .rel import x" → relative based on dot depth.
//   - Anything else (bare specifier, URL, etc) → null.

const TS_TRY_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts"];
const PY_TRY_EXTS = [".py", ".pyi"];
const RS_TRY_EXTS = [".rs"];
const GO_TRY_EXTS = [".go"];

function tryWithExts(base, exts) {
  for (const ext of exts) {
    const p = `${base}${ext}`;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  // index file in folder
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of exts) {
      const p = join(base, `index${ext}`);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return null;
}

function isRelative(spec) {
  return spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..";
}

function resolveTsAlias(spec, paths, repoRoot) {
  if (!paths || !repoRoot) return null;
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!pattern.endsWith("*")) {
      if (spec === pattern && targets[0]) {
        return resolve(repoRoot, targets[0]);
      }
      continue;
    }
    const prefix = pattern.slice(0, -1);
    if (spec.startsWith(prefix) && targets[0]?.endsWith("*")) {
      const rest = spec.slice(prefix.length);
      const target = targets[0].slice(0, -1) + rest;
      const abs = resolve(repoRoot, target);
      return tryWithExts(abs, TS_TRY_EXTS) ?? abs;
    }
  }
  return null;
}

export function resolveRelative(rawImport, fromFile, opts = {}) {
  if (!rawImport || typeof rawImport !== "string") return null;
  const fromDir = dirname(fromFile);
  const ext = extname(fromFile);
  const lang = EXT_TO_LANG[ext] ?? null;

  // TS / JS
  if (lang === "ts") {
    if (isRelative(rawImport)) {
      const base = resolve(fromDir, rawImport);
      return tryWithExts(base, TS_TRY_EXTS);
    }
    if (opts.tsconfigPaths && opts.repoRoot) {
      const aliasResolved = resolveTsAlias(rawImport, opts.tsconfigPaths, opts.repoRoot);
      if (aliasResolved) return aliasResolved;
    }
    return null;
  }

  // Python
  if (lang === "py") {
    if (rawImport.startsWith(".")) {
      // count leading dots
      let dots = 0;
      while (rawImport[dots] === ".") dots++;
      const rest = rawImport.slice(dots).replace(/\./g, sep);
      let base = fromDir;
      for (let i = 1; i < dots; i++) base = dirname(base);
      const target = rest ? join(base, rest) : base;
      return tryWithExts(target, PY_TRY_EXTS);
    }
    return null;
  }

  // Rust
  if (lang === "rs") {
    if (!opts.repoRoot) return null;
    // Extract head of the path before `::{...}` or first `::`.
    const head = rawImport.split("::")[0];
    if (head === "crate") {
      const rest = rawImport.split("::").slice(1).join(sep).replace(/\{.*\}/, "");
      const target = resolve(opts.repoRoot, "src", rest);
      return tryWithExts(target, RS_TRY_EXTS);
    }
    if (head === "super" || head === "self") {
      // Best-effort: walk up from fromDir.
      const segs = rawImport.split("::");
      let base = fromDir;
      for (const s of segs) {
        if (s === "super") base = dirname(base);
        else if (s === "self") continue;
        else base = join(base, s);
      }
      return tryWithExts(base, RS_TRY_EXTS);
    }
    return null;
  }

  // Go — modules are typically resolved by import path, which is
  // module-namespaced. v1: only support same-module relative-style
  // imports if `opts.goModulePath` is provided.
  if (lang === "go") {
    if (opts.goModulePath && opts.repoRoot && rawImport.startsWith(opts.goModulePath + "/")) {
      const rest = rawImport.slice(opts.goModulePath.length + 1);
      const target = resolve(opts.repoRoot, rest);
      // Go imports a package (directory). Find any .go file in it.
      if (existsSync(target) && statSync(target).isDirectory()) {
        return target;
      }
      return tryWithExts(target, GO_TRY_EXTS);
    }
    return null;
  }

  return null;
}
