import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseError,
  detectKind,
  stripAnsi,
  parsePython,
  parseNode,
  parsePytest,
  parseJest,
  parseNodeTest,
  parseRustc,
  parseTsc,
  parseCc,
  parseEslint,
  parseGenericExit,
  SUPPORTED_KINDS,
} from "../../plugins/harness-debug/skills/debug/lib/error-parser.mjs";

// ---------- Real-world fixtures (one per format) ----------

const PYTHON_FIXTURE = `Traceback (most recent call last):
  File "src/auth/login.py", line 114, in login
    user_id = session["userId"]
  File "src/session/store.py", line 42, in __getitem__
    return self._data[key]
KeyError: 'userId'`;

const NODE_FIXTURE = `TypeError: Cannot read properties of undefined (reading 'foo')
    at Object.<anonymous> (/Users/x/repo/src/app.js:12:18)
    at Module._compile (node:internal/modules/cjs/loader:1356:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1414:10)`;

const PYTEST_FIXTURE = `============================= test session starts ==============================
collected 3 items

tests/auth/test_login.py::test_valid_login FAILED                         [ 33%]
tests/auth/test_login.py::test_logout PASSED                              [ 66%]
tests/auth/test_session.py::test_session_create PASSED                    [100%]

=================================== FAILURES ===================================
________________________ test_valid_login ________________________

    def test_valid_login():
>       assert response.status == 200
E       AssertionError: 500 != 200

tests/auth/test_login.py:42: AssertionError
=========================== short test summary info ============================
FAILED tests/auth/test_login.py::test_valid_login - AssertionError: 500 != 200
============================== 1 failed, 2 passed in 0.42s ==============================`;

const JEST_FIXTURE = `FAIL  src/login.test.js
  Login component
    ✕ renders username (12 ms)
    ✓ renders password (4 ms)

  Login component › renders username

    expect(received).toBe(expected) // Object.is equality

    Expected: "alice"
    Received: undefined

      at Object.<anonymous> (src/login.test.js:14:34)

Tests:       1 failed, 1 passed, 2 total`;

const NODE_TEST_FIXTURE = `TAP version 13
ok 1 - top-level test passes
not ok 2 - failing test
  ---
  duration_ms: 1.234
  failureType: 'testCodeFailure'
  error: |
    Expected values to be strictly equal
  code: 'ERR_ASSERTION'
  stack: |-
    TestContext.<anonymous> (file:///x/tests/a.test.js:7:12)
  location: 'file:///x/tests/a.test.js:7:1'
  ...
1..2
# tests 2
# pass 1
# fail 1`;

const RUSTC_FIXTURE = `error[E0382]: borrow of moved value: \`s\`
 --> src/main.rs:5:20
  |
3 |     let s = String::from("hello");
  |         - move occurs because \`s\` has type \`String\`, which does not implement the \`Copy\` trait
4 |     let s2 = s;
  |              - value moved here
5 |     println!("{}", s);
  |                    ^ value borrowed here after move

error: aborting due to previous error`;

const TSC_FIXTURE = `src/server.ts(42,17): error TS2304: Cannot find name 'requesst'.
src/server.ts(89,5): error TS2322: Type 'string' is not assignable to type 'number'.`;

const CC_FIXTURE = `main.c:12:5: error: implicit declaration of function 'printff' is invalid in C99 [-Werror,-Wimplicit-function-declaration]
    printff("hello\\n");
    ^
main.c:18:3: fatal error: 'foo.h' file not found
#include "foo.h"
  ^
2 errors generated.`;

const ESLINT_FIXTURE = `
/Users/x/project/src/app.js
  10:5   error    'foo' is defined but never used  no-unused-vars
  22:12  warning  Missing semicolon                semi

/Users/x/project/src/util.js
  3:1    error    Unexpected console statement     no-console

✖ 3 problems (2 errors, 1 warning)`;

const GENERIC_EXIT_FIXTURE = `Compiling project...
Linking...
make: *** [all] Error 137
Command failed with exit code 137`;

// ---------- 10 format-specific tests ----------

test("error-parser: python traceback → frames + KeyError", () => {
  const r = parsePython(PYTHON_FIXTURE);
  assert.equal(r.kind, "python");
  assert.equal(r.frames.length, 2);
  assert.equal(r.frames[0].file, "src/auth/login.py");
  assert.equal(r.frames[0].line, 114);
  assert.equal(r.frames[0].function, "login");
  assert.equal(r.rootException.type, "KeyError");
  assert.equal(r.rootException.value, "'userId'");
});

test("error-parser: node V8 stack → frames + TypeError", () => {
  const r = parseNode(NODE_FIXTURE);
  assert.equal(r.kind, "node");
  assert.ok(r.frames.length >= 3, `got ${r.frames.length} frames`);
  assert.equal(r.frames[0].file, "/Users/x/repo/src/app.js");
  assert.equal(r.frames[0].line, 12);
  assert.equal(r.frames[0].column, 18);
  assert.equal(r.rootException.type, "TypeError");
});

test("error-parser: pytest FAILED summary → frame with test/file/message", () => {
  const r = parsePytest(PYTEST_FIXTURE);
  assert.equal(r.kind, "pytest");
  assert.equal(r.frames.length, 1);
  assert.equal(r.frames[0].file, "tests/auth/test_login.py");
  assert.equal(r.frames[0].test, "test_valid_login");
  assert.match(r.frames[0].message, /AssertionError/);
  assert.equal(r.frames[0].line, 42);
});

test("error-parser: jest ✕ line → frame with test name + file:line", () => {
  const r = parseJest(JEST_FIXTURE);
  assert.equal(r.kind, "jest");
  assert.equal(r.frames.length, 1);
  assert.match(r.frames[0].test, /renders username/);
  assert.equal(r.frames[0].file, "src/login.test.js");
  assert.equal(r.frames[0].line, 14);
});

test("error-parser: node:test TAP not-ok → frame with location + diagnostic", () => {
  const r = parseNodeTest(NODE_TEST_FIXTURE);
  assert.equal(r.kind, "node-test");
  assert.equal(r.frames.length, 1);
  assert.equal(r.frames[0].test, "failing test");
  assert.match(r.frames[0].file, /a\.test\.js$/);
  assert.equal(r.frames[0].line, 7);
  assert.equal(r.frames[0].diagnostic, "testCodeFailure");
});

test("error-parser: rustc E-coded error → frame with code + file:line:col", () => {
  const r = parseRustc(RUSTC_FIXTURE);
  assert.equal(r.kind, "rustc");
  assert.equal(r.frames.length, 1);
  assert.equal(r.frames[0].code, "E0382");
  assert.equal(r.frames[0].file, "src/main.rs");
  assert.equal(r.frames[0].line, 5);
  assert.equal(r.frames[0].column, 20);
  assert.match(r.frames[0].message, /borrow of moved value/);
});

test("error-parser: tsc (line,col) error TSnnnn → frames per diag", () => {
  const r = parseTsc(TSC_FIXTURE);
  assert.equal(r.kind, "tsc");
  assert.equal(r.frames.length, 2);
  assert.equal(r.frames[0].file, "src/server.ts");
  assert.equal(r.frames[0].line, 42);
  assert.equal(r.frames[0].code, "TS2304");
  assert.equal(r.frames[1].code, "TS2322");
});

test("error-parser: gcc/clang file:line:col: error → frames", () => {
  const r = parseCc(CC_FIXTURE);
  assert.equal(r.kind, "cc");
  assert.equal(r.frames.length, 2);
  assert.equal(r.frames[0].file, "main.c");
  assert.equal(r.frames[0].line, 12);
  assert.match(r.frames[1].message, /'foo\.h' file not found/);
});

test("error-parser: ESLint section-header + line:col → frames with ruleId", () => {
  const r = parseEslint(ESLINT_FIXTURE);
  assert.equal(r.kind, "eslint");
  assert.equal(r.frames.length, 3);
  assert.equal(r.frames[0].file, "/Users/x/project/src/app.js");
  assert.equal(r.frames[0].ruleId, "no-unused-vars");
  assert.equal(r.frames[0].severity, "error");
  assert.equal(r.frames[1].ruleId, "semi");
  assert.equal(r.frames[2].file, "/Users/x/project/src/util.js");
  assert.equal(r.frames[2].ruleId, "no-console");
});

test("error-parser: generic exit code → ExitCode rootException", () => {
  const r = parseGenericExit(GENERIC_EXIT_FIXTURE);
  assert.equal(r.kind, "generic-exit");
  assert.equal(r.frames.length, 0);
  assert.equal(r.rootException.type, "ExitCode");
  assert.equal(r.rootException.value, "137");
});

// ---------- Auto-detect (parseError dispatch) ----------

test("error-parser: parseError auto-detects all 10 kinds", () => {
  const cases = [
    [PYTHON_FIXTURE, "python"],
    [NODE_FIXTURE, "node"],
    [PYTEST_FIXTURE, "pytest"],
    [JEST_FIXTURE, "jest"],
    [NODE_TEST_FIXTURE, "node-test"],
    [RUSTC_FIXTURE, "rustc"],
    [TSC_FIXTURE, "tsc"],
    [CC_FIXTURE, "cc"],
    [ESLINT_FIXTURE, "eslint"],
    [GENERIC_EXIT_FIXTURE, "generic-exit"],
  ];
  for (const [text, expectedKind] of cases) {
    assert.equal(detectKind(text), expectedKind, `sniff for ${expectedKind}`);
    const parsed = parseError(text);
    assert.equal(parsed.kind, expectedKind, `parseError dispatch for ${expectedKind}`);
  }
});

test("error-parser: parseError returns unknown for non-matching text", () => {
  const r = parseError("just some random log lines\nnothing structured here");
  assert.equal(r.kind, "unknown");
  assert.equal(typeof r.raw, "string");
});

test("error-parser: parseError returns unknown for empty input", () => {
  const r = parseError("");
  assert.equal(r.kind, "unknown");
});

test("error-parser: stripAnsi removes colour codes before parsing", () => {
  const ansi = "\x1B[31mTraceback (most recent call last):\x1B[0m\n  File \"x.py\", line 1, in foo\n\x1B[1;33mValueError: bad\x1B[0m";
  const stripped = stripAnsi(ansi);
  assert.ok(!stripped.includes("\x1B"));
  const r = parseError(ansi);
  assert.equal(r.kind, "python");
  assert.equal(r.frames.length, 1);
});

test("error-parser: frames are capped at MAX_FRAMES (20)", () => {
  const many = "Traceback (most recent call last):\n" +
    Array.from({ length: 50 }, (_, i) =>
      `  File "f${i}.py", line ${i + 1}, in fn${i}`,
    ).join("\n") +
    "\nValueError: bad";
  const r = parsePython(many);
  assert.equal(r.frames.length, 20, "should cap at 20 frames");
});

test("error-parser: SUPPORTED_KINDS lists all 10 dispatchable formats", () => {
  const expected = [
    "python", "pytest", "jest", "node-test", "rustc",
    "tsc", "cc", "eslint", "node", "generic-exit",
  ].sort();
  assert.deepEqual([...SUPPORTED_KINDS].sort(), expected);
});

test("error-parser: hints.kind forces a parser even if sniff disagrees", () => {
  // A text that no sniff matches but which the user *knows* is generic.
  const r = parseError("anything at all here", { kind: "generic-exit" });
  assert.equal(r.kind, "generic-exit");
});
