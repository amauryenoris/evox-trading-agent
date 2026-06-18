# Requirements — Add state_fingerprint Column to trade_evaluations

## Functional Requirements

FR-01: The system shall add a nullable `state_fingerprint` column of type `jsonb` to the `trade_evaluations` table.

FR-02: The system shall apply the migration only when the `state_fingerprint` column does not already exist in `trade_evaluations`.

FR-03: The system shall leave all existing columns in `trade_evaluations` unchanged after the migration.

FR-04: The system shall not apply any `DEFAULT` value or `NOT NULL` constraint to the `state_fingerprint` column.

## Non-Functional Requirements

NFR-01: The migration shall be idempotent-safe — it shall not be applied if the column already exists (verified via STEP 0 query before execution).

NFR-02: The `npx tsc --noEmit` check shall pass with zero errors after this change.

NFR-03: The `npm run build` check shall pass after this change.

## Constraints

C-01: This migration must not modify any TypeScript source file (`src/`, `scripts/`).

C-02: This migration must not modify any other table besides `trade_evaluations`.

C-03: This migration must not alter or drop any existing column in `trade_evaluations`.

C-04: Protected Zone TypeScript files (`src/lib/config.ts`, `src/lib/claude-agent.ts`, etc.) must not be touched.

## Out of Scope

- Populating `state_fingerprint` with data (backfill is a separate spec).
- Defining the structure/shape of the `state_fingerprint` JSON payload.
- Writing `state_fingerprint` from `claude-agent.ts` or `db.ts`.
- Adding `state_fingerprint` to the `TradeEvaluation` TypeScript type.
- Any UI or dashboard changes to display `state_fingerprint`.
- RLS policy changes (column inherits row-level policy from existing table policy).
