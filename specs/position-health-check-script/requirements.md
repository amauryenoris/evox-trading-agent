# Requirements — Position Health Monitor: the Health-Check Script

## Background

Prompts 1/4 (`state-fingerprint.ts` extraction) and 2/4
(`position_health_snapshots` migration) are merged. This spec covers Prompt
3/4: a new standalone script, `scripts/position-health-check.ts`, that for
every currently-open position recomputes its current technical state from
fresh bars, compares it against the entry-time state already stored in
`open_position_contexts`, and inserts one observability row per position
into `position_health_snapshots`. Per the Phase 2 principle, this is
observability only — no score, no gate, no alert, no exit action, and no
write to any table other than `position_health_snapshots`.

## Functional Requirements

FR-01: The system shall generate exactly one `snapshotTimestamp` value
(`new Date().toISOString()`) at the start of each run, before any data
fetching, and shall use that identical value for every row produced by
that run.

FR-02: The system shall fetch all currently-open positions via
`getOpenPositionContexts()`.

FR-03: The system shall fetch SPY daily bars once per run
(`getBars('SPY', '1Day', 400)`), not once per position.

FR-04: Where the SPY bars fetch fails or returns fewer than 200 bars, the
system shall log an error and proceed with `spx_regime: null` for every row
in that run, rather than aborting the run.

FR-05: For each open position, the system shall fetch that symbol's own
daily bars (`getBars(symbol, '1Day', 400)`).

FR-06: Where a position's own bars fetch fails or returns fewer than 200
bars, the system shall log the failure, count it as failed, and skip to the
next position without aborting the run.

FR-07: For each position with sufficient bars, the system shall compute
current technical indicators via `calculateAllIndicators(bars)`.

FR-08: The system shall derive `current_adx_bucket`, `current_macd_bucket`,
and `current_z_bucket` from the freshly-computed indicators using
`getAdxBucket`, `getMacdBucket`, and `getZBucket` respectively, from
`state-fingerprint.ts`.

FR-09: Where `getZBucket` is called for a position's current state, the
system shall pass that position's own `signalType` as the bucketing
context, normalized to the subset of signal types `getZBucket` accepts
(`MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`, or
`null`) — any other stored `signalType` value (including the legacy
`TREND` value and `undefined`) shall be treated as `null`.

FR-10: The system shall set `current_spx_regime` from the single
per-run SPY snapshot computed in FR-03/FR-04.

FR-11: The system shall read each position's entry-time reference fields
(`adx_bucket`, `macd_bucket`, `z_bucket`, `spx_regime`) from
`ctx.indicators.state_fingerprint`, defensively, without assuming
`indicators` or `state_fingerprint` exist on the stored object.

FR-12: Where a position's `state_fingerprint` is absent, the system shall
log this at an informational level (not as an error) and use `null` for
all four entry-time fields, since this indicates a position entered before
the state-fingerprint enrichment existed, not a defect.

FR-13: The system shall compute `days_since_entry` for each position using
the same trading-day approximation formula already used by
`getTradingDaysOpen()` in `claude-agent.ts`
(`Math.floor(((Date.now() - new Date(buyTimestamp).getTime()) / 86400000) * (5/7))`),
replicated locally in the new script.

FR-14: The system shall accumulate one row object per successfully-computed
position into an in-memory array, and shall not perform any database write
inside the per-position loop.

FR-15: Where the accumulated row array is empty after processing all
positions, the system shall skip the insert call entirely and shall not
call `.insert([])` under any circumstance.

FR-16: Where the accumulated row array is non-empty and the script is
running in dry-run mode (the default, `RUN_HEALTH_CHECK !== 'true'`), the
system shall print the full array of rows that would be inserted and shall
not write to Supabase.

FR-17: Where the accumulated row array is non-empty and the script is
running in live mode (`RUN_HEALTH_CHECK === 'true'`), the system shall
perform exactly one batch `.insert(rows)` call against
`position_health_snapshots`.

FR-18: Where the batch insert call fails, the system shall log the failure
explicitly and shall not silently swallow the error.

FR-19: The system shall log, per position, a comparison line showing the
entry-time and current bucket/regime values side by side.

FR-20: The system shall log a summary line at the end of every run
reporting the count of positions processed, failed, and inserted.

FR-21: The system shall add a `"health-check"` script entry to
`package.json` that invokes the new script via `tsx`.

## Non-Functional Requirements

NFR-01: The script shall perform zero writes to `open_position_contexts`,
`trade_evaluations`, or `agent_log` under any code path.

NFR-02: The script shall not import from `claude-agent.ts` — only from
`alpaca.ts`, `indicators.ts`, `state-fingerprint.ts`, `db.ts`, and
`@supabase/supabase-js`.

NFR-03: A failure processing one position (insufficient bars, fetch error)
shall not prevent other positions in the same run from being processed.

## Constraints

C-01: This feature must not modify `claude-agent.ts`, `state-fingerprint.ts`,
`indicators.ts`, `alpaca.ts`, or `db.ts` — read-only imports only, no
Protected Zone file touched.

C-02: This feature must not introduce any gate, threshold-based decision,
score, alert, or automated exit action — observability only.

C-03: This feature must not modify the `position_health_snapshots` table
schema or its `(symbol, snapshot_timestamp)` index established in Prompt
2/4.

C-04: `tsc --noEmit` must pass with zero errors for the new script.

## Out of Scope

- Scheduling this script (GitHub Actions workflow) — that is Prompt 4/4.
- A `run_id` column or any schema change — noted for Prompt 4/4, not
  addressed here.
- Any dashboard/API route to read `position_health_snapshots`.
- Sector data, sector rotation signals, or any data source beyond what
  `calculateAllIndicators()` and `computeSpxSnapshot()` already produce.
- Automated unit tests for this script (not requested by the prompt; the
  existing project pattern for `scripts/*.ts` backfill scripts has no
  dedicated test file either — verification here is manual dry-run
  execution, per the prompt's own VERIFY section).
