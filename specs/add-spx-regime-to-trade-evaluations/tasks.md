# Tasks — Add SPX Macro Context Columns to trade_evaluations

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (N/A — no Protected Zone files touched)

## Implementation Checklist

### Phase 1 — Pre-flight check (run before any change)

- [x] T-01: Run the following query and confirm it returns **0 rows**. If any column already exists, STOP and report.

  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'trade_evaluations'
  AND column_name IN ('spx_price','spx_sma50','spx_sma200','spx_regime')
  ```

### Phase 2 — Database migration

- [x] T-02: Apply migration via Supabase MCP with name `add_spx_regime_to_trade_evaluations`:

  ```sql
  ALTER TABLE trade_evaluations
    ADD COLUMN spx_price   double precision,
    ADD COLUMN spx_sma50   double precision,
    ADD COLUMN spx_sma200  double precision,
    ADD COLUMN spx_regime  text;
  ```

### Phase 3 — Verification

- [x] T-03: Re-run the T-01 query — must now return **exactly 4 rows** (one per new column).

- [x] T-04: Confirm all 4 columns are nullable with no DEFAULT:

  ```sql
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'trade_evaluations'
  AND column_name IN ('spx_price','spx_sma50','spx_sma200','spx_regime')
  ORDER BY column_name;
  ```

  Expected: `is_nullable = YES`, `column_default = NULL` for all 4.

- [x] T-05: Run `npx tsc --noEmit` — must produce zero errors.

- [x] T-06: Run `npm run build` — must complete successfully.

## Post-Implementation

- [ ] Run `/review add-spx-regime-to-trade-evaluations` to verify implementation matches spec
- [ ] Confirm no existing columns in `trade_evaluations` were modified
- [ ] Confirm no other table was altered

## Estimated Complexity

**Low** — Single DDL statement on one table, no TypeScript changes, no backfill, no RLS policy changes.
