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
// Codex additionally exposes an `exec_command` PTY primitive that can
// drive a terminal prompt for environments where plain `ask_user` is not
// the right surface. The wrapper below renders numbered choices, reads a
// single answer from `/dev/tty`, and normalizes stdout into the same
// `{selected, freeForm}` contract.
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

function heredocDelimiter(text) {
  let n = 0;
  while (true) {
    const delimiter = `CODEX_ASK_USER_${n}_EOF`;
    if (!String(text).split(/\r?\n/).includes(delimiter)) return delimiter;
    n++;
  }
}

function renderTerminalPrompt({ prompt, choices = [], multi = false }) {
  const lines = [prompt];
  if (choices.length > 0) {
    lines.push("");
    choices.forEach((choice, index) => {
      lines.push(`${index + 1}. ${choice}`);
    });
    lines.push("");
    lines.push(multi
      ? "Enter numbers or labels separated by commas:"
      : "Enter number or label:");
  } else {
    lines.push("");
    lines.push("Enter response:");
  }
  return lines.join("\n");
}

function buildTerminalCommand(renderedPrompt) {
  const delimiter = heredocDelimiter(renderedPrompt);
  return [
    `cat <<'${delimiter}' >&2`,
    renderedPrompt,
    delimiter,
    "IFS= read -r answer </dev/tty",
    `printf '%s\\n' "$answer"`,
  ].join("\n");
}

function stdoutFromExecReply(reply) {
  if (reply == null) return "";
  if (typeof reply === "string") return reply;
  const status = reply.status ?? reply.code ?? reply.exitCode ?? 0;
  if (status !== 0) {
    const detail = reply.stderr || reply.error || "";
    throw new Error(
      `codexExecCommandInvoker: exec_command failed with status ${status}`
      + `${detail ? `: ${detail}` : ""}`,
    );
  }
  return reply.stdout
    ?? reply.output
    ?? reply.text
    ?? reply.response
    ?? "";
}

function mapTokenToChoice(token, choices) {
  const trimmed = token.trim();
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    if (index >= 0 && index < choices.length) return choices[index];
  }
  const exact = choices.find((choice) => choice === trimmed);
  if (exact !== undefined) return exact;
  const folded = choices.find((choice) => choice.toLowerCase() === trimmed.toLowerCase());
  return folded ?? trimmed;
}

function normalizeExecReply(reply, { choices = [], multi = false }) {
  const text = String(stdoutFromExecReply(reply)).trim();
  if (choices.length === 0) {
    return { selected: null, freeForm: text };
  }
  if (!text) return { selected: null };
  const tokens = multi
    ? text.split(/[,\n]/).map((token) => token.trim()).filter(Boolean)
    : [text.split(/\r?\n/)[0].trim()].filter(Boolean);
  if (tokens.length === 0) return { selected: null };
  const selected = tokens.map((token) => mapTokenToChoice(token, choices));
  return { selected: multi ? selected : selected[0] };
}

// Terminal-prompt path described in the spec. `execCommand` invokes
// Codex's exec_command primitive and may be a thin wrapper around the
// host tool in production or a test double in unit tests.
export function codexExecCommandInvoker({ execCommand } = {}) {
  if (typeof execCommand !== "function") {
    throw new Error("codexExecCommandInvoker: execCommand must be a function");
  }
  return async function invoker({ prompt, choices, multi } = {}) {
    const choicesArr = Array.isArray(choices) ? choices : [];
    const renderedPrompt = renderTerminalPrompt({ prompt, choices: choicesArr, multi });
    const command = buildTerminalCommand(renderedPrompt);
    const reply = await execCommand({
      command,
      prompt,
      choices: choicesArr,
      multi: !!multi,
    });
    return normalizeExecReply(reply, { choices: choicesArr, multi: !!multi });
  };
}

export const __internal = { normalizeReply, normalizeExecReply, renderTerminalPrompt };
