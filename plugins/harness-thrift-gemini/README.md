# harness-thrift-gemini

Theme B for **Gemini CLI** — cost-conscious long-session optimisation. Port of
[`harness-thrift`](../harness-thrift/README.md) (the Claude Code source-of-truth)
adapted for Gemini's hook model + Vertex AI prompt-cache pricing.

Sits between Theme A (`harness-builder-gemini`, install-time scaffolding) and
Theme C (`harness-floor-gemini`, cost-unrestricted runtime).

## What it does (vs the CC version)

- **Telemetry hooks** registered in `~/.gemini/settings.json` under the
  `hooks.BeforeTool` and `hooks.AfterTool` arrays (Gemini event names, not
  Claude Code's `PreToolUse`/`PostToolUse`). Patches are append-only with a
  `thrift-*.mjs` sentinel for safe revert.
- **Vertex prompt cache priming** — `gemini-pro` / `gemini-flash` rates with a
  *minimum-token threshold* (sub-threshold primes pay full cost for no cache),
  *storage-time* cost component (Vertex bills per cache-hour), and free-tier
  guardrails. See `skills/thrift-gemini/lib/vertex-cache-eval.mjs` for the ROI
  gate.
- **Summariser uses `gemini-flash`** (cheapest Gemini family member) rather
  than `claude-haiku-4-5`. Advisory mode emits a `/compress` hint (Gemini's
  compact equivalent) rather than `/compact`.
- **End-of-session audit** writes the cost report with Vertex-specific rate
  table + storage-time term included.

## Install

```
/plugin install harness-thrift-gemini@<marketplace>
```

Then in your project (one-time setup):

```
node plugins/harness-thrift-gemini/bin/install.mjs <target-project>
```

Optional flags: `--ctx ctx.json`, `--force`, `--dry-run`, `--no-instrument`.

## Configuration

`.thrift.json` at project root:

```json
{
  "summariser": {
    "everyNTurns": 25,
    "everyMTokensOutput": 30000,
    "preserveLastTurns": 6,
    "preserveSpecPaths": true,
    "model": "gemini-flash"
  },
  "cache": {
    "primingStrategy": "tools-only",
    "warmInterval": 240,
    "shareCohortAcross": ["session"],
    "enabled": false,
    "vertex": {
      "minTokenThreshold": 32000,
      "storageTimeHours": 1,
      "tier": "paid"
    }
  },
  "contextMode": {
    "coerceBashWhenOutputExceeds": 20,
    "coerceReadWhenOutputExceeds": 200,
    "blockedTools": []
  },
  "audit": {
    "estimateBaseline": "naive-gemini",
    "outputPath": "docs/thrift/audit-<date>.md"
  }
}
```

### Vertex-specific cache fields

- `cache.vertex.minTokenThreshold` — Vertex *context caching* requires a
  minimum prefix size (currently ~32k tokens for `gemini-1.5-pro`; verify
  against Google's current pricing page). Sub-threshold prime calls pay full
  uncached cost and *do not produce a cache entry*. Phase 4 skips priming
  when the accumulated context is below this threshold.
- `cache.vertex.storageTimeHours` — Vertex bills cached prefixes per storage
  hour separately from per-read. The cost-estimator multiplies this into the
  baseline-vs-actual comparison so audit savings include storage spend.
- `cache.vertex.tier` — `"paid"` or `"free"`. On `"free"` tier the prime
  call consumes request budget and is generally counterproductive; the ROI
  gate refuses to prime.

## Status

v0.1 — scaffolded per
`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`
(Gemini section). Vertex rate values are documented as
**TODO verify against current Google Vertex pricing**.

## What's NOT yet ported

- Programmatic `/compress` invocation (advisory in v1).
- Live verification of `BeforeTool` / `AfterTool` event-shape against the
  current Gemini CLI release.
- Free-tier auto-detection — current version reads `cache.vertex.tier` from
  config; future versions may consult `gemini auth list`.
- `gemini-flash` summariser SDK integration (heuristic summariser only in v1).

## References

- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — Gemini section
- `plugins/harness-thrift/README.md` — Claude Code source-of-truth
- `skills/thrift-gemini/references/porting-notes.md` — per-phase deltas
