# Capability Core And Platform Adapters

## Goal

Reduce drift across `platform x capability` plugin surfaces without replacing
the existing marketplace plugins in one step.

## Decision

Introduce `plugins/harness-core/` as a non-installable core package that owns:

- `AgentCapability` metadata for shared workflow semantics.
- Capability schema validation.
- Thin platform renderers for host-native guidance.
- Generated `SUPPORT_MATRIX.md`.

The current sibling plugins remain the installable release units. This keeps
existing Claude/Codex/Copilot/Cursor/Gemini install/update behavior stable
while giving new features a common metadata source.

## AgentCapability IR

```ts
type AgentCapability = {
  id: string;
  name: string;
  command: string;
  description: string;
  inputs: object;
  outputs: object;
  requiredHooks?: string[];
  requiredArtifacts?: string[];
  platformSupport: Record<
    "claude" | "codex" | "copilot" | "cursor" | "gemini" | "vscode-copilot",
    "native" | "partial" | "soft" | "unsupported"
  >;
};
```

## MVP Scope

- Core metadata covers agent-init, agent-all, visual-qa, thrift, explore,
  debug, agent-handoff, interaction, policy-hook, and verification-adapter.
- Claude and Codex platform adapters render from the same catalog.
- `SUPPORT_MATRIX.md` is generated from the catalog and checked by tests.

## Non-Goals

- Do not remove existing sibling plugins.
- Do not flatten platform-native UX into one UI.
- Do not change installation layout or global config behavior.
