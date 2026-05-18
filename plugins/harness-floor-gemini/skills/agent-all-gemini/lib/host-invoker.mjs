// host-invoker for Gemini CLI.
//
// Production wrapper that adapts Gemini's free-text `ask_user` host tool
// to the invoker contract expected by ./ask-user-adapter.mjs.
//
// Assumed Gemini ask_user schema (per spec
// docs/superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md):
//
//   ask_user({ prompt: string }) → string | { freeForm | response | text: string }
//
// Gemini has NO choices/multi support — those are encoded inside the
// prompt body by the adapter. The wrapper unconditionally calls
// `ask_user` with only `{prompt}`. Response shapes vary by host
// version; the wrapper normalizes all observed/expected shapes into
// `{freeForm: <text>}` as the adapter expects.
//
// Contract (invoker shape):
//   invoker({prompt}) => Promise<{freeForm: string}>
//
// Factory:
//   geminiAskUserInvoker({toolCaller}) → invoker
//     toolCaller({name, args}): the host's tool-invocation primitive.

function normalizeReply(reply) {
  if (reply == null) return { freeForm: "" };
  if (typeof reply === "string") return { freeForm: reply };
  if (typeof reply === "object") {
    const text = reply.freeForm
      ?? reply.free_form
      ?? reply.response
      ?? reply.text
      ?? reply.answer
      ?? "";
    return { freeForm: String(text) };
  }
  return { freeForm: String(reply) };
}

export function geminiAskUserInvoker({ toolCaller } = {}) {
  if (typeof toolCaller !== "function") {
    throw new Error("geminiAskUserInvoker: toolCaller must be a function");
  }
  return async function invoker({ prompt }) {
    const reply = await toolCaller({ name: "ask_user", args: { prompt } });
    return normalizeReply(reply);
  };
}

export const __internal = { normalizeReply };
