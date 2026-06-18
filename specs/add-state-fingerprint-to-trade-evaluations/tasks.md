# Tasks — Add state_fingerprint Column to trade_evaluations

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec

## Implementation Checklist

### Phase 1 — Pre-migration verification (STEP 0)

- [x] T-01: Run the STEP 0 query and confirm 0 rows returned:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'trade_evaluations'
  AND column_name = 'state_fingerprint'
  ```
  If 1 row returned: **STOP** — column already exists, do not proceed.

  > Note: Supabase MCP `execute_sql` has known permission issues in this project.
  > Use the CLI workaround if MCP fails (set SUPABASE_ACCESS_TOKEN env var first):
  > ```
  > npx supabase db query --linked --output json "SELECT column_name FROM information_schema.columns WHERE table_name = 'trade_evaluations' AND column_name = 'state_fingerprint'"
  > ```

### Phase 2 — Apply migration

- [x] T-02: Apply migration via Supabase MCP `apply_migration`:
  - **name**: `add_state_fingerprint_to_trade_evaluations`
  - **SQL**:
    ```sql
    ALTER TABLE trade_evaluations
      ADD COLUMN state_fingerprint jsonb;
    ```
  > Note: MCP apply_migration had permission issues — applied via `npx supabase db query --linked`.

### Phase 3 — Post-migration verification

- [x] T-03: Re-run STEP 0 query — must return exactly 1 row with `column_name = 'state_fingerprint'`

- [x] T-04: Verify column is nullable with no default:
  ```sql
  SELECT column_default, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'trade_evaluations'
  AND column_name = 'state_fingerprint'
  ```
  Expected: `is_nullable = 'YES'`, `column_default = NULL`

- [x] T-05: Confirm no other columns were modified (column count increases by exactly 1)

- [x] T-06: `npx tsc --noEmit` passes with zero errors

- [x] T-07: `npm run build` passes

## Post-Implementation

- [ ] Run `/review add-state-fingerprint-to-trade-evaluations` to verify implementation matches spec

## Estimated Complexity

**Low** — Single `ALTER TABLE ADD COLUMN` DDL statement. No TypeScript changes, no data backfill, no existing column modifications.
