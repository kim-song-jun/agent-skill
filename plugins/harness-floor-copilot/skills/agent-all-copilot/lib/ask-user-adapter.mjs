// ask-user-adapter for Copilot CLI.
//
// Copilot ships an `ask_user` tool. Assumed schema (per Copilot CLI
// v0.0.5+ tools list — verify via tools.list RPC):
//
//   ask_user({ prompt: string, choices?: string[], multi?: boolean })
//     → { selected: string | string[] | null, freeForm?: string }
//
// This adapter wraps that primitive with the same contract as the other
// 3 platforms. See docs/superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md.
//
// Contract:
//   askUserStructured({ stage, prompt, choices, multi, freeFormFallback, invoker })
//   invoker:  ({prompt, choices, multi}) => Promise<{selected, freeForm}>
//             Production: pass a wrapper that invokes the Copilot ask_user tool.
//             Tests: pass a mock.

const STAGES = ["problem", "constraints", "options", "tradeoffs", "direction"];

function normalizeChoices(choices) {
  if (!choices) return null;
  if (Array.isArray(choices)) return choices;
  // {label: preview} → just labels (Copilot ask_user has no preview field).
  // Previews surface in a preceding chat block via a separate mechanism.
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
  // Normalize the reply.
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
