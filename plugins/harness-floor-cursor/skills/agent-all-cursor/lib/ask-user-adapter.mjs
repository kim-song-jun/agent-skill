// ask-user-adapter for Cursor.
//
// Cursor has no structured ask_user API — it only has chat. This adapter
// formats the prompt as markdown (with numbered choices + previews) and
// returns a parser that consumes the user's next chat message.
//
// Contract (shared across all 4 platform adapters):
//   askUserStructured({ stage, prompt, choices, multi, freeFormFallback, invoker })
//     stage:           "problem" | "constraints" | "options" | "tradeoffs" | "direction"
//     prompt:          string — question text
//     choices:         null OR string[] (simple) OR {label: preview} (with previews)
//     multi:           boolean
//     freeFormFallback: boolean
//     invoker:         (markdown) => Promise<rawReply>
//                      Cursor: prints `markdown` to chat, awaits user's next message.
//                      Tests: pass a mock invoker.
//   Returns:
//     { type: "selected" | "free-form" | "no-choice", value: <selected> | <text> }
//     where <selected> is string | string[] (depending on multi).

const STAGES = ["problem", "constraints", "options", "tradeoffs", "direction"];

function normalizeChoices(choices) {
  if (!choices) return null;
  if (Array.isArray(choices)) {
    return choices.map((label) => ({ label, preview: null }));
  }
  return Object.entries(choices).map(([label, preview]) => ({ label, preview }));
}

function formatMarkdown({ stage, prompt, choices, multi, freeFormFallback }) {
  const lines = [];
  lines.push(`**[${stage}]** ${prompt}`);
  lines.push("");
  if (choices && choices.length > 0) {
    if (multi) {
      lines.push("Select all that apply by replying with comma-separated numbers (e.g., `1,3,4`):");
    } else {
      lines.push("Reply with the number of your choice:");
    }
    lines.push("");
    choices.forEach((c, i) => {
      lines.push(`${i + 1}. **${c.label}**`);
      if (c.preview) {
        lines.push("");
        lines.push("```");
        lines.push(c.preview);
        lines.push("```");
      }
    });
    if (freeFormFallback) {
      lines.push("");
      lines.push(
        multi
          ? "Or reply with free-form text — anything not in the list will be treated as a custom option."
          : "Or reply with free-form text — your reply will be treated as a custom option.",
      );
    }
  } else {
    lines.push("Reply with free-form text.");
  }
  return lines.join("\n");
}

function parseReply(reply, { choices, multi, freeFormFallback }) {
  const trimmed = (reply ?? "").trim();
  if (!choices || choices.length === 0) {
    return { type: "free-form", value: trimmed };
  }
  // Try to interpret as number(s).
  const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
  const nums = tokens.map((t) => parseInt(t, 10));
  const allNum = nums.length > 0 && nums.every((n) => Number.isFinite(n) && n >= 1 && n <= choices.length);
  if (allNum) {
    const selected = nums.map((n) => choices[n - 1].label);
    if (!multi && selected.length > 1) {
      // single-select: take only the first
      return { type: "selected", value: selected[0] };
    }
    return { type: "selected", value: multi ? selected : selected[0] };
  }
  // Try exact label match.
  const labels = choices.map((c) => c.label);
  if (multi) {
    const matched = tokens.filter((t) => labels.includes(t));
    if (matched.length > 0) return { type: "selected", value: matched };
  } else if (labels.includes(trimmed)) {
    return { type: "selected", value: trimmed };
  }
  // Fall through to free-form.
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
    throw new Error("invoker required (host-specific chat I/O)");
  }
  const normalized = { ...opts, choices: normalizeChoices(opts.choices) };
  const markdown = formatMarkdown(normalized);
  const reply = await opts.invoker(markdown);
  return parseReply(reply, normalized);
}

export const __internal = { STAGES, formatMarkdown, parseReply, normalizeChoices };
