# Tasks — Reconcile Supabase Migration History

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — DB migration bookkeeping, per `CLAUDE.md` File Permission Matrix
- [x] Database migrations drafted — see Phase 2 below (file recreation only, no new schema)

## Implementation Checklist

### Phase 1 — Baseline (re-confirm live state immediately before changing anything)
- [x] T-01: Run `supabase migration list --linked` and record the exact baseline output. Confirmed matches the diagnostic exactly: 3 local-only (20260618150431, 20260708191525, 20260713160532), 1 remote-only (20260623014157), 9 clean matches.
- [x] T-02: Re-run the 7 live-schema integrity checks from the diagnostic. All 7 read `true`, unchanged from the diagnostic.

### Phase 2 — Repair local-only entries
- [x] T-03: Run `supabase migration repair --status applied 20260618150431 --linked`. Output: "Repaired migration history: [20260618150431] => applied".
- [x] T-04: Run `supabase migration repair --status applied 20260708191525 --linked`. Output: "Repaired migration history: [20260708191525] => applied".
- [x] T-05: Run `supabase migration repair --status applied 20260713160532 --linked`. Output: "Repaired migration history: [20260713160532] => applied".

### Phase 3 — Recreate remote-only entry's local file
- [x] T-06: Created `supabase/migrations/20260623014157_rename_weekly_reports_to_reports.sql` with exactly the SQL retrieved from remote's `statements` column (dedupe DELETE, RENAME TABLE, ADD CONSTRAINT, RENAME INDEX) — file write only, not executed against any database.

### Phase 4 — Verification
- [x] T-07: Run `supabase migration list --linked` again — confirmed all 13 entries (12 original + the newly-recreated 20260623014157) now show matching `local`/`remote` values, zero drift rows.
- [x] T-08: Run `supabase db push --linked` — confirmed output: "Remote database is up to date." No pending migrations, no SQL executed.
- [x] T-09: Re-ran the same 7 live-schema integrity checks from T-02, plus a bonus 8th check (`reports` table exists, confirming the earlier rename is still intact and untouched by this reconciliation) — all 8 read `true`, byte-identical to baseline. Zero schema/data impact confirmed.
- [x] T-10: Ran `git status --short` / `git diff --stat` — confirmed exactly 1 new file (`20260623014157_rename_weekly_reports_to_reports.sql`) plus the new spec directory, zero modified files, zero `src/`/`scripts/` paths touched.

## Post-Implementation

- [x] Run `/review reconcile-migration-history` to verify implementation matches spec — see `review.md`, APPROVED (0 findings above LOW)
- [x] Confirm Protected Zone diff is exactly the 1 new migration file — no application code touched. Confirmed via T-10.
- [ ] Note for Amaury: future migrations should use `supabase db push` (not `db query --linked`) now that history is reconciled, to avoid reintroducing this same drift — informational, not a task in this spec

## Estimated Complexity

**Low** — 3 CLI bookkeeping commands (no SQL execution) + 1 new file that is also never executed. Zero schema/data risk, confirmed twice (before and after) via the same 7 integrity checks. The only real risk is human error in the repair command syntax (wrong version number or wrong `--status` value), mitigated by using the exact commands already validated in the diagnostic and design.md.
