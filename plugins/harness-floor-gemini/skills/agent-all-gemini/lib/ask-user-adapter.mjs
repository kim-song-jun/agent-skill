// ask-user-adapter for Gemini CLI.
//
// Gemini's `ask_user` accepts only a free-text prompt (no structured
// choices). This adapter encodes the choice list inside the prompt and
// post-parses the free-text reply.
//
// Assumed schema:
//   ask_user({ prompt: string }) → { freeForm: string }
//
// Contract: see spec doc, same as other 3 platforms (but `multi` and
// `choices` are handled in the prompt body itself).

const STAGES = ["problem", "constraints", "options", "tradeoffs", "direction"];

function normalizeChoices(choices) {
  if (!choices) return null;
  if (Array.isArray(choices)) return choices.map((label) => ({ label, preview: null }));
  return Object.entries(choices).map(([label, preview]) => ({ label, preview }));
}

function encodePrompt({ stage, prompt, choices, multi, freeFormFallback }) {
  const lines = [`[${stage}] ${prompt}`];
  if (choices && choices.length > 0) {
    lines.push("");
    lines.push(multi
      ? "Reply with a comma-separated list of numbers (e.g., 1,3,4) for the options that apply:"
      : "Reply with the number of your choice (1, 2, 3, ...):");
    choices.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.label}${c.preview ? ` — ${c.preview}` : ""}`);
    });
    if (freeFormFallback) {
      lines.push("");
      lines.push("Or reply with free-form text — anything not matching the numbered options will be treated as a custom answer.");
    }
  } else {
    lines.push("");
    lines.push("Reply with free-form text.");
  }
  return lines.join("\n");
}

function parseReply(reply, { choices, multi, freeFormFallback }) {
  const trimmed = (reply ?? "").trim();
  if (!choices || choices.length === 0) {
    return { type: "free-form", value: trimmed };
  }
  const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
  const nums = tokens.map((t) => parseInt(t, 10));
  const allNum = nums.length > 0 && nums.every((n) => Number.isFinite(n) && n >= 1 && n <= choices.length);
  if (allNum) {
    const selected = nums.map((n) => choices[n - 1].label);
    if (!multi) return { type: "selected", value: selected[0] };
    return { type: "selected", value: selected };
  }
  const labels = choices.map((c) => c.label);
  if (!multi && labels.includes(trimmed)) {
    return { type: "selected", value: trimmed };
  }
  if (multi) {
    const matched = tokens.filter((t) => labels.includes(t));
    if (matched.length > 0) return { type: "selected", value: matched };
  }
  if (freeFormFallback) {
    return { type: "free-form", value: trimmed };
  }
  return { type: "no-choice", value: trimmed };
}

export async function askUserStructured(opts) {
  if (!STAGES.includes(opts.stage)) {
    throw new Error(`unknown stage: ${opts.stage}`);
  }
  if (typeof opts.invoker !== "function") {
    throw new Error("invoker required (host-specific ask_user wrapper)");
  }
  const normalized = { ...opts, choices: normalizeChoices(opts.choices) };
  const encoded = encodePrompt(normalized);
  const reply = await opts.invoker({ prompt: encoded });
  // Gemini invoker returns {freeForm: <text>} OR plain string.
  const raw = (reply && typeof reply === "object" && reply.freeForm != null) ? reply.freeForm : reply;
  return parseReply(raw, normalized);
}

export const __internal = { STAGES, encodePrompt, parseReply, normalizeChoices };
