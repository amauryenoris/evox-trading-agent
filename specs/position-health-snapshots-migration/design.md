# Design — Migration: Create `position_health_snapshots` Table

## Architecture Decision

This is a single, additive SQL migration in `supabase/migrations/`. No
application code is touched. The new table is a pure observability sink —
written to by a future standalone script (Prompt 3/4) via the Supabase
service-role client (same access pattern as every other write path in this
project — `src/lib/db.ts` and `scripts/*.ts` both use
`SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS). No API route or dashboard
component reads from it in this spec's scope.

## STEP 0 — Live Verification Results

**1. `open_position_contexts` live column types** (via PostgREST OpenAPI
introspection, `GET {SUPABASE_URL}/rest/v1/`, service-role key):

```
symbol:              text   (Primary Key)
buy_timestamp:        text   ← NOT timestamptz
buy_price:            double precision
quantity:             integer
indicators:           jsonb
reasoning:            text
pattern_ids:          text[]
stop_order_id:        text
signal_type:          text
high_since_entry:     double precision
trailing_stop:        double precision
trailing_activated:   boolean
```

Cross-checked against `trade_evaluations` and `agent_log` for the same
pattern:

```
trade_evaluations.buy_timestamp:   text   ← NOT timestamptz
trade_evaluations.sell_timestamp:  text   ← NOT timestamptz
trade_evaluations.created_at:      timestamp with time zone  (DB-generated audit column)
agent_log.timestamp:               text   ← NOT timestamptz
agent_log.created_at:              timestamp with time zone  (DB-generated audit column)
```

**Deviation from the prompt's proposed SQL, reported explicitly per
instruction**: the prompt's draft schema types `position_buy_timestamp` and
`snapshot_timestamp` as `timestamptz`. Live verification shows the
project's actual, consistent convention is: application-supplied business
timestamps (written via `new Date().toISOString()` in TypeScript) are
stored as `text` in every existing table; `timestamptz` is reserved for
DB-generated `created_at` audit columns, which none of the three existing
tables' equivalent business-timestamp fields use. **This design changes
`position_buy_timestamp` and `snapshot_timestamp` from `timestamptz` to
`text`** to match the project's real, verified convention rather than the
prompt's assumption. No `created_at` audit column is added (out of scope
per requirements.md — not requested, and adding it would expand the
prompt's schema unilaterally).

**2. Existing migration files** (re-confirmed verbatim, no drift):

`supabase/migrations/20260609185757_add_spx_regime_to_trade_evaluations.sql`:
```sql
ALTER TABLE trade_evaluations
  ADD COLUMN spx_price   double precision,
  ADD COLUMN spx_sma50   double precision,
  ADD COLUMN spx_sma200  double precision,
  ADD COLUMN spx_regime  text;
```

`supabase/migrations/20260618150431_add_state_fingerprint_to_trade_evaluations.sql`:
```sql
ALTER TABLE trade_evaluations
  ADD COLUMN IF NOT EXISTS state_fingerprint jsonb;
```

**3. RLS status** (empirical test: same query via anon key vs service-role
key on all three tables):

```
open_position_contexts: anon_status=200 anon_rows=0  | service_status=200 service_rows=3
trade_evaluations:      anon_status=200 anon_rows=0  | service_status=200 service_rows=55
agent_log:               anon_status=200 anon_rows=0  | service_status=206 service_rows=1000 (of 4688 total)
```

All three return **zero rows to the anon key** while returning their true
row counts to the service-role key — the standard signature of RLS enabled
with no anon-accessible SELECT policy. **This design enables RLS on
`position_health_snapshots` with the same all-closed posture** (no policy
added), matching the confirmed existing pattern exactly.

## Target Schema (revised per STEP 0 findings)

```sql
CREATE TABLE IF NOT EXISTS position_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  position_buy_timestamp text NOT NULL,
  snapshot_timestamp text NOT NULL,
  entry_adx_bucket text,
  entry_macd_bucket text,
  entry_z_bucket text,
  entry_spx_regime text,
  current_adx_bucket text,
  current_macd_bucket text,
  current_z_bucket text,
  current_spx_regime text,
  current_adx double precision,
  current_macd_histogram double precision,
  current_z_score double precision,
  current_price double precision,
  days_since_entry integer
);

CREATE INDEX IF NOT EXISTS idx_position_health_snapshots_symbol_time
  ON position_health_snapshots (symbol, snapshot_timestamp);

ALTER TABLE position_health_snapshots ENABLE ROW LEVEL SECURITY;
```

Changes from the prompt's draft, both driven by STEP 0 evidence:
1. `position_buy_timestamp timestamptz NOT NULL` → `text NOT NULL` (matches
   `open_position_contexts.buy_timestamp`'s actual type).
2. `snapshot_timestamp timestamptz NOT NULL DEFAULT now()` → `text NOT NULL`
   (matches `agent_log.timestamp`'s actual type; `DEFAULT now()` dropped
   because the future health-check script will always supply its own
   `new Date().toISOString()` value, consistent with how every other
   business timestamp in this project is populated — by the application,
   not the database — and because a bare `now()` default would produce a
   different string format, e.g. `2026-07-08 17:00:00.123+00`, than the
   ISO-8601-with-`T` format the app writes everywhere else, which would be
   an inconsistent value if the column were ever left to its default).
3. Added explicit `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` (the
   prompt's draft didn't specify this statement; STEP 0's RLS finding
   requires it to match the existing three tables' posture).

## Data Flow

```
Future health-check script (Prompt 3/4)
  → reads open_position_contexts (entry-time reference)
  → recomputes current ADX/MACD/z-score/SPX regime via state-fingerprint.ts
  → INSERT INTO position_health_snapshots (one row per symbol per run)
       via Supabase service-role client (bypasses RLS, same as all
       existing write paths in this project)

No read path exists yet — a future dashboard card (out of scope here)
would query position_health_snapshots directly via db.ts, also through the
service-role client.
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `text` timestamps (this design) | Matches verified, consistent project-wide convention across all 3 existing tables | Loses native date/time query operators (e.g. `WHERE snapshot_timestamp > now() - interval '1 day'` needs a cast) | **Chosen** — consistency with existing schema outweighs the minor query ergonomics loss; the project has never used `timestamptz` for this kind of field |
| `timestamptz` timestamps (prompt's original draft) | Native date arithmetic, no cast needed for time-range queries | Deviates from every other business-timestamp column in the schema; introduces a second, inconsistent timestamp convention for the first time in this project | Rejected — STEP 0 evidence shows this would be a first-of-its-kind deviation, not a continuation of pattern |
| Add explicit RLS policies (e.g., a service-role-only policy) | More self-documenting than bare RLS-enabled-with-no-policy | Not what the existing 3 tables do (they rely on RLS-enabled + no policy + service-role bypass, with zero explicit policies) — would be a new pattern, not matching precedent | Rejected — mirror exactly what STEP 0 found, nothing more |
| Add a `created_at timestamptz DEFAULT now()` audit column (matches `trade_evaluations`/`agent_log`) | Consistent with 2 of 3 existing tables' audit pattern | Not requested by the prompt's schema; expanding it unilaterally risks scope creep the spec process is designed to prevent | Rejected for this spec — flagged as a possible future addition, not adopted now |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `supabase/migrations/{YYYYMMDDHHMMSS}_create_position_health_snapshots.sql` | CREATE | New table + index + RLS enable, per revised schema above |

No other file is created, modified, or deleted.

## Protected Zone Impact

None — this is a database migration only. No Protected Zone application
file (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`,
`news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) is touched.

## Database Changes

- **New table**: `position_health_snapshots` (17 columns, see schema above).
- **New index**: `idx_position_health_snapshots_symbol_time` on
  `(symbol, snapshot_timestamp)`.
- **RLS**: enabled on the new table, no policy added (matches existing
  posture on `open_position_contexts`/`trade_evaluations`/`agent_log`).
- **No changes** to any existing table, column, index, or policy.

## Open Questions

None — STEP 0 verification resolved both open items from the original
prompt (exact column types, RLS posture). The two deviations from the
prompt's draft SQL (timestamp columns as `text` instead of `timestamptz`;
explicit `ENABLE ROW LEVEL SECURITY` statement added) are reported above,
not silent, and are the only changes from the prompt's literal draft.
