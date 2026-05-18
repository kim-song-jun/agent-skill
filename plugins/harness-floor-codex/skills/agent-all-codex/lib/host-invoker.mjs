// host-invoker for Codex CLI.
//
// Production wrapper that adapts Codex's `ask_user` host tool to the
// invoker contract expected by ./ask-user-adapter.mjs.
//
// Assumed Codex ask_user schema (per spec
// docs/superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md
// — verify via the host's tools.list RPC at runtime):
//
//   ask_user({ prompt: string, choices?: string[], multi?: boolean })
//     → { selected?: string | string[] | null, freeForm?: string }
//
// As with Copilot, host versions may return different key names
// (`value`, `choice`, `text`, raw string). The wrapper normalizes those
// into the strict `{selected, freeForm}` contract.
//
// Codex additionally exposes an `exec_command` PTY primitive that could
// drive a richer FZF-style multi-select TUI. That path is documented in
// the spec but not yet implemented — see `codexExecCommandInvoker` below
// for the placeholder factory.
//
// Contract (invoker shape):
//   invoker({prompt, choices, multi}) => Promise<{selected, freeForm}>

function normalizeReply(reply) {
  if (reply == null) return { selected: null };
  if (typeof reply === "string") return { selected: null, freeForm: reply };
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

export function codexAskUserInvoker({ toolCaller } = {}) {
  if (typeof toolCaller !== "function") {
    throw new Error("codexAskUserInvoker: toolCaller must be a function");
  }
  return async function invoker({ prompt, choices, multi }) {
    const args = { prompt };
    if (choices !== undefined) args.choices = choices;
    if (multi !== undefined) args.multi = multi;
    const reply = await toolCaller({ name: "ask_user", args });
    return normalizeReply(reply);
  };
}

// Placeholder for the FZF-style TTY path described in the spec.
//
// `execCommand` would invoke Codex's `exec_command` PTY primitive (e.g.,
// shelling out to `fzf` with the choices piped in) and return the user's
// selection. Until that path is wired up, this factory throws on use
// and callers should fall back to `codexAskUserInvoker`.
export function codexExecCommandInvoker({ execCommand } = {}) {
  if (typeof execCommand !== "function") {
    throw new Error("codexExecCommandInvoker: execCommand must be a function");
  }
  // eslint-disable-next-line no-unused-vars
  return async function invoker(_args) {
    throw new Error(
      "codexExecCommandInvoker: FZF/exec_command TTY path is not yet implemented; "
      + "fall back to codexAskUserInvoker (plain ask_user) for now.",
    );
  };
}

export const __internal = { normalizeReply };
