# harness-core

Shared metadata and renderer helpers for agent-skill capabilities.

`harness-core` is not a marketplace plugin and is not installed directly. It is
the compatibility layer for gradually moving repeated `platform x capability`
metadata out of sibling plugins without changing current install/update flows.

## Contents

- `capabilities/catalog.mjs` - canonical capability metadata.
- `lib/capabilities/schema.mjs` - capability IR validation.
- `lib/platform-adapters/*.mjs` - thin host renderers that translate core
  metadata to platform-specific guidance surfaces.
- `lib/interactions/*.mjs` - shared `agent-interaction/v1` schema,
  platform renderers, non-TTY resolver, and JSONL interaction audit writer.
- `lib/security/*.mjs` - shared secret/privacy redaction rules, scanner, and
  audit entry helpers for control-plane artifacts.
- `scripts/generate-support-matrix.mjs` - regenerates root `SUPPORT_MATRIX.md`.

## Migration Policy

1. Existing sibling plugins remain the installable units.
2. New shared semantics start in `harness-core`.
3. Platform plugins may import core metadata or compare generated output, but
   they should keep their native artifact layout.
4. Drift checks should compare generated support/adapter output against checked
   in artifacts before release.
