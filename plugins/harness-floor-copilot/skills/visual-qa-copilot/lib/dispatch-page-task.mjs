// dispatch-page-task — wraps a single Copilot `task({prompt, context})`
// invocation for visual-qa's per-page subagent.
//
// Same contract shape as agent-all-copilot's dispatch-task.mjs but the
// prompt is rendered from `page-prompt.md.hbs` and the context carries
// `visualQaPage` so the awaiter can filter via `list_agents()`.

import { readFileSync, existsSync } from "node:fs";

function bullet(items) {
  if (!items || !items.length) return "(none)";
  return items.map((s) => `- ${s}`).join("\n");
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v == null) return "";
    return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  });
}

export function buildPageTaskCall({ page, config, slugDir, analysisPromptTemplate, pagePromptTemplate }) {
  if (!page || typeof page !== "object") throw new Error("buildPageTaskCall: page required");
  if (!config || typeof config !== "object") throw new Error("buildPageTaskCall: config required");
  if (!slugDir) throw new Error("buildPageTaskCall: slugDir required");

  const baseUrl = config.baseUrl;
  const breakpoints = config.breakpoints ?? [];
  const components = page.components ?? [];
  const auth = page.auth ?? config.auth ?? null;

  const vars = {
    PAGE: page.name,
    PAGE_PATH: page.path,
    BASE_URL: baseUrl,
    OUTPUT_DIR: slugDir,
    BREAKPOINTS: JSON.stringify(breakpoints, null, 2),
    COMPONENTS: JSON.stringify(components, null, 2),
    AUTH_FLOW: auth ? JSON.stringify(auth, null, 2) : "(none)",
    ANALYSIS_PROMPT_TEMPLATE: analysisPromptTemplate ?? "",
  };

  let prompt;
  if (pagePromptTemplate) {
    prompt = renderTemplate(pagePromptTemplate, vars);
  } else {
    // Fallback minimal prompt if no template provided.
    prompt = [
      `# Visual QA — capture page "${vars.PAGE}"`,
      "",
      `**URL:** ${baseUrl}${page.path}`,
      `**Output dir:** ${slugDir}`,
      "",
      "## Breakpoints",
      bullet(breakpoints.map((bp) => `${bp.name} (${bp.width}x${bp.height})`)),
      "",
      "## Components",
      bullet(components.map((c) => c.name)),
      "",
      "## Steps",
      "1. browser_navigate to URL.",
      "2. For each breakpoint, browser_resize and browser_take_screenshot.",
      "3. For each component+state, capture.",
      "4. Analyse each image; emit JSON.",
      "",
      "Return STATUS: completed|blocked|failed and a JSON block with {page, captures, analyses, status, errors, costUSD}.",
    ].join("\n");
  }

  const context = {
    visualQaPage: page.name,
    slugDir,
    baseUrl,
    matrixKey: "visual-qa/matrix",
    breakpoints,
    components,
    auth,
  };

  return { prompt, context };
}

export async function dispatchPageTask({ call, taskCaller, contextExtras } = {}) {
  if (typeof taskCaller !== "function") {
    throw new Error("dispatchPageTask: taskCaller required");
  }
  const args = {
    prompt: call.prompt,
    context: contextExtras ? { ...call.context, ...contextExtras } : call.context,
  };
  try {
    const reply = await taskCaller({ name: "task", args });
    const agentId = typeof reply === "string"
      ? reply
      : reply?.agentId ?? reply?.id ?? reply?.agent_id ?? null;
    if (!agentId) return { ok: false, agentId: null, error: "task reply missing agentId" };
    return { ok: true, agentId };
  } catch (e) {
    return { ok: false, agentId: null, error: e?.message ?? String(e) };
  }
}

// parsePageTaskResult: subagent's final message should contain a fenced
// JSON block with {page, captures, analyses, status, errors, costUSD}.
const JSON_BLOCK = /```json\s*([\s\S]*?)```/i;
const STATUS_RE = /^STATUS:\s*(completed|blocked|failed)\s*$/im;

export function parsePageTaskResult(agentOutput) {
  const out = {
    page: null,
    captures: [],
    analyses: [],
    status: "unknown",
    errors: [],
    costUSD: null,
  };
  if (typeof agentOutput !== "string" || agentOutput.length === 0) {
    out.errors.push("empty agent output");
    return out;
  }
  const statusMatch = agentOutput.match(STATUS_RE);
  if (statusMatch) out.status = statusMatch[1].toLowerCase();

  const jsonMatch = agentOutput.match(JSON_BLOCK);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      out.page = parsed.page ?? out.page;
      out.captures = Array.isArray(parsed.captures) ? parsed.captures : out.captures;
      out.analyses = Array.isArray(parsed.analyses) ? parsed.analyses : out.analyses;
      if (parsed.status && out.status === "unknown") out.status = parsed.status;
      if (Array.isArray(parsed.errors)) out.errors.push(...parsed.errors);
      if (typeof parsed.costUSD === "number") out.costUSD = parsed.costUSD;
    } catch (e) {
      out.errors.push(`json parse failed: ${e.message}`);
    }
  } else {
    out.errors.push("no ```json block found in output");
  }
  return out;
}

// Helper for loading the on-disk template (so the lib stays pure).
export function loadPromptTemplate(absPath) {
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf-8");
}

export const __internal = { renderTemplate, bullet, JSON_BLOCK, STATUS_RE };
