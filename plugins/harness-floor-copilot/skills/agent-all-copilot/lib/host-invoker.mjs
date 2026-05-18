// host-invoker for Copilot CLI.
//
// Production wrapper that adapts Copilot's `ask_user` host tool to the
// invoker contract expected by ./ask-user-adapter.mjs.
//
// Assumed Copilot ask_user schema (per spec
// docs/superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md
// — verify against the running CLI via the host's `tools.list` RPC):
//
//   ask_user({ prompt: string, choices?: string[], multi?: boolean })
//     → { selected?: string | string[] | null, freeForm?: string }
//
// Some host versions may return the answer under different keys
// (`value`, `choice`, `text`, raw string). The wrapper normalizes those
// shapes into the strict `{selected, freeForm}` contract the adapter
// consumes, with selection taking precedence over free-form text.
//
// Contract (invoker shape):
//   invoker({prompt, choices, multi}) => Promise<{selected, freeForm}>
//
// Factory:
//   copilotAskUserInvoker({toolCaller}) → invoker
//     toolCaller({name, args}): the host's tool-invocation primitive.
//                                Production: a function injected by the
//                                host that calls the Copilot tool by name.
//                                Tests: pass a mock.

function normalizeReply(reply) {
  // null/undefined → no answer.
  if (reply == null) return { selected: null };

  // Raw string → treat as free-form.
  if (typeof reply === "string") return { selected: null, freeForm: reply };

  // Object — pull selection from any of the common keys.
  const selected = reply.selected
    ?? reply.value
    ?? reply.choice
    ?? reply.choices
    ?? null;
  const freeForm = reply.freeForm
    ?? reply.free_form
    ?? reply.text
    ?? reply.response
    ?? undefined;

  const out = { selected };
  if (freeForm !== undefined) out.freeForm = freeForm;
  return out;
}

export function copilotAskUserInvoker({ toolCaller } = {}) {
  if (typeof toolCaller !== "function") {
    throw new Error("copilotAskUserInvoker: toolCaller must be a function");
  }
  return async function invoker({ prompt, choices, multi }) {
    const args = { prompt };
    if (choices !== undefined) args.choices = choices;
    if (multi !== undefined) args.multi = multi;
    const reply = await toolCaller({ name: "ask_user", args });
    return normalizeReply(reply);
  };
}

export const __internal = { normalizeReply };
