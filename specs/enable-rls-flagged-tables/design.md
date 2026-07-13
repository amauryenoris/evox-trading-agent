# Design — Enable RLS on 5 Flagged Public Tables

## Architecture Decision

This is a single database migration, no application layer involved. It lives in `supabase/migrations/`, following the project's existing migration convention (one timestamped `.sql` file per change, applied via the Supabase-linked project). No `src/` file is touched — confirmed by the diagnostic that every application code path to these 5 tables already uses the service-role client, which bypasses RLS entirely regardless of policy state.

## Data Flow

```
Before:
  anon key  ──▶ PostgREST ──▶ selection_history / selection_evaluations /
                              symbol_cooldowns / pattern_library_excluded /
                              mr_gate_blocked   [RLS disabled → full read access]

  service role ──▶ PostgREST ──▶ (same 5 tables)   [always full access, RLS irrelevant]

After migration:
  anon key  ──▶ PostgREST ──▶ (same 5 tables)   [RLS enabled, 0 policies → 0 rows, HTTP 200]

  service role ──▶ PostgREST ──▶ (same 5 tables)   [unchanged — service role bypasses RLS]

  db.ts / db-cooldowns.ts (server-side, service-role only) ──▶ unaffected, no code change
```

No new read path is introduced or removed — this only closes the anon-key read path that was never intentionally granted.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` only, no policy (proposed) | Matches the exact, already-proven pattern used on all 4 existing protected tables (most recently `position_health_snapshots`, same session); zero application impact confirmed by diagnostic; smallest possible change | None identified for this project's current usage pattern | **Chosen** |
| Enable RLS + add an explicit `authenticated`-role SELECT policy | Would future-proof a dashboard direct-read path if one is ever built | Speculative — no such path exists today (browser Supabase client is confirmed dead code); adds a policy surface with no current consumer to validate against; violates YAGNI | Rejected |
| Enable RLS + explicit `service_role` policy | More explicit/self-documenting | Redundant — `service_role` already bypasses RLS unconditionally in Postgres/Supabase, an explicit policy adds no protection and doesn't match the existing 4-table pattern | Rejected |
| Revoke base table `GRANT`s from `anon`/`authenticated` instead of enabling RLS | Also closes the exposure | Diverges from the established RLS-based pattern on the other 4 tables; grants and RLS are two different Postgres mechanisms — mixing them here would make the security model inconsistent across the 9 public tables | Rejected |
| Do nothing / leave as flagged | No risk of unintended breakage | Leaves live, actively-growing data (`selection_history` at 521 rows and counting) readable by anyone with the publishable anon key indefinitely | Rejected — this is the gap being closed |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/{timestamp}_enable_rls_five_tables.sql` | CREATE | 5 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` statements, one per flagged table, no `CREATE POLICY`. |

No other file in the repository is touched.

## Protected Zone Impact

Not a `src/lib/` Protected Zone file, but **is** a DB migration — per `CLAUDE.md`'s File Permission Matrix, "Any DB migration" requires confirmation with Amaury before touching.

⚠️ **Requires Amaury confirmation before implementation.**

## Database Changes

- `ALTER TABLE selection_history ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE selection_evaluations ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE symbol_cooldowns ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE pattern_library_excluded ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE mr_gate_blocked ENABLE ROW LEVEL SECURITY;`

No new tables, columns, indexes, or policies. No data migration.

## Open Questions

- None. STEP 0 re-verification (this session) confirms the starting state is unchanged since the diagnostic (all 5 tables still RLS-disabled, anon key still matches service-role row counts exactly), and the exact SQL style is directly confirmed from the most recent tracked migration (`20260708191525_create_position_health_snapshots.sql:24`).
