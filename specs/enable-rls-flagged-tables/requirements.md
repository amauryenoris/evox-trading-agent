# Requirements — Enable RLS on 5 Flagged Public Tables

## Functional Requirements

FR-01: The system shall have Row Level Security enabled on `selection_history`.
FR-02: The system shall have Row Level Security enabled on `selection_evaluations`.
FR-03: The system shall have Row Level Security enabled on `symbol_cooldowns`.
FR-04: The system shall have Row Level Security enabled on `pattern_library_excluded`.
FR-05: The system shall have Row Level Security enabled on `mr_gate_blocked`.
FR-06: Where a request uses the anon key, the system shall deny read access to all 5 tables, matching the existing behavior of `open_position_contexts`, `trade_evaluations`, `agent_log`, and `position_health_snapshots`.
FR-07: Where a request uses the service-role key, the system shall continue to allow full read/write access to all 5 tables, unaffected by RLS.
FR-08: The system shall preserve every existing row in all 5 tables — enabling RLS shall not delete, modify, or lock any data.

## Non-Functional Requirements

NFR-01: The migration shall be idempotent-safe to review (a single, self-contained SQL file) and follow the same statement style as the most recent RLS-enabling migration in this project (`supabase/migrations/20260708191525_create_position_health_snapshots.sql`, line 24: bare `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`, no accompanying policy).
NFR-02: The change shall require no application code deployment — it is a database-only change.

## Constraints

C-01: This feature is a DB migration — per `CLAUDE.md`'s File Permission Matrix ("Any DB migration"), it requires explicit confirmation from Amaury before implementation proceeds.
C-02: This feature must not create any `CREATE POLICY` statement — matching the confirmed deny-all-by-default pattern already in production on the other 4 protected tables.
C-03: This feature must not modify `src/lib/db.ts`, `src/lib/db-cooldowns.ts`, or any other application file.
C-04: This feature must not alter RLS state on any table other than the 5 named (`selection_history`, `selection_evaluations`, `symbol_cooldowns`, `pattern_library_excluded`, `mr_gate_blocked`).
C-05: This feature must not modify the `upsert_symbol_cooldown` RPC function or its grants.
C-06: This feature must not alter the schema (columns, indexes, constraints) or data of any of the 5 tables.

## Out of Scope

- Auditing or revoking the `anon` role's `EXECUTE` grant on `/rpc/upsert_symbol_cooldown` — a separate, unconfirmed function-level concern per the diagnostic.
- Deleting or archiving `pattern_library_excluded`/`mr_gate_blocked`, despite having zero application code references — RLS only, no cleanup.
- Adding any `CREATE POLICY` for a future `authenticated`-role dashboard read path — not currently needed since no code path requires it.
- Confirming Supabase Security Advisor no longer flags these tables post-migration (external system, not directly queryable from this environment on demand).
