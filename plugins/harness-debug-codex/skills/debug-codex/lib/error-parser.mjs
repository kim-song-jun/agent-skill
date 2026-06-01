// error-parser.mjs — dispatch table of self-contained parsers for the
// 10 error formats harness-debug supports.
//
// Public API:
//   parseError(text, hints?) → {kind, frames[], rootException?} |
//                              {kind: "unknown", raw}
//
// Each parser is a pure function. Adding a new format is "add a sniff
// entry + a parser + a fixture pair" — no shared mutable state.
//
// Contract notes:
// - All parsers strip ANSI colour codes first (stripAnsi).
// - frames[] is capped at MAX_FRAMES (20) to prevent state file bloat.
// - When no parser sniffs a match, returns {kind: "unknown", raw:
//   <truncated to 4kb>}.

const MAX_FRAMES = 20;
const RAW_TRUNCATE_BYTES = 4096;

// Strip ANSI escapes ("\x1B[...m") that colour tooling output.
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? "").replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

function capFrames(frames) {
  if (frames.length <= MAX_FRAMES) return frames;
  return frames.slice(0, MAX_FRAMES);
}

// --- Python traceback ---
// Sniff: ^Traceback \(most recent call last\):
// Frames: File "path", line N, in func
// Root exception: trailing "Type: value" line.
export function parsePython(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const frameRe = /^\s*File "([^"]+)", line (\d+), in (\S+)/gm;
  let m;
  while ((m = frameRe.exec(clean)) !== null) {
    frames.push({ file: m[1], line: Number(m[2]), function: m[3] });
  }
  // Root exception: last non-empty line of the form `ExceptionType: message`
  let rootException = null;
  const lines = clean.split("\n").map((l) => l.replace(/\s+$/, ""));
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    if (!ln) continue;
    const em = /^([A-Za-z_][\w.]*Error|[A-Za-z_][\w.]*Exception|StopIteration|StopAsyncIteration|GeneratorExit|KeyboardInterrupt|SystemExit)(?::\s*(.*))?$/.exec(ln);
    if (em) {
      rootException = { type: em[1], value: em[2] ?? "" };
      // Attach the last frame's location if any.
      if (frames.length > 0) {
        rootException.file = frames[frames.length - 1].file;
        rootException.line = frames[frames.length - 1].line;
      }
      break;
    }
  }
  return { kind: "python", frames: capFrames(frames), rootException };
}

// --- V8 / Node.js stack trace ---
// Sniff: a line of the form `at <something> (<file>:<line>:<col>)`
// Header line is `Error: <message>` or `<ErrorType>: <message>`.
export function parseNode(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const frameRe = /^\s*at\s+(?:(.+?)\s+)?\(?([^()\s]+):(\d+):(\d+)\)?\s*$/gm;
  let m;
  while ((m = frameRe.exec(clean)) !== null) {
    frames.push({
      function: m[1] ?? "<anonymous>",
      file: m[2],
      line: Number(m[3]),
      column: Number(m[4]),
    });
  }
  let rootException = null;
  // First header line: "TypeError: foo is not a function"
  const headerRe = /^([A-Z][\w.]*Error|Error|EvalError|RangeError|ReferenceError|SyntaxError|TypeError|URIError|AggregateError):\s*(.*)$/m;
  const hm = headerRe.exec(clean);
  if (hm) {
    rootException = { type: hm[1], value: hm[2] ?? "" };
    if (frames.length > 0) {
      rootException.file = frames[0].file;
      rootException.line = frames[0].line;
    }
  }
  return { kind: "node", frames: capFrames(frames), rootException };
}

// --- pytest ---
// Sniff: `^FAILED tests/` OR `^=+ FAILURES =+` OR `^=+ short test summary`.
// Frames: `tests/foo.py::test_bar` lines in summary; FAILED lines have
// the message after `-`.
export function parsePytest(text) {
  const clean = stripAnsi(text);
  const frames = [];
  // The short summary is the most reliable list.
  // Format: `FAILED tests/foo.py::test_bar - AssertionError: ...`
  const summaryRe = /^FAILED\s+([^:\s]+)::([^\s]+)(?:\s+-\s+(.*))?$/gm;
  let m;
  while ((m = summaryRe.exec(clean)) !== null) {
    const file = m[1];
    const test = m[2];
    const message = (m[3] ?? "").trim();
    frames.push({ file, test, message, line: null });
  }
  // Augment with `tests/foo.py:42:` style location hints (most common
  // pytest output includes them in the FAILURES section).
  const locRe = /^([^\s:]+\.py):(\d+):/gm;
  const locByFile = new Map();
  while ((m = locRe.exec(clean)) !== null) {
    if (!locByFile.has(m[1])) locByFile.set(m[1], Number(m[2]));
  }
  for (const f of frames) {
    if (f.line == null && locByFile.has(f.file)) f.line = locByFile.get(f.file);
  }
  // Root exception: the last non-PASSED non-info line of form
  // `<ExceptionType>: <message>` — fall back to first frame's message.
  let rootException = null;
  const lines = clean.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const em = /^([A-Z][\w.]*Error|AssertionError|Exception):\s*(.*)$/.exec(lines[i].trim());
    if (em) {
      rootException = { type: em[1], value: em[2] ?? "" };
      break;
    }
  }
  return { kind: "pytest", frames: capFrames(frames), rootException };
}

// --- jest ---
// Sniff: a `✕ ` line OR `Tests:.*failed`.
// Frames: `✕ <name> (<ms>)` and the trailing `at <file>:<line>:<col>`.
export function parseJest(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const lines = clean.split("\n");
  let pendingTest = null;
  for (const raw of lines) {
    const ln = raw.replace(/\s+$/, "");
    const tm = /^\s*[✕✖x✕✗×]\s+(.+?)(?:\s+\(\d+\s*ms\))?\s*$/.exec(ln);
    if (tm) {
      pendingTest = { test: tm[1], file: null, line: null, message: null };
      frames.push(pendingTest);
      continue;
    }
    // attach first message line until we hit an `at` frame
    if (pendingTest && pendingTest.message == null) {
      const trimmed = ln.trim();
      if (trimmed.startsWith("Expected") || trimmed.startsWith("Received") ||
          /^Error:/i.test(trimmed) || /^AssertionError:/i.test(trimmed) ||
          /^expect\(/i.test(trimmed)) {
        pendingTest.message = trimmed;
      }
    }
    const atm = /^\s*at\s+(?:.+?\s+)?\(?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(ln);
    if (atm && pendingTest && pendingTest.file == null) {
      pendingTest.file = atm[1];
      pendingTest.line = Number(atm[2]);
    }
  }
  return { kind: "jest", frames: capFrames(frames), rootException: null };
}

// --- node:test ---
// Sniff: `^# fail \d+` OR `not ok \d+ - <test>`.
// TAP-flavoured output. Frames: `not ok N - <test>` then YAML-ish block.
export function parseNodeTest(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const lines = clean.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^not ok \d+\s*-\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const frame = { test: m[1].trim(), file: null, line: null, diagnostic: null };
    // Look ahead a few lines for YAML diagnostic.
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      const dl = lines[j];
      // location may be `'/x/a.test.js:7:1'` or `'file:///x/a.test.js:7:1'`.
      const lo = /^\s*location:\s*'?(?:file:\/\/)?([^':]+):(\d+):\d+'?/.exec(dl);
      if (lo) {
        frame.file = lo[1];
        frame.line = Number(lo[2]);
      }
      const fail = /^\s*failureType:\s*'?(.+?)'?\s*$/.exec(dl);
      if (fail) frame.diagnostic = fail[1];
      if (/^\s*\.\.\.\s*$/.test(dl)) break;
    }
    frames.push(frame);
  }
  return { kind: "node-test", frames: capFrames(frames), rootException: null };
}

// --- rustc ---
// Sniff: `^error\[E\d+\]:`
// Frames: each `error[Ennnn]: <msg>` followed by ` --> file:line:col`.
export function parseRustc(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const re = /^error\[(E\d+)\]:\s*(.+?)\n[\s\S]*?-->\s*([^\s:]+):(\d+):(\d+)/gm;
  let m;
  while ((m = re.exec(clean)) !== null) {
    frames.push({
      code: m[1],
      message: m[2].trim(),
      file: m[3],
      line: Number(m[4]),
      column: Number(m[5]),
    });
  }
  return { kind: "rustc", frames: capFrames(frames), rootException: null };
}

// --- tsc ---
// Sniff: `^.+\(\d+,\d+\): error TS\d+:`
// Frames: `<file>(<line>,<col>): error TS<code>: <msg>`.
export function parseTsc(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const re = /^([^()\n]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;
  let m;
  while ((m = re.exec(clean)) !== null) {
    frames.push({
      file: m[1],
      line: Number(m[2]),
      column: Number(m[3]),
      code: m[4],
      message: m[5].trim(),
    });
  }
  return { kind: "tsc", frames: capFrames(frames), rootException: null };
}

// --- gcc / clang ---
// Sniff: `^.+:\d+:\d+: (fatal )?error:`
// Frames: `<file>:<line>:<col>: error: <msg>`.
export function parseCc(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const re = /^([^:\n]+):(\d+):(\d+):\s*(?:fatal\s+)?error:\s*(.+)$/gm;
  let m;
  while ((m = re.exec(clean)) !== null) {
    frames.push({
      file: m[1],
      line: Number(m[2]),
      column: Number(m[3]),
      message: m[4].trim(),
    });
  }
  return { kind: "cc", frames: capFrames(frames), rootException: null };
}

// --- ESLint ---
// Sniff: filename header + lines like `  10:5  error  message  rule-id`.
// We emit one frame per error/warning entry.
export function parseEslint(text) {
  const clean = stripAnsi(text);
  const frames = [];
  const lines = clean.split("\n");
  let currentFile = null;
  for (const raw of lines) {
    const ln = raw.replace(/\s+$/, "");
    // A bare file path on its own line is the ESLint section header.
    if (/^(?:\/|\.\/|[A-Za-z]:[\\/])/.test(ln) && !/\s+(error|warning)\s+/.test(ln)) {
      currentFile = ln.trim();
      continue;
    }
    const m = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([\w/@-]+)\s*$/.exec(ln);
    if (m) {
      frames.push({
        file: currentFile,
        line: Number(m[1]),
        column: Number(m[2]),
        severity: m[3],
        message: m[4].trim(),
        ruleId: m[5],
      });
    }
  }
  return { kind: "eslint", frames: capFrames(frames), rootException: null };
}

// --- Generic shell exit ---
// Sniff: trailing line like `exit code: 137` or `command failed with
// exit code 1`. No frames; we surface the exit code as the only signal.
export function parseGenericExit(text) {
  const clean = stripAnsi(text);
  const m = /(?:exit\s*(?:code|status)|failed with exit code)\s*[:\s]?\s*(-?\d+)/i.exec(clean);
  const exitCode = m ? Number(m[1]) : null;
  return {
    kind: "generic-exit",
    frames: [],
    rootException: exitCode != null ? { type: "ExitCode", value: String(exitCode) } : null,
  };
}

// --- Dispatch table ---
// Order matters: more-specific sniffs go first. ESLint's bare-filename
// header could be confused with a Python `File "..."` so Python comes
// first. The generic exit fallback is checked last among matchers.
const DISPATCH = [
  { kind: "python", sniff: /^Traceback \(most recent call last\):/m, parser: parsePython },
  { kind: "pytest", sniff: /(^=+\s*FAILURES\s*=+|^=+\s*short test summary|^FAILED\s+\S+::)/m, parser: parsePytest },
  // jest: require FAIL header OR `Tests:.* failed,` summary OR an explicit
  // `expect(received).toBe` line. Bare `✕`/`✖` lines also appear in ESLint
  // output so we don't sniff on them alone.
  { kind: "jest", sniff: /(^FAIL\s+\S+|^Tests:.*\bfailed\b|expect\(received\)\.)/m, parser: parseJest },
  { kind: "node-test", sniff: /(^# fail \d+|^not ok \d+\s*-)/m, parser: parseNodeTest },
  { kind: "rustc", sniff: /^error\[E\d+\]:/m, parser: parseRustc },
  { kind: "tsc", sniff: /^[^()\n]+\(\d+,\d+\):\s*error\s+TS\d+:/m, parser: parseTsc },
  { kind: "cc", sniff: /^[^:\n]+:\d+:\d+:\s*(?:fatal\s+)?error:/m, parser: parseCc },
  { kind: "eslint", sniff: /^\s+\d+:\d+\s+(?:error|warning)\s+/m, parser: parseEslint },
  { kind: "node", sniff: /^\s*at\s+(?:.+\s+)?\(?[^()\s]+:\d+:\d+\)?\s*$/m, parser: parseNode },
  { kind: "generic-exit", sniff: /(?:exit\s*(?:code|status)|failed with exit code)\s*[:\s]?\s*-?\d+/i, parser: parseGenericExit },
];

export function detectKind(text) {
  const clean = stripAnsi(text);
  const head = clean.slice(0, 8192);
  for (const entry of DISPATCH) {
    if (entry.sniff.test(head)) return entry.kind;
  }
  return "unknown";
}

export function parseError(text, hints) {
  if (text == null || String(text).length === 0) {
    return { kind: "unknown", raw: "" };
  }
  const clean = stripAnsi(String(text));
  // Honour an explicit hints.kind override (Phase 1 can pass this when
  // the user knows the runner).
  const forced = hints && typeof hints.kind === "string" ? hints.kind : null;
  if (forced) {
    const entry = DISPATCH.find((d) => d.kind === forced);
    if (entry) return entry.parser(clean);
  }
  for (const entry of DISPATCH) {
    if (entry.sniff.test(clean.slice(0, 8192))) {
      return entry.parser(clean);
    }
  }
  return { kind: "unknown", raw: clean.slice(0, RAW_TRUNCATE_BYTES) };
}

export const SUPPORTED_KINDS = DISPATCH.map((d) => d.kind);
