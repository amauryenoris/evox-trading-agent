# Requirements — Add SPX Macro Context Columns to trade_evaluations

## Functional Requirements

FR-01: The system shall add a nullable `spx_price` column of type `double precision` to the `trade_evaluations` table.

FR-02: The system shall add a nullable `spx_sma50` column of type `double precision` to the `trade_evaluations` table.

FR-03: The system shall add a nullable `spx_sma200` column of type `double precision` to the `trade_evaluations` table.

FR-04: The system shall add a nullable `spx_regime` column of type `text` to the `trade_evaluations` table.

FR-05: The system shall leave all four new columns without a DEFAULT value or NOT NULL constraint, allowing existing rows to remain NULL.

FR-06: The system shall not modify any existing column in the `trade_evaluations` table.

FR-07: The system shall not alter any other table in the database.

## Non-Functional Requirements

NFR-01: The migration shall be applied as a named Supabase migration (`add_spx_regime_to_trade_evaluations`) so it is tracked in the migration history.

NFR-02: After the migration, `npx tsc --noEmit` shall produce zero errors.

NFR-03: After the migration, `npm run build` shall complete successfully.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.

C-02: No TypeScript file shall be modified by this migration — the new columns are additive and nullable, so existing insert/select code continues to work without changes.

C-03: The migration must be verified idempotent before execution: if any of the four columns already exist, the migration must NOT be applied and the situation must be reported.

## Out of Scope

- Populating the new columns for existing rows (backfill).
- Writing SPY price/SMA values at BUY time (wiring into `claude-agent.ts` or `db.ts`).
- Exposing the new fields in the `TradeEvaluation` TypeScript interface.
- Dashboard display of SPX regime data.
- Defining the allowed values for `spx_regime` (e.g. BULL / BEAR / SIDEWAYS) — that belongs to a future wiring spec.
