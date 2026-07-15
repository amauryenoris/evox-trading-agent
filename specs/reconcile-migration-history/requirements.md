# Requirements — Reconcile Supabase Migration History

## Functional Requirements

FR-01: The system shall mark migration `20260618150431` as applied in the remote migration history table.
FR-02: The system shall mark migration `20260708191525` as applied in the remote migration history table.
FR-03: The system shall mark migration `20260713160532` as applied in the remote migration history table.
FR-04: The system shall create a local migration file `supabase/migrations/20260623014157_rename_weekly_reports_to_reports.sql` containing the exact SQL already recorded in the remote's `supabase_migrations.schema_migrations.statements` column for that version.
FR-05: The system shall not execute the SQL in the recreated `20260623014157` file against any database — it exists only to make the local file tree match already-applied remote history.
FR-06: Where `supabase migration list --linked` is run after this change, the system shall report every local file matching a remote history entry, with zero "local only" or "remote only" rows.

## Non-Functional Requirements

NFR-01: The reconciliation shall not alter any live table, column, index, RLS policy, or row of data.
NFR-02: The reconciliation shall not modify any of the other 10 existing migration files (8 empty placeholders + `20260609185757` + the 3 named files whose history is being repaired).

## Constraints

C-01: This feature touches `supabase/migrations/` (new file) and remote migration bookkeeping state — per `CLAUDE.md`'s File Permission Matrix ("Any DB migration"), it requires explicit confirmation from Amaury before implementation proceeds, even though no schema/data change occurs.
C-02: This feature must not run `supabase db push`, `supabase migration repair --status reverted`, or `supabase db pull` — only the exact 3 `repair --status applied` commands and the 1 new file, as specified.
C-03: This feature must not modify any application source file (`src/`, `scripts/`, etc.).
C-04: This feature must not re-execute the `rename_weekly_reports_to_reports` SQL — the `reports` table already exists under that name; re-running a `RENAME TABLE weekly_reports TO reports` would fail (or worse, silently target the wrong object) since `weekly_reports` no longer exists.

## Out of Scope

- Investigating or fixing why the 8 placeholder migration files are empty despite corresponding to real historical schema changes — that's a separate, pre-existing condition not related to this reconciliation.
- Auditing whether any other Supabase project (emerald-bay-quotes, landing_EVOX, Parqueo) has similar drift — out of scope, different project.
- Changing how future migrations get applied (e.g. always using `db push` going forward) — a process/workflow decision, not part of this bookkeeping fix.
- Re-verifying the live schema integrity checks from the diagnostic beyond confirming they still pass after this change (no new checks introduced).
