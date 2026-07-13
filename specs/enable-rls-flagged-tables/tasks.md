# Tasks — Enable RLS on 5 Flagged Public Tables

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed — DB migration, per `CLAUDE.md` File Permission Matrix
- [X] Database migrations drafted — see Phase 1 below

## Implementation Checklist

### Phase 1 — Migration
- [x] T-01: Re-confirm live starting state immediately before writing the file — anon-key vs. service-role-key read test on all 5 tables (expect identical row counts on both, confirming RLS is still disabled). Confirmed: selection_history 521/521, selection_evaluations 44/44, symbol_cooldowns 0/0, pattern_library_excluded 9/9, mr_gate_blocked 0/0 — anon and service-role counts identical on all 5, RLS still disabled.
- [x] T-02: Generate a timestamp matching the project's migration filename convention (`YYYYMMDDHHMMSS`, e.g. `20260708191525` per the most recent migration) and create `supabase/migrations/{timestamp}_enable_rls_five_tables.sql` containing exactly (created: `supabase/migrations/20260713160532_enable_rls_five_tables.sql`):
  ```sql
  ALTER TABLE selection_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE selection_evaluations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE symbol_cooldowns ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pattern_library_excluded ENABLE ROW LEVEL SECURITY;
  ALTER TABLE mr_gate_blocked ENABLE ROW LEVEL SECURITY;
  ```
  No `CREATE POLICY` statements.

### Phase 2 — Apply
- [x] T-03: Apply the migration to the linked Supabase project (matching however the prior `position_health_snapshots` migration was applied this session — `npx supabase db query --linked` or equivalent available method; confirm which method is actually usable given this environment's auth constraints before running). `supabase db push --linked` failed due to pre-existing, unrelated migration-history drift (remote has an untracked `20260623014157` entry, local has 2 untracked-in-remote-history entries from prior `db query`-applied migrations) — not caused by this change, not fixed here. Applied via `cat supabase/migrations/20260713160532_enable_rls_five_tables.sql \| npx supabase db query --linked`, matching the same method used for the `state_fingerprint` and `position_health_snapshots` migrations earlier this project's history. Query executed cleanly, 0 rows returned (expected for ALTER TABLE).

### Phase 3 — Verification
- [x] T-04: Re-run the anon-key vs. service-role-key read test on all 5 tables — anon key must now return HTTP 200 with 0 rows (or `Content-Range: */0` matching the other 4 tables' pattern) on all 5; service-role key must return unchanged full data (same row counts as T-01's baseline). Confirmed: anon returns `*/0` on all 5 tables (matching the deny-all pattern of the 4 already-protected tables); service role still returns full data on all 5.
- [x] T-05: Confirm row counts identical before/after on all 5 tables via service-role key. Confirmed: selection_history 521→522 (+1, organic growth from a live cycle between baseline and check, not data loss), selection_evaluations 44→44, symbol_cooldowns 0→0, pattern_library_excluded 9→9, mr_gate_blocked 0→0. No row deleted or altered by RLS enablement.
- [x] T-06: Run the existing test suite (`npm test`) — confirm `cooldown-db.test.ts` and any other test touching `db.ts`/`db-cooldowns.ts` still pass unmodified (service-role client is unaffected by RLS, so no test behavior should change). Confirmed: 227/227 tests passing across 21 files, no change from pre-migration baseline.
- [x] T-07: Live functional spot-check of service-role read/write on at least one of the 5 tables post-migration (e.g. `getRecentSelections()` or `getActiveCooldowns()` via a direct read query) to confirm the service role is completely unaffected in practice, not just in test mocks. Ran a temporary script (removed after use, never committed) calling the real `getRecentSelections()`, `getSelectionEvaluations()`, and `getActiveCooldowns()` from `db.ts`/`db-cooldowns.ts` against the live post-migration database — all returned data normally (3, 3, and 0 rows respectively, 0 expected for the empty `symbol_cooldowns` table).

## Post-Implementation

- [x] Run `/review enable-rls-flagged-tables` to verify implementation matches spec — see `review.md`, APPROVED
- [x] Confirm no `src/` file was touched — `git status` shows only the new migration file under `supabase/migrations/` and the new `specs/enable-rls-flagged-tables/` directory. No `src/` changes.
- [x] Note for Amaury: Supabase Security Advisor re-scan timing is outside this session's control — flag as a follow-up check, not a blocking verification step. (`supabase db advisors` CLI subcommand exists and could be tried in a future session if live confirmation is wanted.)

## Estimated Complexity

**Low** — a single 5-line SQL migration with no policy logic, no schema change, no application code touched. The bulk of the work (root-cause diagnostic, confirming zero application impact, confirming the exact matching SQL style from a same-session precedent) is already done. Main execution risk is entirely in *how* the migration gets applied given this environment's Supabase auth constraints (no `SUPABASE_ACCESS_TOKEN`), not in the SQL itself.
