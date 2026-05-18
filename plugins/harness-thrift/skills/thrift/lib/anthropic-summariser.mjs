// anthropic-summariser — the `--use-haiku` summariseFn for Phase 3.
//
// Calls Anthropic's API directly (haiku by default) to compress a head
// slice of conversation turns into a short summary. Matches the
// `summariseFn` contract consumed by `summariser.mjs`:
//   summariseFn: async (turns) => string
//
// Usage:
//   import { anthropicSummariseFn } from "./anthropic-summariser.mjs";
//   const fn = anthropicSummariseFn({ apiKey, model });
//   const summaryBody = await fn(turns);
//
// Testability:
//   The factory accepts an optional `sdkLoader` — a thunk returning a
//   promise resolving to a module that exposes `default: AnthropicCtor`
//   (matching the real `@anthropic-ai/sdk` shape). Tests pass a stub
//   loader. Production callers omit it and the loader dynamically
//   imports the real SDK from the path in `sdkPath` (default:
//   "@anthropic-ai/sdk").

const SYSTEM_PROMPT =
  "You are a concise conversation summariser. Given the following N turns, " +
  "produce a compact summary preserving: user intent, key decisions, file " +
  "paths mentioned, error messages, action items. Output should be ~10% of " +
  "input length. Markdown allowed but minimal.";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;

function serialiseTurns(turns) {
  const out = [];
  turns.forEach((t, i) => {
    out.push(`### Turn ${i + 1} (${t.role ?? "unknown"})`);
    out.push(String(t.content ?? "").trim());
    out.push("");
  });
  return out.join("\n");
}

export function anthropicSummariseFn({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = DEFAULT_MODEL,
  sdkPath = "@anthropic-ai/sdk",
  maxTokens = DEFAULT_MAX_TOKENS,
  sdkLoader,
} = {}) {
  const loader = sdkLoader ?? (async () => {
    try {
      return await import(sdkPath);
    } catch (e) {
      throw new Error(
        `Install @anthropic-ai/sdk to use the --use-haiku summariser path ` +
        `(import("${sdkPath}") failed: ${e.message})`,
      );
    }
  });

  let client = null;

  async function ensureClient() {
    if (client) return client;
    const mod = await loader();
    const Anthropic = mod?.default ?? mod?.Anthropic ?? mod;
    if (typeof Anthropic !== "function") {
      throw new Error(
        `Anthropic SDK module at "${sdkPath}" does not expose a constructor ` +
        `(checked default + named export).`,
      );
    }
    client = new Anthropic(apiKey ? { apiKey } : {});
    return client;
  }

  return async function summarise(turns) {
    if (!Array.isArray(turns)) {
      throw new Error("anthropicSummariseFn: turns must be an array");
    }
    if (turns.length === 0) return "";
    const c = await ensureClient();
    const userContent = serialiseTurns(turns);
    let resp;
    try {
      resp = await c.messages.create({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
    } catch (e) {
      throw new Error(
        `anthropicSummariseFn: SDK call failed (model=${model}): ${e?.message ?? e}`,
      );
    }
    // Response shape: { content: [{ type: "text", text: "..." }, ...] }
    const blocks = Array.isArray(resp?.content) ? resp.content : [];
    const text = blocks
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) {
      throw new Error("anthropicSummariseFn: SDK returned no text content");
    }
    return text;
  };
}
