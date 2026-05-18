import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  languageOf,
  extract,
  resolveRelative,
  scanTypeScript,
  scanPython,
  scanRust,
  scanGo,
} from "../../plugins/harness-explore/skills/explore/lib/dependency-extractor.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "explore-dep-"));
}

// ---------- languageOf ----------

test("languageOf: recognises common extensions", () => {
  assert.equal(languageOf("a.ts"), "ts");
  assert.equal(languageOf("a.tsx"), "ts");
  assert.equal(languageOf("a.js"), "ts");
  assert.equal(languageOf("a.py"), "py");
  assert.equal(languageOf("a.rs"), "rs");
  assert.equal(languageOf("a.go"), "go");
  assert.equal(languageOf("a.md"), null);
  assert.equal(languageOf("README"), null);
});

// ---------- TypeScript ----------

test("scanTypeScript: imports — default, named, namespace, side-effect, require, re-export", () => {
  const src = `
import foo from "./foo";
import { bar, baz as bz } from "./bar";
import * as ns from "lodash";
import "./side-effect";
const x = require("./req");
export { qux } from "./qux";
export * from "./star";
`;
  const r = scanTypeScript(src);
  assert.deepEqual(r.imports.sort(), ["./bar", "./foo", "./qux", "./req", "./side-effect", "./star", "lodash"]);
});

test("scanTypeScript: exports — declarations, named, default", () => {
  const src = `
export const A = 1;
export function foo() {}
export class Bar {}
export interface Iface {}
export type T = number;
export { x, y as z };
export default function main() {}
`;
  const r = scanTypeScript(src);
  assert.ok(r.exports.includes("A"));
  assert.ok(r.exports.includes("foo"));
  assert.ok(r.exports.includes("Bar"));
  assert.ok(r.exports.includes("Iface"));
  assert.ok(r.exports.includes("T"));
  assert.ok(r.exports.includes("x"));
  assert.ok(r.exports.includes("z"));
  assert.ok(r.exports.includes("main"));
  assert.ok(r.exports.includes("default"));
});

test("scanTypeScript: ignores commented-out imports", () => {
  const src = `
// import { ignored } from "./nope";
/* import foo from "./also-nope"; */
import real from "./real";
`;
  const r = scanTypeScript(src);
  assert.deepEqual(r.imports, ["./real"]);
});

// ---------- Python ----------

test("scanPython: import + from-import (relative + absolute)", () => {
  const src = `
import os
import sys as system
from os.path import join, dirname
from .rel import x
from ..parent_rel import y
`;
  const r = scanPython(src);
  assert.ok(r.imports.includes("os"));
  assert.ok(r.imports.includes("sys"));
  assert.ok(r.imports.includes("os.path"));
  assert.ok(r.imports.includes(".rel"));
  assert.ok(r.imports.includes("..parent_rel"));
});

test("scanPython: exports — def, class, ALL_CAPS, __all__", () => {
  const src = `
def foo():
    pass

class Bar:
    pass

CONST_X = 1
not_exported = 2

__all__ = ["foo", "Bar", "extra"]
`;
  const r = scanPython(src);
  assert.ok(r.exports.includes("foo"));
  assert.ok(r.exports.includes("Bar"));
  assert.ok(r.exports.includes("CONST_X"));
  assert.ok(r.exports.includes("extra"), "__all__ entries are exports");
  assert.ok(!r.exports.includes("not_exported"));
});

// ---------- Rust ----------

test("scanRust: use declarations + pub items", () => {
  const src = `
use crate::auth::session;
use super::helpers::*;
use std::collections::{HashMap, HashSet};

pub fn create_session() {}
pub struct Session { id: String }
pub enum AuthError { Denied }
pub mod sub_mod;
pub trait Authenticator {}
pub const MAX: usize = 10;
pub type Result<T> = std::result::Result<T, AuthError>;

fn private_fn() {}
`;
  const r = scanRust(src);
  assert.ok(r.imports.some((s) => s.includes("crate::auth::session")));
  assert.ok(r.imports.some((s) => s.includes("super::helpers")));
  assert.ok(r.imports.some((s) => s.includes("std::collections")));
  assert.ok(r.exports.includes("create_session"));
  assert.ok(r.exports.includes("Session"));
  assert.ok(r.exports.includes("AuthError"));
  assert.ok(r.exports.includes("sub_mod"));
  assert.ok(r.exports.includes("Authenticator"));
  assert.ok(r.exports.includes("MAX"));
  assert.ok(r.exports.includes("Result"));
  assert.ok(!r.exports.includes("private_fn"));
});

// ---------- Go ----------

test("scanGo: single + block imports + capitalised top-level identifiers", () => {
  const src = `
package auth

import "fmt"
import json "encoding/json"
import (
    "os"
    rt "runtime"
    // line comment inside import block
    "github.com/foo/bar"
)

func CreateSession() {}
func privateHelper() {}

type Session struct {}
const MaxRetries = 3
var DefaultTimeout = 30
`;
  const r = scanGo(src);
  assert.ok(r.imports.includes("fmt"));
  assert.ok(r.imports.includes("encoding/json"));
  assert.ok(r.imports.includes("os"));
  assert.ok(r.imports.includes("runtime"));
  assert.ok(r.imports.includes("github.com/foo/bar"));
  assert.ok(r.exports.includes("CreateSession"));
  assert.ok(!r.exports.includes("privateHelper"));
  assert.ok(r.exports.includes("Session"));
  assert.ok(r.exports.includes("MaxRetries"));
  assert.ok(r.exports.includes("DefaultTimeout"));
});

// ---------- Malformed source graceful fail ----------

test("extract: malformed file → empty arrays (no throw)", () => {
  const root = tmp();
  try {
    const p = join(root, "weird.ts");
    writeFileSync(p, "this is not valid TS at all <<<>>>{{{");
    const r = extract(p, "ts");
    assert.ok(Array.isArray(r.imports));
    assert.ok(Array.isArray(r.exports));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extract: nonexistent file → error field, no throw", () => {
  const r = extract("/tmp/definitely-not-here.ts", "ts");
  assert.equal(r.error, "not-found");
  assert.deepEqual(r.imports, []);
});

// ---------- resolveRelative ----------

test("resolveRelative: TS relative './foo' → resolves to .ts file in sibling", () => {
  const root = tmp();
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "session.ts"), "//");
    writeFileSync(join(root, "src", "index.ts"), "//");
    const resolved = resolveRelative("./session", join(root, "src", "index.ts"));
    assert.equal(resolved, resolve(root, "src", "session.ts"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveRelative: bare module specifier → null (external)", () => {
  const root = tmp();
  try {
    writeFileSync(join(root, "a.ts"), "//");
    assert.equal(resolveRelative("react", join(root, "a.ts")), null);
    assert.equal(resolveRelative("@scope/pkg", join(root, "a.ts")), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveRelative: TS folder import → resolves to index.ts", () => {
  const root = tmp();
  try {
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    writeFileSync(join(root, "src", "utils", "index.ts"), "//");
    writeFileSync(join(root, "src", "a.ts"), "//");
    const resolved = resolveRelative("./utils", join(root, "src", "a.ts"));
    assert.equal(resolved, resolve(root, "src", "utils", "index.ts"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveRelative: Python relative '.rel' resolves against fromFile dir", () => {
  const root = tmp();
  try {
    mkdirSync(join(root, "pkg"), { recursive: true });
    writeFileSync(join(root, "pkg", "rel.py"), "");
    writeFileSync(join(root, "pkg", "main.py"), "");
    const resolved = resolveRelative(".rel", join(root, "pkg", "main.py"));
    assert.equal(resolved, resolve(root, "pkg", "rel.py"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
