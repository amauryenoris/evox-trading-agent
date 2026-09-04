# Tasks — daily_bars sync script + workflow (CHANGE 2 of 2 for historical OHLC persistence)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, no Protected Zone files touched
- [x] Database migrations drafted — N/A, no schema changes (CHANGE 1 is closed)

## Implementation Checklist

### Phase 1 — Script
- [x] T-01: Create `scripts/daily-bars-sync.ts` exactly as specified in the FIX/PROMPT: own `createClient()` instance, `getSymbolUniverse()` (open positions ∪ last-7-days `selection_history.candidates_offered` symbols, deduplicated), `main()` fetching `getBars(symbol, '1Day', 400, 400)` per symbol with per-symbol try/catch (log + skip on failure), row-mapping (`bar_date` from `AlpacaBar.t.split('T')[0]`), `RUN_DAILY_BARS_SYNC === 'true'` dry-run gate, single batch `.upsert(rows, { onConflict: 'symbol,bar_date' })`, `processed`/`failed` counters, one `[DAILY_BARS_DONE]` summary log per exit path, top-level `main().catch(...)` with `process.exit(1)`.
- [x] T-02: Add `"daily-bars-sync": "tsx scripts/daily-bars-sync.ts"` to `package.json`'s `"scripts"` block, alongside `"health-check"`. No other line changed.
- [x] T-03: Confirm no other file is created or modified (`scripts/position-health-check.ts`, `.github/workflows/position-health.yml`, `alpaca.ts`, `db.ts` all untouched).

### Phase 2 — Workflow
- [x] T-04: Create `.github/workflows/daily-bars-sync.yml` mirroring `position-health.yml`'s structure: `cron: "0 21 * * 1-5"` + `workflow_dispatch`, `concurrency` group `daily-bars-sync`, standard secrets block, `npm ci` → `npm audit --audit-level=critical` → `npm run daily-bars-sync`, `RUN_DAILY_BARS_SYNC: "true"` env var.

### Phase 3 — Verification
- [x] T-05: Confirm `getSymbolUniverse()` correctly unions and deduplicates open-position symbols and last-7-days `candidates_offered` symbols. Confirmed by inspection: `[...new Set([...openSymbols, ...candidateSymbols])]` (daily-bars-sync.ts, `getSymbolUniverse()`) spreads both arrays into one `Set`, which dedupes; live exercise via dry run was attempted but blocked by an unrelated environment issue — see T-12.
- [x] T-06: Confirm the script defaults to dry-run (`RUN_DAILY_BARS_SYNC` unset) and only writes when explicitly set to `'true'`. Confirmed by inspection: `const isLive = process.env.RUN_DAILY_BARS_SYNC === 'true'`, and the `.upsert()` call is only reached inside `if (isLive)`'s else-branch-avoided path — i.e. the write is skipped whenever `isLive` is falsy, identical to `position-health-check.ts`'s `RUN_HEALTH_CHECK` gate.
- [x] T-07: Confirm `onConflict: 'symbol,bar_date'` matches `daily_bars`' live `UNIQUE (symbol, bar_date)` constraint's column composition. Re-verified live via `npx supabase db query --linked` against `pg_constraint`: `daily_bars_symbol_bar_date_key` — `UNIQUE (symbol, bar_date)`. Matches exactly.
- [x] T-08: Confirm `bar_date` is correctly derived from `AlpacaBar.t` as a plain date string matching the `DATE` column type. Confirmed by inspection: `bar.t.split('T')[0]` takes the ISO timestamp's date portion (e.g. `"2026-09-04T00:00:00Z"` → `"2026-09-04"`), a valid `DATE`-typed literal for Postgres/PostgREST.
- [x] T-09: Run `npx tsc --noEmit` — must pass. Passed clean.
- [x] T-10: Run `npm run build` — must pass. Passed clean.
- [x] T-11: Decide whether a test file makes sense here. Confirmed via `Glob src/lib/__tests__/*position-health*` → no matches: `position-health-check.ts` has zero test coverage in this repo, despite being the established precedent this script mirrors. Decision: no test file for `daily-bars-sync.ts` either, for consistency with that precedent — this class of standalone, directly-Alpaca/Supabase-calling script isn't covered by this repo's existing test conventions (its indicator/decision *logic* lives in already-tested modules like `alpaca.ts`; the script itself is thin orchestration). Not written.
- [x] T-12: Perform a dry-run execution against live data. Attempted via `npx tsx --env-file=.env.local scripts/daily-bars-sync.ts` (RUN_DAILY_BARS_SYNC unset). **Blocked**: failed immediately in `getOpenPositionContexts()` with `Invalid API key`. Reproduced the identical failure by running the unmodified `scripts/position-health-check.ts` the same way — same error, same line (`db.ts:198`), confirming this is a pre-existing local-environment issue (`.env.local`'s `SUPABASE_SERVICE_ROLE_KEY` appears stale/invalid) unrelated to this CHANGE, not a defect in `daily-bars-sync.ts`. No Alpaca calls were reached (the script fails before the fetch loop), so the `getBars()`/row-mapping path could not be live-exercised either. No write to Supabase occurred (dry-run gate was never reached). Amaury should refresh `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` from the Supabase dashboard to unblock local dry-runs of either script — this does not block merging this CHANGE, since the workflow's GitHub Actions secret is a separate, independently-configured value.

## Post-Implementation

- [x] Run `/review` against this spec to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (git diff shows only the two new files plus the one-line `package.json` addition)

## Estimated Complexity

Low — the script and workflow are fully specified verbatim in the FIX/PROMPT, mirroring an existing, already-proven pattern (`position-health-check.ts` / `position-health.yml`) with no new architectural decisions. The main care point is re-verifying the `onConflict` column list against the live constraint rather than assuming it, as instructed.
