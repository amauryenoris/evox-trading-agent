# Design — Add SPX Macro Context Columns to trade_evaluations

## Architecture Decision

This is a pure database migration with no application-layer changes. The four new columns (`spx_price`, `spx_sma50`, `spx_sma200`, `spx_regime`) are added to the existing `trade_evaluations` table as nullable fields. Because they are nullable and have no defaults, no existing INSERT statement in `db.ts` needs to change — the new columns simply receive NULL until a future wiring spec populates them. This keeps the migration atomic and non-breaking.

## Data Flow

```
Supabase MCP apply_migration
        │
        ▼
trade_evaluations table
  ├── existing columns (unchanged)
  ├── spx_price   double precision NULL  ← new
  ├── spx_sma50   double precision NULL  ← new
  ├── spx_sma200  double precision NULL  ← new
  └── spx_regime  text             NULL  ← new
```

Future wiring (out of scope for this spec):
```
runAgentCycle() → fetch SPY bars → compute SMA50/SMA200
        │
        ▼
insertTradeEvaluation({ ..., spxPrice, spxSma50, spxSma200, spxRegime })
        │
        ▼
trade_evaluations row with populated macro context
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Add columns + NOT NULL with DEFAULT 0 | Avoids NULLs in schema | Misleading — 0 is not a valid SPX price; historical rows would have false data | Rejected |
| Add columns to a separate `trade_macro_context` table | Clean normalization | Adds JOIN complexity for a simple analytical append; overkill for 4 columns | Rejected |
| Add nullable columns with no DEFAULT | Simple, non-breaking, honest about missing historical data | NULL rows until wired | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| Supabase DB (remote) | MIGRATE | `ALTER TABLE trade_evaluations ADD COLUMN ...` × 4 |

No source files are modified.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. No file in `src/lib/` is touched.

## Database Changes

**Table:** `trade_evaluations`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `spx_price` | `double precision` | YES | none | SPY close price at BUY moment |
| `spx_sma50` | `double precision` | YES | none | SPY 50-day SMA at BUY moment |
| `spx_sma200` | `double precision` | YES | none | SPY 200-day SMA at BUY moment |
| `spx_regime` | `text` | YES | none | Macro regime label (e.g. BULL/BEAR/SIDEWAYS — defined by wiring spec) |

No new indexes. No RLS policy changes.

## Open Questions

None — the scope is fully defined. All wiring decisions are deferred to a future spec.
