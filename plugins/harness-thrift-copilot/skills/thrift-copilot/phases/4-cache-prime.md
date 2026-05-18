# Phase 4 — Cache prime (Copilot) — DISABLED BY DEFAULT

Per the decomposition spec
(`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`,
Copilot section), Phase 4 is **disabled by default** on Copilot because
Copilot intermediates the underlying OpenAI / GitHub-Models layer.
Direct prime calls from the user side are not observably effective and
typically just cost money without producing a cache hit on the
user-visible side.

## Skip condition

The default skip path fires when ANY of the following holds:
- `config.cache.enabled === false` (default).
- `config.cache.intermediationWarning === true` (default; user must
  explicitly set to `false` to acknowledge they understand the
  intermediation risk).

If skipped, push `{phase: 4, status: "disabled-by-default-copilot"}`
to state and exit.

## Steps (when fully opted in)

Both `cache.enabled = true` AND `cache.intermediationWarning = false`
must be set in `.thrift.json`. Then:

1. Evaluate ROI heuristically. The CC version uses
   `evaluateCachePrimeROI({sessionMinutes, expectedPausesOver5Min})`;
   on Copilot the heuristic is weaker because cache hit rate isn't
   observable. We default to `worthIt = false` unless the user passes
   `--force-prime`.

2. Compute cohort key. Cohort honours `cache.shareCohortAcross`
   (`session`, `branch`, or both). Same algorithm as the CC port.

3. Schedule a `warmInterval`-cadence prime via the
   `sessionStart` hook. Each "prime" is a heuristic minimal Copilot
   tool call (e.g. an empty `read_bash` or `echo .` invocation) carrying
   the cohort key in a comment.

4. Each successful prime increments `state.cachePrimes[]` via
   `recordCachePrime(state, {cohort, costUSD: estimatedPrimeCost})`.

5. Cancel the schedule on `agentStop` (handled by the audit hook).

6. Push `{phase: 4, completedAt, fires: <n>, status: "opted-in"}` to
   state.

## Why disabled by default

Three reasons:

1. **Intermediation.** Copilot proxies the underlying model. Cache
   hits at the OpenAI/GitHub-Models layer don't necessarily surface
   as cheaper user-side calls — the intermediating tier may charge a
   flat per-request rate.
2. **Observability gap.** Copilot doesn't (currently) surface
   per-call cache-hit telemetry, so the user cannot verify that
   priming actually saved money.
3. **Cost asymmetry.** A failed prime is pure cost. Until we can
   measure the savings half of the ledger, defaulting to disabled
   biases the user toward not losing money.

   > **TODO: spike Copilot's cache surface.** If a future Copilot
   > release exposes cache-hit metadata in tool responses or
   > `list_agents` output, revisit this phase's default to `enabled =
   > true` for sessions ≥30 minutes.

## On error

- `cache.enabled = true` but `intermediationWarning = true`: phase
  exits with `status: "blocked-intermediation-warning"` and a stderr
  hint explaining the opt-in toggle.
- Prime call fails (network, rate-limit): log + continue. Schedule
  remains active for next interval.
- ROI gate skipped phase: state records `{phase: 4, status:
  "skipped-roi"}`.
