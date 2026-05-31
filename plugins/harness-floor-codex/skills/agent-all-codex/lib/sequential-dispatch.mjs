// sequential-dispatch.mjs — fallback dispatcher for agent-all-codex.
//
// Current Codex hooks do not expose the older agent-dispatch surface,
// so this module provides the stable sequential path.
// Instead we invoke `.codex/skills/<role>/SKILL.md` one task at a time
// via Codex's CLI surface.
//
// The exact invocation that triggers a skill in a non-interactive Codex
// session is still unverified — see Open Question #7 in the impl spec
// ("Skill-roster path for sequential dispatch"). For now we shell out
// to `codex exec` with the skill body as the prompt, which matches the
// scaffold's phase docs. Callers swap `codexBin` / `subcommand` to adapt
// if the live CLI uses different argv.
//
// TODO: requires live Codex CLI to verify (1) that `codex exec` is the
// correct non-interactive entry-point and (2) that the skill-resolution
// path includes `<repo>/.codex/skills/` by default.

import { existsSync, readFileSync } from "node:fs";

const DEFAULT_SUBCOMMAND = "exec";

function assertNonEmpty(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`sequential-dispatch: ${name} must be a non-empty string`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Resolve the path to a role's SKILL.md relative to the project root.
 *
 * @param {string} role
 * @param {string} [projectRoot] — defaults to process.cwd()
 * @returns {string}
 */
export function resolveSkillPath(role, projectRoot) {
  assertNonEmpty("role", role);
  const root = projectRoot || process.cwd();
  // Manual join to avoid a node:path import; we want forward slashes for
  // the shell command anyway.
  return `${root.replace(/\/+$/, "")}/.codex/skills/${role}/SKILL.md`;
}

/**
 * Build the prompt body emitted to the sequential skill invocation. The
 * coordinator passes this to `codex exec --prompt <body>` so the chosen
 * skill has everything it needs to perform the wave task.
 *
 * @param {object} args
 * @param {object} args.task        — task descriptor from the plan
 * @param {string} args.task.id
 * @param {string} args.task.title
 * @param {string[]} [args.task.files=[]]
 * @param {string} [args.task.body=""]
 * @param {object} [args.plan]      — context (path, summary)
 * @returns {string}
 */
export function buildSkillPrompt(args) {
  const { task, plan } = args;
  if (!task || typeof task !== "object") {
    throw new Error("buildSkillPrompt: task object required");
  }
  assertNonEmpty("task.id", task.id);
  assertNonEmpty("task.title", task.title);
  const files = Array.isArray(task.files) ? task.files : [];
  const bodyText = task.body || "(no body provided)";
  const planRef = plan?.path ? `Plan: ${plan.path}` : "Plan: (inline)";
  return [
    "# Sequential dispatch (agent-all-codex fallback)",
    "",
    `Task ID: ${task.id}`,
    `Title:   ${task.title}`,
    planRef,
    "",
    "## Files in scope",
    files.length ? files.map((f) => `- ${f}`).join("\n") : "(none declared)",
    "",
    "## Task body",
    "",
    bodyText,
    "",
    "## Required output",
    "",
    "End with a JSON line:",
    '`{"status": "completed"|"blocked", "commits": ["<sha>", ...], "errors": ["..."]}`',
  ].join("\n");
}

/**
 * Build argv for the sequential skill invocation. We invoke the role's
 * SKILL.md by passing its full content as the prompt to `codex exec`.
 *
 * @param {object} opts
 * @param {object} opts.task
 * @param {object} [opts.plan]
 * @param {string} [opts.projectRoot]
 * @param {string} [opts.codexBin="codex"]
 * @param {string} [opts.subcommand="exec"]
 * @param {string} [opts.skillPath] — pre-resolved override; otherwise derived from task.role
 * @returns {{argv: string[], skillPath: string, prompt: string}}
 */
export function buildSequentialInvocation(opts) {
  if (!opts || !opts.task) {
    throw new Error("buildSequentialInvocation: opts.task required");
  }
  const role = opts.task.role || "dev";
  const skillPath = opts.skillPath || resolveSkillPath(role, opts.projectRoot);
  const codexBin = opts.codexBin || "codex";
  const subcommand = opts.subcommand || DEFAULT_SUBCOMMAND;
  const prompt = buildSkillPrompt({ task: opts.task, plan: opts.plan });
  return {
    skillPath,
    prompt,
    argv: [
      codexBin,
      subcommand,
      "--skill", skillPath,
      "--prompt", prompt,
    ],
  };
}

/**
 * Build the single-string `shell_command` form. Phase 3 doc shape:
 *
 *   shell_command("codex exec --skill <path> --prompt <body>")
 *
 * @param {Parameters<typeof buildSequentialInvocation>[0]} opts
 * @returns {{command: string, skillPath: string}}
 */
export function buildSequentialShellCommand(opts) {
  const { argv, skillPath } = buildSequentialInvocation(opts);
  return { command: argv.map(shellQuote).join(" "), skillPath };
}

/**
 * Parse the JSON tail emitted by a sequential skill run. Skills are
 * required (by buildSkillPrompt) to end with a single JSON line. We
 * scan from the bottom to be resilient to interleaved log output.
 *
 * @param {string} stdout
 * @returns {{status: string, commits: string[], errors: string[]}}
 */
export function parseSkillResult(stdout) {
  if (!stdout || typeof stdout !== "string") {
    return { status: "unknown", commits: [], errors: ["empty skill output"] };
  }
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      return {
        status: parsed.status ?? "unknown",
        commits: Array.isArray(parsed.commits) ? parsed.commits : [],
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      };
    } catch {
      continue;
    }
  }
  return {
    status: "unknown",
    commits: [],
    errors: ["no JSON result line found in skill output"],
  };
}

/**
 * Dispatch one task sequentially. Returns a normalized result matching
 * the shape Phase 3 (Strategy A) returns from `codex agent wait`, so
 * downstream code can treat both paths uniformly.
 *
 * @param {Parameters<typeof buildSequentialInvocation>[0]} opts
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<{agentId: string, taskId: string, status: string,
 *                    commits: string[], costUSD: number, errors: string[]}>}
 */
export async function dispatchSequential(opts, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("dispatchSequential: shellRunner must be a function");
  }
  const { command, skillPath } = buildSequentialShellCommand(opts);
  if (opts.requireSkillExists !== false && !existsSync(skillPath)) {
    throw new Error(`sequential-dispatch: skill file missing: ${skillPath}`);
  }
  // Read the skill file for the side-effect of asserting it's a valid
  // SKILL.md (cheap precondition for callers that want to fail fast).
  if (opts.assertSkillFrontmatter && existsSync(skillPath)) {
    const head = readFileSync(skillPath, "utf-8").slice(0, 200);
    if (!head.startsWith("---")) {
      throw new Error(
        `sequential-dispatch: ${skillPath} missing YAML front-matter`,
      );
    }
  }
  const result = await shellRunner(command);
  const stdout = result?.stdout || "";
  const parsed = parseSkillResult(stdout);
  return {
    agentId: `sequential/${opts.task.id}`,
    taskId: opts.task.id,
    status: result?.status === 0 ? parsed.status : "blocked",
    commits: parsed.commits,
    costUSD: 0, // sequential mode has no per-task cost report; coordinator estimates
    errors: result?.status === 0
      ? parsed.errors
      : [...parsed.errors, `shell exit=${result?.status ?? "?"}: ${result?.stderr ?? ""}`.trim()],
  };
}

export const __internal = { shellQuote, DEFAULT_SUBCOMMAND };
