// sequential-dispatch.mjs — fallback dispatcher for visual-qa-codex.
//
// Current Codex hooks do not expose the older agent-dispatch surface, so
// we invoke `.codex/skills/visual-qa-page/SKILL.md` once per page-group via
// Codex's CLI surface.
//
// Verified against Codex CLI 0.135.0: `codex exec` is the supported
// non-interactive entry point and it accepts the initial instructions as
// a positional prompt. It does not expose `--skill` or `--prompt`, so
// this dispatcher embeds the page SKILL.md content into that prompt.

import { existsSync, readFileSync } from "node:fs";

const DEFAULT_SUBCOMMAND = "exec";
const DEFAULT_SKILL_PATH = ".codex/skills/visual-qa-page/SKILL.md";

function assertNonEmpty(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`sequential-dispatch: ${name} must be a non-empty string`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Resolve the visual-qa-page skill path relative to a project root.
 *
 * @param {string} [projectRoot]
 * @returns {string}
 */
export function resolvePageSkillPath(projectRoot) {
  const root = projectRoot || process.cwd();
  return `${root.replace(/\/+$/, "")}/${DEFAULT_SKILL_PATH}`;
}

/**
 * Build the per-page prompt body passed to the page subagent.
 *
 * @param {object} args
 * @param {object} args.page          — page descriptor from .visual-qa.json
 * @param {string} args.page.name
 * @param {string} [args.page.path]
 * @param {string} args.slugDir       — `docs/visual-qa/<slug>/`
 * @param {string} args.baseUrl
 * @param {object} [args.config]
 * @returns {string}
 */
export function buildPagePrompt(args) {
  if (!args || !args.page) {
    throw new Error("buildPagePrompt: args.page required");
  }
  assertNonEmpty("page.name", args.page.name);
  assertNonEmpty("slugDir", args.slugDir);
  assertNonEmpty("baseUrl", args.baseUrl);
  const outDir = `${args.slugDir.replace(/\/+$/, "")}/${args.page.name}/`;
  const pageSkill = args.skillBody
    ? [
        "## Page Skill",
        "",
        `Path: ${args.skillPath || DEFAULT_SKILL_PATH}`,
        "",
        "Follow this page skill for the capture:",
        "",
        "```markdown",
        args.skillBody,
        "```",
        "",
      ]
    : args.skillPath
      ? [
          "## Page Skill",
          "",
          `Path: ${args.skillPath}`,
          "",
          "The dispatcher could not inline the skill body; load and follow this page skill before capturing.",
          "",
        ]
      : [];
  return [
    "# Sequential dispatch (visual-qa-codex fallback)",
    "",
    ...pageSkill,
    `PAGE_NAME: ${args.page.name}`,
    `PAGE_PATH: ${args.page.path ?? "/"}`,
    `BASE_URL:  ${args.baseUrl}`,
    `OUTPUT_DIR: ${outDir}`,
    "",
    "## Steps (per visual-qa-page SKILL.md)",
    "",
    "1. browser_navigate(BASE_URL + PAGE_PATH).",
    "2. If page.requiresAuth: run AUTH_FLOW first.",
    "3. For each breakpoint × component × state: capture to OUTPUT_DIR.",
    "4. For each PNG: run analysis prompt → <image>.analysis.{json,md}.",
    "5. End with a JSON line summarizing the page:",
    "   `{\"page\": \"<name>\", \"status\": \"completed\"|\"incomplete\",",
    "     \"captures\": [...], \"analyses\": [...], \"errors\": [...]}`",
  ].join("\n");
}

/**
 * Build argv for the per-page sequential invocation.
 *
 * @param {object} opts
 * @param {object} opts.page
 * @param {string} opts.slugDir
 * @param {string} opts.baseUrl
 * @param {object} [opts.config]
 * @param {string} [opts.projectRoot]
 * @param {string} [opts.codexBin="codex"]
 * @param {string} [opts.subcommand="exec"]
 * @param {string} [opts.skillPath]
 * @param {string} [opts.skillBody]
 * @returns {{argv: string[], skillPath: string, prompt: string}}
 */
export function buildSequentialPageInvocation(opts) {
  if (!opts) throw new Error("buildSequentialPageInvocation: opts required");
  const skillPath = opts.skillPath || resolvePageSkillPath(opts.projectRoot);
  const codexBin = opts.codexBin || "codex";
  const subcommand = opts.subcommand || DEFAULT_SUBCOMMAND;
  const prompt = buildPagePrompt({
    page: opts.page,
    slugDir: opts.slugDir,
    baseUrl: opts.baseUrl,
    config: opts.config,
    skillPath,
    skillBody: opts.skillBody,
  });
  return {
    skillPath,
    prompt,
    argv: [
      codexBin,
      subcommand,
      prompt,
    ],
  };
}

export function buildSequentialPageShellCommand(opts) {
  const { argv, skillPath } = buildSequentialPageInvocation(opts);
  return { command: argv.map(shellQuote).join(" "), skillPath };
}

/**
 * Parse the JSON tail emitted by a sequential page run.
 *
 * @param {string} stdout
 * @returns {{page: string|null, status: string, captures: string[],
 *            analyses: string[], errors: string[]}}
 */
export function parsePageResult(stdout) {
  if (!stdout || typeof stdout !== "string") {
    return { page: null, status: "unknown", captures: [], analyses: [],
      errors: ["empty page output"] };
  }
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      return {
        page: parsed.page ?? null,
        status: parsed.status ?? "unknown",
        captures: Array.isArray(parsed.captures) ? parsed.captures : [],
        analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      };
    } catch {
      continue;
    }
  }
  return {
    page: null,
    status: "unknown",
    captures: [],
    analyses: [],
    errors: ["no JSON result line found in page output"],
  };
}

/**
 * Dispatch one page sequentially. Returns a normalized result matching
 * the shape Phase 3 (Strategy A) returns from `codex agent wait`, so
 * the orchestrator can treat both paths uniformly.
 *
 * @param {Parameters<typeof buildSequentialPageInvocation>[0]} opts
 * @param {(command: string) => Promise<{stdout: string, stderr: string, status: number}>} shellRunner
 * @returns {Promise<{agentId: string, taskId: string, status: string,
 *                    captures: string[], analyses: string[],
 *                    costUSD: number, errors: string[]}>}
 */
export async function dispatchPageSequential(opts, shellRunner) {
  if (typeof shellRunner !== "function") {
    throw new Error("dispatchPageSequential: shellRunner must be a function");
  }
  const { skillPath } = buildSequentialPageInvocation(opts);
  if (opts.requireSkillExists !== false && !existsSync(skillPath)) {
    throw new Error(`sequential-dispatch: skill file missing: ${skillPath}`);
  }
  let skillBody = opts.skillBody;
  if (existsSync(skillPath)) {
    skillBody = readFileSync(skillPath, "utf-8");
  }
  if (opts.assertSkillFrontmatter && skillBody) {
    const head = skillBody.slice(0, 200);
    if (!head.startsWith("---")) {
      throw new Error(
        `sequential-dispatch: ${skillPath} missing YAML front-matter`,
      );
    }
  }
  const { command } = buildSequentialPageShellCommand({
    ...opts,
    skillPath,
    skillBody,
  });
  const result = await shellRunner(command);
  const stdout = result?.stdout || "";
  const parsed = parsePageResult(stdout);
  return {
    agentId: `sequential/page/${opts.page.name}`,
    taskId: `visual-qa/page/${opts.page.name}`,
    status: result?.status === 0 ? parsed.status : "incomplete",
    captures: parsed.captures,
    analyses: parsed.analyses,
    costUSD: 0,
    errors: result?.status === 0
      ? parsed.errors
      : [...parsed.errors, `shell exit=${result?.status ?? "?"}: ${result?.stderr ?? ""}`.trim()],
  };
}

export const __internal = { shellQuote, DEFAULT_SUBCOMMAND, DEFAULT_SKILL_PATH };
