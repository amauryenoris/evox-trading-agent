# Review Report — Always sync sector-proxy ETFs into daily_bars

**Date**: 2026-10-13
**Reviewer**: Claude (automated)
**Status**: APPROVED (HIGH-1 resolved: backfill switched to raw on 2026-10-13; dry-run re-run shows 0 existing rows would change and 0 split-vs-raw differences)

Verification basis: static review of the diff (`scripts/daily-bars-sync.ts` +149/-29, new `scripts/daily-bars-sync.test.ts`),
`npx tsc --noEmit` (clean), ESLint on both files (0 errors), full Vitest run (56 files / 611 tests pass),
`npm run build` (succeeds), coverage of the script (82.6% statements, 80.4% lines, 71.8% branches), and one read-only
dry-run of `.tmp/sector-proxy-dryrun.ts` against the real Supabase and Alpaca data (nothing written).
**Not run:** the real write, a scheduled/GitHub run, and `npm run daily-bars-sync` end to end (`--env-file=.env.local`
returned "Invalid API key" in `getOpenPositionContexts`, a path this change did not touch).

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Export `SECTOR_PROXY_ETFS` with the 11 symbols | ✅ | Exact list asserted |
| FR-02 | ETFs in the universe on every run | ✅ | `buildUniverse` used by both return paths |
| FR-03 | Each ETF exactly once | ✅ | `Set`; tested with overlap |
| FR-04 | Existing universe sources unchanged | ✅ | Open positions + 7-day candidates |
| FR-05 | ETFs kept when `selection_history` fails | ✅ | Tested |
| FR-06 | No other symbol filtered or altered | ✅ | No filter added |
| FR-07 | Count stored rows per ETF before fetching | ✅ | `countStoredRows` (head/count) |
| FR-08, FR-09 | Backfill below 400, not at 400 or more | ✅ | Tested at 399, 400, 401 |
| FR-10 | Decision only for ETFs | ✅ | Non-ETF never counts rows (asserted) |
| FR-11 | Existing path for the rest | ✅ | `getBars(symbol,'1Day',400,400)` as before |
| FR-12 | Count failure → one error line, normal path | ✅ | Tested |
| FR-13 | Up to 400 most recent trading days | ✅ | |
| FR-14 | Ascending | ✅ | `sort=asc` asserted |
| FR-15 | Explicit limit | ✅ | 1000 per page |
| FR-16 | Follow the page token | ✅ | Two-page test |
| FR-17 | Window with at least 400 trading days | ✅ | 620 calendar days; test asserts ≥580 |
| FR-18 | Keep only the latest 400 | ✅ | 450-bar test |
| FR-19 | Same feed as `getBars` | ✅ | `sip` |
| FR-20 | Split-adjusted request | ⚠️ | Implemented as written, but Open Question 1's own rule says raw when the dry-run shows differences, and it does. See HIGH-1 |
| FR-21 | Same row mapping as the existing path | ✅ | `toRows` is the old mapping extracted unchanged |
| FR-22 | One fetch path per symbol per run | ✅ | Backfill returns instead of falling through; tested |
| FR-23 | Existing upsert on `symbol,bar_date` | ✅ | `main()` upsert unchanged |
| FR-24 | No duplicate key in a batch | ✅ | `dedupeRows`; tested with a repeated bar |
| FR-25 | Dry-run gate kept | ➖ | `main()` gate unchanged by diff; no automated test |
| FR-26 | No row deleted | ✅ | No delete call exists |
| FR-27 | Only `daily_bars` written | ✅ | Reads `selection_history` and `daily_bars` only |
| FR-28 | One error line per failing symbol | ✅ | Asserted on the `[DAILY_BARS_ERROR] BAD` line |
| FR-29 | Continue after a failure | ✅ | Tested |
| FR-30 | Failures counted in `failed` | ✅ | Tested for normal and ETF paths |
| FR-31 | Exit-code behavior unchanged | ➖ | `main().catch` / `process.exit(1)` kept inside the guard; not executed |
| FR-32 | Summary line unchanged | ✅ | Same format |
| FR-33 | Log line per backfilled symbol | ⚠️ | `[DAILY_BARS_BACKFILL] symbol stored fetched` present; no test asserts it |
| FR-34 | Import does not start a run | ✅ | Captured calls at import time equal zero; guard verified under Vitest |
| FR-35 | Run starts under `npm run daily-bars-sync` | ✅ | Observed under `tsx` (it reached `getOpenPositionContexts`) |
| NFR-01 | No dependency, no `package.json` change | ✅ | `git status` |
| NFR-02 | Functions <50 lines, file <800 | ✅ | 228 lines; longest `fetchHistoryBars` ~28 |
| NFR-03 | No `any` | ✅ | One `as never` in a test only |
| NFR-04 | Named constants | ✅ | |
| NFR-05 | ≥80% coverage | ✅ | 80.4% lines; uncovered lines are `main()` and the guard |
| NFR-06 | tsc / suite / build | ✅ | |
| NFR-07 | No secret printed | ✅ | Headers never logged; dry-run output has counts and dates only |
| NFR-08 | Idempotent | ✅ | Upsert keyed on the unique pair |
| C-01, C-02 | No Protected Zone, `db.ts`, `types.ts`, `alpaca.ts`, migrations, workflows, dashboard, `package.json` change | ✅ | `git status`: only the script, its test and the spec folder |
| C-03 | No deletes; penny-stock rows untouched | ✅ | See HIGH-1 for modification of existing ETF rows |
| C-04 | Real write not executed | ✅ | Dry-run only |
| C-05 | Verification script in `.tmp/`, read-only, no keys | ✅ | `.tmp/` is gitignored |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A — no agent code touched |
| Supabase patterns | ✅ | Errors checked (`count` read throws on `error`; upsert error logged as before); the count query is a head request returning no rows; no `any` on results beyond the existing `candidates_offered` cast; no new table. The "all DB access through `db.ts`" guideline is not followed, as in the existing script and its precedent |
| TypeScript quality | ✅ | No `any`; no mutation of inputs; named constants; booleans named `isSectorProxy` |
| Security | ✅ | Keys read from env, never logged; Alpaca error bodies are included in thrown messages, which is how `alpaca.ts` already behaves |

## Task Checklist

- Implementation tasks: 23/23 completed
- Post-implementation: 3 items. "Run /review" and "Confirm Protected Zone files unchanged" are covered by this report;
  "After deploy: check the first `[DAILY_BARS_DONE]` line" can only happen after deploy and stays open by design.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
1. **RESOLVED (raw chosen). The adjustment choice was unresolved and the dry-run contradicts the design's own condition.** FR-20 asks for
   `split`, and Open Question 1 said to keep it only if raw and split showed no difference in the window. The dry-run
   shows 186 differing bars each for XLE, XLK and XLY (a split inside the window). Effects under `split`:
   - 89 existing XLE rows would be overwritten with different values. The original request forbids modifying existing
     rows.
   - The series becomes mixed: the unchanged incremental path rewrites the last ~400 calendar days in raw on every
     run, so adjusted values survive only on dates older than that, leaving a discontinuity at the split date.
   Options: (A) keep `split` and accept the mix; (B) set `BACKFILL_ADJUSTMENT` to `'raw'`: no existing row changes
   and the data matches everything else in the system, with a price jump at the split date; (C) make the incremental
   path split-adjusted for these ETFs too: a continuous series, but outside this spec. Recommended: B now, C as its
   own change if the relative-strength calculation needs continuity. Decide before the first scheduled run.

### MEDIUM (consider fixing)
1. **First live batch.** The nine empty ETFs add 3,600 rows and XLE/SPY add about 220 more to the single upsert. If the
   batch is rejected, the existing code logs the error and exits 0, so the day's sync would be lost without a failed
   job. Check the first `[DAILY_BARS_DONE]` line after deploy. Chunking is out of scope.
2. **`npm run daily-bars-sync` was not exercised end to end.** The only attempt failed on `--env-file` parsing of
   `.env.local` before reaching the new code, so the guard was verified under `tsx` only up to the first Supabase call.
   The workflow injects real secrets, so this is expected to work, but it is unproven.
3. **Branch coverage is 71.8%.** Line coverage meets the 80% target only because the tests exercise the new
   functions; `main()` (dry-run gate, upsert error branch) has no test.

### LOW (optional)
1. FR-33's backfill log line has no assertion, and FR-25 / FR-31 rest on code that did not change.
2. `require.main === module` depends on the project staying CommonJS-style under `tsx`; a future `"type": "module"`
   would make the script silently do nothing. The test of import behavior would not catch that.
3. SPY (280 rows) and XLE (302 rows) already have data, so their backfill overlaps stored dates; with `raw` this is a
   no-op rewrite of identical values, which the dry-run confirmed for SPY (0 changes).
4. Line endings: git warns that LF becomes CRLF for the script (Windows setting), no content impact.
5. The `getBars` JSDoc says `iex` is required while the code sends `sip`; noted in T-01, not changed here.

---

## Decision

**APPROVED WITH WARNINGS** — one HIGH finding: the adjustment choice (`split` vs raw) is a decision for Amaury before
deploy; everything else matches the spec. Not committed.
