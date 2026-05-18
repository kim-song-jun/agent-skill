// host-invoker for Cursor.
//
// Production wrapper that adapts the host's chat I/O primitives to the
// invoker contract expected by ./ask-user-adapter.mjs.
//
// Cursor does NOT (as of writing) expose a programmatic chat I/O API to
// extensions/skills — it only renders chat in its IDE pane. This wrapper
// is therefore intended for CLI-mode execution (or any embedding that
// hands us an output stream + an input stream). The defaults use
// process.stdout for output and a one-shot readline read on stdin.
//
// If a future Cursor API surface exposes structured chat I/O, swap the
// defaults for that surface — the contract here stays the same.
//
// Contract (invoker shape):
//   invoker(markdown: string) => Promise<string>   // user's next reply
//
// Factory:
//   cursorChatInvoker({outputFn, inputFn}) → invoker
//     outputFn(markdown):     (markdown: string) => Promise<void> | void
//                              default: write to process.stdout (+ trailing newline)
//     inputFn():              () => Promise<string>
//                              default: read one line from process.stdin
//                              via node:readline (blocks until newline).

import { createInterface } from "node:readline";

function defaultOutputFn(markdown) {
  return new Promise((resolve, reject) => {
    process.stdout.write(markdown.endsWith("\n") ? markdown : markdown + "\n", (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

function defaultInputFn() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.once("line", (line) => {
      rl.close();
      resolve(line);
    });
  });
}

export function cursorChatInvoker({ outputFn, inputFn } = {}) {
  const out = outputFn ?? defaultOutputFn;
  const inp = inputFn ?? defaultInputFn;
  if (typeof out !== "function") {
    throw new Error("cursorChatInvoker: outputFn must be a function");
  }
  if (typeof inp !== "function") {
    throw new Error("cursorChatInvoker: inputFn must be a function");
  }
  return async function invoker(markdown) {
    await out(markdown);
    const reply = await inp();
    // The adapter expects a string; normalize falsy/non-string returns.
    return reply == null ? "" : String(reply);
  };
}

export const __internal = { defaultOutputFn, defaultInputFn };
