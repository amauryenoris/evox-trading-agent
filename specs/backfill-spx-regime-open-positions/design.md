# Design — Backfill SPX Regime into open_position_contexts

## Architecture Decision

A standalone CLI script, `scripts/backfill-spx-regime-open-positions.ts`, sibling to the existing `scripts/backfill-spx-regime.ts`, run manually via `npx tsx --env-file=.env.local`. It is not wired into any GitHub Actions workflow and is not imported by `src/`. Its date/regime math is extracted into a new pure-function helper module, `scripts/lib/spx-snapshot-helpers.ts`, which both the new script and its unit tests import. `backfill-spx-regime.ts` is not touched.

## Data Flow

1. Fetch all rows from `open_position_contexts` (`select('*')` — table is small, bounded by `MAX_POSITIONS`).
2. In-memory, classify each row as `complete` (all 4 `spx_*` present) or `candidate` (≥1 missing) by reading `row.indicators.spx_price/spx_sma50/spx_sma200/spx_regime`.
3. If no candidates: log `[BACKFILL_OPC_DRY_DONE] wouldUpdate=0 wouldSkip=0` (or `_DONE` live-mode equivalent) and exit.
4. Compute the SPY fetch window from `min(candidate.buy_timestamp) - 400d` to `max(candidate.buy_timestamp) + 5d`.
5. Single bulk fetch of SPY daily bars from Alpaca over that window (same endpoint/params as the reference script).
6. For each candidate row:
   a. Convert `buy_timestamp` → ET date.
   b. Find the last bar strictly before that date (no lookahead).
   c. If none found → skip (`no_prior_bar`).
   d. Compute `spx_sma50`/`spx_sma200` at that bar's index.
   e. Build a `fieldsToWrite` object containing only the currently-null fields: `spx_price` if null, and (`spx_sma50`+`spx_sma200`+`spx_regime` together, only if both SMAs resolved and at least one of the three is null).
   f. Merge `fieldsToWrite` into the row's existing `indicators` object (spread existing keys first, then overwrite only the null ones) — never touch `kalman`/`macd`/`adx`/etc.
   g. Dry run: log `[BACKFILL_OPC_DRY]`. Live run (`RUN_BACKFILL=true`): `UPDATE open_position_contexts SET indicators = merged WHERE symbol = row.symbol`, then log `[BACKFILL_OPC]` or `[BACKFILL_OPC_ROW_ERROR]`.
7. Print final `[BACKFILL_OPC_DRY_DONE]` / `[BACKFILL_OPC_DONE]` summary.

## Per-Row Field Merge (the key difference from the reference script)

`backfill-spx-regime.ts` treats each `trade_evaluations` row as all-or-nothing (`.is('spx_price', null)` gates the whole row in/out, and the live write sets all 4 fields together). `open_position_contexts` needs **per-field** null-coalescing because CVX already has a correct `spx_price` with the other 3 fields null — a blanket all-or-nothing write would either skip CVX entirely (leaving sma50/sma200/regime permanently null) or clobber CVX's already-correct `spx_price` with a freshly recomputed value that should be identical but isn't guaranteed to be byte-identical (floating point / bar-revision risk). Per-field merge avoids both failure modes.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Reuse live cycle's `computeSpxSnapshot()` methodology (one shared snapshot, `bars.length-2`) | Matches exactly what produced AAPL/META's values | Anchored to "now" (script run time), not to each row's own `buy_timestamp` — would not be a faithful historical reconstruction for COP (bought 6/15) if run today; violates explicit "AS OF buy_timestamp, no lookahead" requirement | Rejected |
| Per-row `buy_timestamp`-anchored, reusing `backfill-spx-regime.ts`'s methodology | Matches the explicit requirement; proven correct (already backfilled 35 `trade_evaluations` rows successfully) | Slightly more code (per-row prior-bar lookup) than a single shared snapshot | **Chosen** |
| Import logic directly from `backfill-spx-regime.ts` | Zero duplication | Functions are private/unexported in that file; importing would require modifying it, which is explicitly forbidden | Rejected |
| Extract a copy of the logic into a new shared helper module | No modification to the protected reference script; new logic is unit-testable in isolation | Two near-identical copies of the same logic exist until a future consolidation spec | **Chosen** (see NFR-03 — consolidation explicitly deferred) |
| Blanket overwrite all 4 fields on any candidate row (ignore which fields are already non-null) | Simpler code — no per-field branching | Would clobber CVX's already-correct `spx_price`; risks a different float value if Alpaca's bar data has since been revised | Rejected |
| Per-field null-coalescing merge | Preserves already-correct data exactly; minimal blast radius | Slightly more branching logic | **Chosen** |
| Filter candidates server-side via PostgREST JSONB path operators (`indicators->spx_price.is.null`) | Avoids fetching non-candidate rows | `open_position_contexts` is tiny (≤ `MAX_POSITIONS`, currently 5 rows) — no performance benefit; adds PostgREST JSONB-filter-syntax risk for no gain | Rejected |
| Fetch all rows, filter in application code | Simple, safe, no JSONB filter syntax risk | None meaningful at this table size | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `scripts/backfill-spx-regime-open-positions.ts` | CREATE | New CLI backfill script, dry-run by default |
| `scripts/lib/spx-snapshot-helpers.ts` | CREATE | Pure functions: `toEtDate`, `smaAtIndex`, `findPriorBarIndex`, `classifyRegime` — extracted copy, no changes to the original script |
| `src/lib/__tests__/spx-snapshot-helpers.test.ts` | CREATE | Unit tests for the 4 pure functions above |
| `scripts/backfill-spx-regime.ts` | NONE | Explicitly untouched (C-01) |
| `src/lib/db.ts` | NONE | Existing `getOpenPositionContexts`/update pattern is sufficient; no new db.ts function required — the script talks to Supabase directly, matching `backfill-spx-regime.ts`'s own precedent of not going through `db.ts` |
| `src/lib/types.ts` | NONE | `spx_*` stay untyped JSONB keys, matching existing precedent (C-03) |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. It is a standalone script with no imports from `claude-agent.ts`, `config.ts`, `risk-manager.ts`, `indicators.ts`, or `news-intelligence.ts`, and is not invoked by any of them.

## Database Changes

None. `indicators` is an existing JSONB column on `open_position_contexts`; this script only writes new keys into it. No migration, no new column, no new table.

## Open Questions

- **OQ-01**: Confirm the per-row, `buy_timestamp`-anchored methodology (matching `backfill-spx-regime.ts`) is correct for this backfill, rather than replicating the live cycle's shared-per-run-snapshot approach (`computeSpxSnapshot()`). The requirements text ("AS OF each position's own buy_timestamp") already implies the former, but this is a real methodological fork worth Amaury's explicit sign-off before implementation, since it means a re-run of this script next week would (correctly) produce different numbers for CVX than what `computeSpxSnapshot()` captured live on 6/24.
- **OQ-02**: Confirm per-field merge behavior is correct — i.e., CVX's existing `spx_price = 733.58` should be left untouched, only `spx_sma50`/`spx_sma200`/`spx_regime` computed and written. (Alternative: recompute and overwrite all 4 fields on any row with ≥1 null, for full internal consistency. Design above assumes the former — preserve what's already correct.)
- **OQ-03**: Confirm the new shared-helpers file location (`scripts/lib/spx-snapshot-helpers.ts`) and that creating it (a new directory, `scripts/lib/`) is acceptable, versus placing it under `src/lib/` (which would make it importable from the live app, but `scripts/` has historically been kept import-isolated from `src/`).
