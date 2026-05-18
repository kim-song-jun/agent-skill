# Native `ask_user` × brainstorming integration — design

**Date:** 2026-05-18
**Status:** Design only — no implementation in this iteration
**Purpose:** Spec how each platform's native user-prompt primitive
(`ask_user`, chat-driven, structured input) integrates with the
`superpowers:brainstorming` skill's structured Q&A stages.

## Why this matters

Claude Code's `superpowers:brainstorming` skill drives a multi-turn
conversation through fixed axes: problem → constraints → options →
tradeoffs → chosen direction. It uses Claude Code's `AskUserQuestion`
tool to surface structured choices with chips/previews. Other platforms
ship lighter primitives — `ask_user` (free-text), chat input only, or
nothing at all. The four `agent-all-<platform>` ports (Cursor, Copilot,
Codex, Gemini) currently fall back to "have the user type free-text
answers" which:

1. Loses the structured choice UX (no multi-select, no previews).
2. Burns more tokens per stage because the coordinator has to re-prompt
   when answers are ambiguous.
3. Makes brainstorm sessions feel like therapy instead of like guided
   workflow.

This spec defines the integration contract per platform.

## Brainstorming stages (source-of-truth)

The five stages from `superpowers:brainstorming`:

| Stage | Question shape | Answer shape |
|---|---|---|
| Problem | open-ended, "what user-facing thing are we trying to fix/build?" | one or two sentences |
| Constraints | multi-axis: tech, time, budget, team, infrastructure | bulleted list (often 3-5 items) |
| Options | coordinator generates 2-3 candidate directions | structured: name + one-line description + tradeoffs |
| Tradeoffs | coordinator surfaces pros/cons per option | reader review (no answer required) |
| Direction | single-choice: which option to pursue | one of the option names |

## Per-platform primitives surveyed

### Claude Code (baseline — already works)

`AskUserQuestion` tool with `single | multi-select` + previews. Maps
cleanly:
- Problem → free-text question (no options needed).
- Constraints → `multiSelect: true` with axes as options + free-form fallback.
- Options → `single-select` with rich previews (mockups, code snippets).
- Tradeoffs → no question; coordinator surfaces in prose.
- Direction → `single-select` with option names.

### Cursor

No structured `ask_user` API. The coordinator uses **chat output** that
asks the question in markdown, then reads the user's next chat message.
Cursor has no way to surface chips, multi-select, or previews —
everything goes through plain text.

Integration approach:
- Problem → markdown question, free-text response.
- Constraints → markdown checklist; user replies with `[x]` annotated.
- Options → markdown numbered list with mini-description; user replies
  with the number.
- Tradeoffs → prose; no input.
- Direction → markdown numbered list; user replies with the number.

**Workaround for previews**: render a code block per option (max 20 lines)
inline in the chat. Users see them in sequence, not side-by-side.

### Copilot CLI

Has `ask_user` (per Copilot CLI v0.0.5+ tools). Schema (assumed; needs
verification):
```
ask_user({prompt: string, choices?: string[], multi?: boolean})
```

Integration:
- Problem → `ask_user({prompt})`.
- Constraints → `ask_user({prompt, choices, multi: true})`.
- Options → `ask_user({prompt, choices})` (single-select, no preview).
- Tradeoffs → chat prose; no `ask_user`.
- Direction → `ask_user({prompt, choices})`.

**Limitation**: no preview field. Options must be terse (single line).
Coordinator surfaces full details in a preceding chat block.

**Open research**: whether Copilot's `ask_user` supports rich content
(images, code blocks) in `prompt`. If yes, previews can be inlined.

### Codex CLI

Has `ask_user` (per Codex CLI docs, exact schema TBD via `tools.list` RPC).
Integration: similar to Copilot — single/multi choice + free-text fallback.

**Codex-specific**: Codex supports `exec_command` PTY which means the
coordinator can drive a TUI for richer brainstorm input (e.g., FZF-style
multi-select). But that requires the user to be at a terminal — not always
true. Default to plain `ask_user`.

### Gemini CLI

Has `ask_user` (per Gemini CLI). Schema (assumed):
```
ask_user({prompt: string})
```
— free-text only. No choices. No previews.

Integration:
- Every stage becomes free-text. Coordinator constrains via "answer with
  one of: A, B, C" in the prompt.
- Options: coordinator prints a numbered list in prose, then asks "which
  number?".

**Workaround for missing structured choice**: Gemini's models are good at
following structured-response instructions in the prompt itself, so a
well-crafted prompt approximates choice UX without the API support.

## Proposed brainstorming-cross-platform skill

Add a new shared skill: `brainstorming-cross-platform` (or extend the
existing `superpowers:brainstorming` skill with a platform-detection
dispatcher).

### Architecture

```
plugins/harness-floor-<platform>/skills/agent-all-<platform>/
└── lib/
    └── ask-user-adapter.mjs          # NEW — platform-specific wrapper
```

`ask-user-adapter.mjs` exports:

```javascript
export async function askUserStructured({
  stage,           // "problem" | "constraints" | "options" | "tradeoffs" | "direction"
  prompt,          // question text
  choices,         // null OR string[] for single-select; {[label]: preview} for previews
  multi,           // boolean
  freeFormFallback, // boolean
}) {
  // Detects the host platform at runtime, dispatches to the right primitive:
  //   Claude Code  → AskUserQuestion
  //   Cursor       → markdown chat prompt + parse next message
  //   Copilot      → ask_user({prompt, choices, multi})
  //   Codex        → ask_user({prompt, choices, multi}) or exec_command TUI
  //   Gemini       → ask_user({prompt: <stage-shaped prompt>})
  // Returns: { type: "selected"|"free-form", value: ... }
}
```

### Stage contract

The brainstorming skill imports `askUserStructured` and calls it once per
stage. Stage-specific call shapes:

```javascript
// Problem
const problem = await askUserStructured({
  stage: "problem",
  prompt: "What's the user-facing problem you're trying to solve?",
  choices: null,
  freeFormFallback: true,
});

// Constraints (multi-select with free-form)
const constraints = await askUserStructured({
  stage: "constraints",
  prompt: "Which constraints apply? (select all that apply)",
  choices: ["tight deadline", "small team", "legacy stack", "compliance", "budget cap"],
  multi: true,
  freeFormFallback: true,
});

// Options (single-select with previews)
const options = [
  { label: "Add a new endpoint", preview: "POST /signup ..." },
  { label: "Reuse existing OAuth flow", preview: "..." },
];
const choice = await askUserStructured({
  stage: "options",
  prompt: "Which direction?",
  choices: Object.fromEntries(options.map(o => [o.label, o.preview])),
  multi: false,
  freeFormFallback: false,
});
```

### Per-platform adapter implementations

Sketch:

```javascript
// platform-detect.mjs
export function detectPlatform() {
  if (process.env.CLAUDE_CODE_RUNTIME) return "claude-code";
  if (process.env.CURSOR_RUNTIME) return "cursor";
  if (process.env.COPILOT_CLI_VERSION) return "copilot";
  if (process.env.CODEX_VERSION) return "codex";
  if (process.env.GEMINI_VERSION) return "gemini";
  throw new Error("unknown platform");
}

// adapters/claude-code.mjs
export async function askUserStructured({ prompt, choices, multi, ... }) {
  return await invokeTool("AskUserQuestion", {
    questions: [{ question: prompt, options: toOptions(choices), multiSelect: multi }],
  });
}

// adapters/cursor.mjs
export async function askUserStructured({ prompt, choices, multi, ... }) {
  // Emit markdown to chat; wait for next user message.
  await chatOutput(formatChatPrompt(prompt, choices, multi));
  const reply = await readNextUserMessage();
  return parseReply(reply, choices, multi);
}

// adapters/copilot.mjs, codex.mjs, gemini.mjs — invoke ask_user with adapted schema
```

## Stages: per-platform UX preview

### Stage: options (the hardest stage)

| Platform | UX |
|---|---|
| Claude Code | Chips with hover-preview; user clicks chosen |
| Cursor | Markdown numbered list with code blocks for previews; user types number |
| Copilot | `ask_user({choices: [...]})` — terse single-line; previews in preceding chat block |
| Codex | Same as Copilot OR FZF-style if `exec_command` TTY available |
| Gemini | Free-text; coordinator prompt encodes "reply with A/B/C"; relies on model intent-following |

## Effort estimate

| Task | Estimate |
|---|---|
| Spec review + sign-off | 1 day |
| Implement Claude Code adapter (mostly wiring) | 0.5 day |
| Implement Cursor adapter (markdown parser) | 1 day |
| Implement Copilot adapter | 0.5 day |
| Implement Codex adapter (+ optional FZF TUI) | 1.5 days |
| Implement Gemini adapter (+ structured-response prompt tuning) | 1.5 days |
| Integration into 4 agent-all-<platform> ports' Phase 1 brainstorm | 1 day |
| Tests (per-platform adapter unit tests + 1 integration scenario each) | 2 days |
| Buffer | 1 day |
| **Total** | **~10 days** |

## Out of scope (this design iteration)

- Implementation of the adapters.
- Per-platform `exec_command` TUI for Codex.
- Streaming "thinking aloud" coordinator output between stages.
- Voice input integration.

## Open questions

1. **Should this be a separate `brainstorming-cross-platform` skill or
   extension of `superpowers:brainstorming`?** Recommendation: extension,
   because the stage contract is identical — only the I/O changes. But
   `superpowers:` skills are versioned per the superpowers plugin; adding
   platform dispatchers there means dependency on the superpowers plugin
   in `harness-floor-*`. Decision pending.

2. **Where do the adapters live?** Options:
   - `plugins/harness-floor-<platform>/skills/agent-all-<platform>/lib/ask-user-adapter.mjs`
     — clean isolation; duplicates dispatcher logic across 4 plugins.
   - `plugins/harness-floor/lib/ask-user-adapter/<platform>.mjs`
     (centralized) — single source, cross-plugin imports — violates
     current isolation test.
   - Recommendation: per-plugin with shared interface via JSON-Schema
     contract documented here.

3. **Free-form fallback semantics.** When `choices` are presented but the
   user types something not in the list, do we accept it (and treat as
   "free-form: <text>") or reject? Recommendation: accept by default;
   coordinator can decide whether to re-prompt based on stage.

4. **Preview rendering on Copilot/Codex/Gemini.** Coordinator currently
   prints prose. Should we standardize a Markdown format for previews so
   the adapters can extract and surface natively if supported? Open.

## Decomposition into per-platform sub-projects

| Sub-project | Estimate |
|---|---|
| ask-user-adapter-claude-code (skip if already done by superpowers:brainstorming) | 0.5d |
| ask-user-adapter-cursor | 1d |
| ask-user-adapter-copilot | 0.5d |
| ask-user-adapter-codex | 1.5d |
| ask-user-adapter-gemini | 1.5d |
| brainstorming integration into 4 agent-all-<platform> ports | 1d |
| Cross-platform integration tests | 2d |

**Do not attempt all in one session** — research spikes for each
platform's `ask_user` schema are prerequisite to the actual port.

## Recommended sequencing

1. Cursor first (no API surface to research; markdown parser is well-defined).
2. Copilot (most established `ask_user` schema; v0.0.5+).
3. Codex (research `ask_user` schema; optional FZF for later).
4. Gemini (heaviest; relies on prompt-engineering instead of API support).

This mirrors the agent-all porting order from
`2026-05-18-agent-all-porting-decomposition.md`.
