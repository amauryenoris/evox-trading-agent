# Design — Create daily_bars table (CHANGE 1 of 2 for historical OHLC persistence)

## Architecture Decision

This is a pure schema change confined to `supabase/migrations/` — no application code (`src/lib/`, `src/app/`, `scripts/`) is touched. It establishes the storage layer for a future historical-bars dataset; nothing reads or writes it yet. This is deliberately CHANGE 1 of 2: the schema ships first and independently, so it can be reviewed/applied without coupling to the pipeline script or workflow that will populate it (CHANGE 2).

## Data Flow

Design-time only (no runtime data flow yet, since no writer exists until CHANGE 2):

1. Migration file is added to `supabase/migrations/` following the timestamp-prefix convention.
2. Migration is applied to the database (via Supabase CLI / dashboard / MCP `apply_migration`, per the user's normal deploy process — not specified by this spec).
3. `daily_bars` exists, RLS-enabled, zero policies, ready to receive rows once CHANGE 2's pipeline calls `.insert()`/`.upsert()` using the service-role client.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `BIGINT GENERATED ALWAYS AS IDENTITY` primary key (as specified in the FIX/PROMPT) | Compact, sequential, cheaper index than UUID for a high-row-count time-series table | Diverges from this repo's existing convention of `uuid PRIMARY KEY DEFAULT gen_random_uuid()` (used by `position_health_snapshots` and others) | **Chosen** — explicitly specified as a user-approved design decision in the FIX/PROMPT; not re-litigated here. Reasonable given `daily_bars` is a time-series table where sequential IDs are typical and no cross-table UUID references are needed. |
| `uuid PRIMARY KEY DEFAULT gen_random_uuid()` (existing repo convention) | Consistent with every other tracked table in this repo | Not what was specified | Rejected — spec explicitly calls for `BIGINT GENERATED ALWAYS AS IDENTITY`. |
| Composite primary key `(symbol, bar_date)` instead of a separate identity column + UNIQUE constraint | One fewer column; the natural key already is `(symbol, bar_date)` | Diverges further from repo convention (every existing table has a single-column PK); FIX/PROMPT explicitly specifies a separate `id` PK plus a `UNIQUE(symbol, bar_date)` constraint | Rejected — not what was specified. |
| Add an explicit `CREATE INDEX` on `(symbol, bar_date)` beyond the UNIQUE constraint | N/A | The `UNIQUE (symbol, bar_date)` constraint already creates a backing unique index usable for lookups by symbol (and by symbol+date range) — a second explicit index would be redundant | Rejected — FIX/PROMPT's CHANGE section lists only the UNIQUE constraint, no additional index; adding one would violate "no speculative additions." |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/<timestamp>_create_daily_bars.sql` | CREATE | New migration: `daily_bars` table (id, symbol, bar_date, open, high, low, close, volume, vwap, trade_count, created_at, UNIQUE(symbol, bar_date)) + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with no policy. |

No other file is created or modified by this CHANGE.

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, or `indicators.ts`. It also does not touch `db.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`. A new migration file is explicitly listed as a "Confirm with Amaury" category in `CLAUDE.md`'s File Permission Matrix ("Any DB migration"), and this spec itself constitutes that confirmation step — the schema, column set, and RLS approach were specified verbatim in the user's own FIX/PROMPT.

## Database Changes

New table: `daily_bars`.

```sql
CREATE TABLE IF NOT EXISTS daily_bars (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol TEXT NOT NULL,
  bar_date DATE NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT NOT NULL,
  vwap NUMERIC,
  trade_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, bar_date)
);

ALTER TABLE daily_bars ENABLE ROW LEVEL SECURITY;
```

No policy is added (deny-all for non-service-role callers, matching `position_health_snapshots`/`selection_history`/etc.). No existing table, column, index, or policy is modified.

## Open Questions

- **Live post-apply verification access**: the FIX/PROMPT's VERIFY section asks to confirm the table's columns, constraint, and RLS state via a live read-only query against the actual database after applying — not just trust the migration file's text. Earlier this session, the Supabase MCP server connected to this environment was confirmed to only have access to 4 unrelated projects (`emerald-bay-quotes`, `landing_EVOX`, `Parqueo`, `Dealer`); this repo's actual project (`hhrtqxwonpmryziuejeq`) is not among them. **Amaury needs to confirm how the migration will be applied and how live verification will be performed** — options include: (a) Amaury runs `supabase db push` (or applies it via the Supabase dashboard) and then runs a verification query themselves and shares the result; (b) Amaury connects the correct Supabase project to this session's MCP server first; (c) verification is limited to confirming the migration file's SQL matches the spec exactly, with live-schema confirmation deferred to Amaury. This does not block writing/reviewing the migration file itself, but it does block the VERIFY step's "live query" requirement as literally stated.
