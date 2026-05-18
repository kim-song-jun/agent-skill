// ask-user-adapter for Codex CLI.
//
// Codex ships an `ask_user` tool. Assumed schema (verify via tools.list):
//
//   ask_user({ prompt: string, choices?: string[], multi?: boolean })
//     → { selected: string | string[] | null, freeForm?: string }
//
// Codex also supports `exec_command` PTY which could drive a richer TUI
// (e.g., FZF-style picker). This adapter uses plain `ask_user` by default;
// the exec_command path is documented in the spec but not implemented here.
//
// Contract: see spec doc, identical to other 3 platform adapters.

const STAGES = ["problem", "constraints", "options", "tradeoffs", "direction"];

function normalizeChoices(choices) {
  if (!choices) return null;
  if (Array.isArray(choices)) return choices;
  return Object.keys(choices);
}

export async function askUserStructured(opts) {
  if (!STAGES.includes(opts.stage)) {
    throw new Error(`unknown stage: ${opts.stage}`);
  }
  if (typeof opts.invoker !== "function") {
    throw new Error("invoker required (host-specific ask_user wrapper)");
  }
  const choicesArr = normalizeChoices(opts.choices);
  const reply = await opts.invoker({
    prompt: opts.prompt,
    choices: choicesArr ?? undefined,
    multi: !!opts.multi,
  });
  if (reply && reply.selected != null) {
    return { type: "selected", value: reply.selected };
  }
  if (reply && reply.freeForm != null) {
    if (opts.freeFormFallback || !choicesArr) {
      return { type: "free-form", value: reply.freeForm };
    }
    return { type: "no-choice", value: reply.freeForm };
  }
  return { type: "no-choice", value: null };
}

export const __internal = { STAGES, normalizeChoices };
