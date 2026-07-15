# Design — Reconcile Supabase Migration History

## Architecture Decision

This is entirely outside the application runtime — it operates on two things: (1) the Supabase CLI's remote `supabase_migrations.schema_migrations` bookkeeping table, via the `supabase migration repair` command, and (2) the local `supabase/migrations/` directory, via one new file creation. No `src/` code, no live schema DDL. This is the direct follow-up to the `enable-rls-flagged-tables` review's LOW finding and the dedicated read-only diagnostic that fully mapped the drift.

## Data Flow

```
BEFORE:
  supabase migration list --linked
    → 20260618150431: local=yes, remote=NO   (drift)
    → 20260708191525: local=yes, remote=NO   (drift)
    → 20260713160532: local=yes, remote=NO   (drift)
    → 20260623014157: local=NO,  remote=yes  (drift)
    → (9 other entries: clean match)

STEP 1 — repair 3 local-only entries (CLI writes 3 rows into
         supabase_migrations.schema_migrations on the remote; does NOT
         touch any application table):
  supabase migration repair --status applied 20260618150431 --linked
  supabase migration repair --status applied 20260708191525 --linked
  supabase migration repair --status applied 20260713160532 --linked

STEP 2 — recreate the 1 remote-only entry's local file (pure file write,
         no DB connection involved, no SQL executed):
  supabase/migrations/20260623014157_rename_weekly_reports_to_reports.sql
    ← exact text of the `statements` array already retrieved from remote

AFTER:
  supabase migration list --linked
    → all 12 entries: local=yes, remote=yes  (clean)
  supabase db push --linked
    → "Remote database is up to date" (no pending migrations)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `repair --status applied` for the 3 local-only + recreate local file for the 1 remote-only (proposed) | Matches ground truth exactly (all 4 migrations genuinely ran); zero risk of re-execution since `repair` never runs SQL and the recreated file is never applied; closes the drift permanently | Requires 3 CLI commands against the live-linked project's bookkeeping (not app data) | **Chosen** — confirmed by Amaury (Option A) |
| `repair --status reverted 20260623014157` instead of recreating the local file | One command instead of a file creation | Bookkeeping-inaccurate — the rename genuinely happened and `reports` is the live table name; marking it "reverted" asserts something false and could confuse a future `db diff`/`db pull` into thinking `weekly_reports` should still exist | Rejected — explicitly decided against per Amaury's Option A choice |
| `supabase db pull` to auto-generate the missing local file | Fully automated, guaranteed to match remote exactly | Pulls the *entire* current remote schema into a new migration file, not just the one missing entry — much larger, harder-to-review diff; risks capturing unrelated live-only state as a "new" migration | Rejected — manual recreation from the already-retrieved `statements` text is more precise and matches exactly what's needed |
| Leave the drift as-is, work around it forever with `db query --linked` | Zero effort now | Every future `db push` keeps failing with the same error; the workaround (`db query --linked`) bypasses the CLI's own safety tracking, which is worse practice long-term | Rejected — this is the condition being fixed |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/20260623014157_rename_weekly_reports_to_reports.sql` | CREATE | Recreates the local record of an already-applied remote migration, verbatim from its stored `statements`. Never executed. |
| Remote `supabase_migrations.schema_migrations` table | MODIFY (via CLI, not a file) | 3 new rows inserted via `migration repair --status applied`, recording that `20260618150431`, `20260708191525`, and `20260713160532` are applied — no SQL from those files is re-run. |

No other local file, and no `src/`/`scripts/` file, is touched.

## Protected Zone Impact

Per `CLAUDE.md`'s File Permission Matrix, "Any DB migration" is Protected — this qualifies (new file under `supabase/migrations/`, plus remote migration-history mutation via CLI), even though no schema or data changes.

⚠️ **Requires Amaury confirmation before implementation.** (Note: the request states repair-command syntax and the Option A decision were already confirmed by Amaury during/after the diagnostic — the standard `tasks.md` Pre-Implementation checkbox still gates `/implement`, per this project's consistent spec-approval convention.)

## Database Changes

None to schema, columns, indexes, RLS, or data. Only the CLI's own internal bookkeeping table (`supabase_migrations.schema_migrations`) gains 3 rows reflecting already-true state.

## Open Questions

- None. The diagnostic fully identified both sides of the drift, live-schema integrity was independently confirmed for all 3 local-only migrations, and Amaury has already chosen Option A for the remote-only entry.
