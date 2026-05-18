// Break-condition resolver for /agent-all --loop.
//
// Supports four preset shapes (legacy plain string also accepted):
//   string                                  → {type:"shell", cmd: <string>}
//   {type:"shell", cmd}                     → run via `sh -c`
//   {type:"test-auto"}                      → detect stack, expand to shell at runtime
//   {type:"visual-qa", spec?, slug?}        → dispatch visual-qa skill subagent
//   {type:"composite", steps:[...]}         → sequential AND of steps; all must pass
//
// Loop-evaluator stays type-agnostic; Phase 6 supplies the runner per type.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PRESET_TYPES = ["shell", "test-auto", "visual-qa", "composite"];

export function detectStackTestCommand(cwd = ".") {
  const has = (p) => existsSync(resolve(cwd, p));
  if (has("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf-8"));
      if (pkg?.scripts?.test) return "npm test --silent";
    } catch {}
    return "npm test --silent";
  }
  if (has("pyproject.toml") || has("setup.py") || has("pytest.ini")) return "pytest -q";
  if (has("Cargo.toml")) return "cargo test --quiet";
  if (has("go.mod")) return "go test ./...";
  if (has("Gemfile")) return "bundle exec rspec";
  if (has("composer.json")) return "vendor/bin/phpunit";
  if (has("pom.xml")) return "mvn -q test";
  if (has("build.gradle") || has("build.gradle.kts")) return "gradle test --quiet";
  return null;
}

export function normalizeBreakCondition(input) {
  if (input == null) return null;
  if (typeof input === "string") {
    if (!input.trim()) return null;
    return { type: "shell", cmd: input };
  }
  if (typeof input !== "object") return null;
  if (!PRESET_TYPES.includes(input.type)) return null;
  if (input.type === "shell") {
    if (typeof input.cmd !== "string" || !input.cmd.trim()) return null;
    return { type: "shell", cmd: input.cmd };
  }
  if (input.type === "test-auto") {
    return { type: "test-auto" };
  }
  if (input.type === "visual-qa") {
    const out = { type: "visual-qa" };
    if (typeof input.spec === "string") out.spec = input.spec;
    if (typeof input.slug === "string") out.slug = input.slug;
    return out;
  }
  if (input.type === "composite") {
    if (!Array.isArray(input.steps) || input.steps.length === 0) return null;
    const steps = [];
    for (const s of input.steps) {
      const n = normalizeBreakCondition(s);
      if (!n) return null;
      if (n.type === "composite") return null; // no nesting
      steps.push(n);
    }
    return { type: "composite", steps };
  }
  return null;
}

export function serializeBreakCondition(spec) {
  const norm = normalizeBreakCondition(spec);
  if (!norm) return "<invalid>";
  if (norm.type === "shell") return `shell: ${norm.cmd}`;
  if (norm.type === "test-auto") return "auto-detected test command";
  if (norm.type === "visual-qa") {
    const tail = norm.spec ? ` (spec: ${norm.spec})` : "";
    return `visual-qa skill${tail}`;
  }
  if (norm.type === "composite") {
    return `composite [${norm.steps.map(serializeBreakCondition).join(" && ")}]`;
  }
  return "<invalid>";
}

// Returns a shell-runnable command string for shell/test-auto/composite,
// or null for visual-qa (which needs a non-shell runner).
export function buildShellCommand(spec, opts = {}) {
  const cwd = opts.cwd ?? ".";
  const norm = normalizeBreakCondition(spec);
  if (!norm) return null;
  if (norm.type === "shell") return norm.cmd;
  if (norm.type === "test-auto") {
    const cmd = detectStackTestCommand(cwd);
    if (!cmd) return null;
    return cmd;
  }
  if (norm.type === "visual-qa") return null;
  if (norm.type === "composite") {
    const parts = [];
    for (const s of norm.steps) {
      if (s.type === "visual-qa") return null; // composite with visual-qa needs the runtime runner
      const c = buildShellCommand(s, opts);
      if (!c) return null;
      parts.push(`(${c})`);
    }
    return parts.join(" && ");
  }
  return null;
}

// True when the spec or any nested step is a visual-qa step.
export function needsVisualQARunner(spec) {
  const norm = normalizeBreakCondition(spec);
  if (!norm) return false;
  if (norm.type === "visual-qa") return true;
  if (norm.type === "composite") return norm.steps.some((s) => s.type === "visual-qa");
  return false;
}

// Stable key used to recognise the built-in default.
export const DEFAULT_BREAK_STRING = "npm test";

export function isDefaultOrMissing(spec) {
  if (spec == null) return true;
  if (typeof spec === "string") return spec.trim() === "" || spec.trim() === DEFAULT_BREAK_STRING;
  if (typeof spec === "object" && spec.type === "shell") {
    return !spec.cmd || spec.cmd.trim() === DEFAULT_BREAK_STRING;
  }
  return false;
}

// Catalogue used by the Phase 0 interactive prompt.
export const PRESET_CATALOGUE = [
  {
    key: "test-auto",
    label: "Test command (auto-detected)",
    description: "Detect stack (npm/pytest/cargo/go/…) and use its test command.",
    build: () => ({ type: "test-auto" }),
  },
  {
    key: "visual-qa",
    label: "visual-qa skill",
    description: "Dispatch the visual-qa orchestrator; pass = exit 0.",
    build: (opts = {}) => {
      const out = { type: "visual-qa" };
      if (opts.spec) out.spec = opts.spec;
      return out;
    },
  },
  {
    key: "custom",
    label: "Custom shell command",
    description: "Free-form shell one-liner (current default behaviour).",
    build: (opts = {}) => ({ type: "shell", cmd: opts.cmd ?? "" }),
  },
  {
    key: "composite",
    label: "Composite (sequential AND)",
    description: "Run multiple of the above in order; all must exit 0.",
    build: (opts = {}) => ({ type: "composite", steps: opts.steps ?? [] }),
  },
];
