# Review Report — Backfill SPX Regime into trade_evaluations

**Date**: 2026-06-16
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Query trade_evaluations WHERE spx_price IS NULL AND buy_timestamp >= '2026-04-20' ORDER ASC | ✅ | Lines 47–52: `.is('spx_price', null).gte('buy_timestamp', '2026-04-20').order('buy_timestamp', { ascending: true })` |
| FR-02 | SPY bar range: earliestBuyDate − 250 cal days … latestBuyDate + 5 cal days | ⚠️ | **Approved deviation**: 250 → **400** calendar days (L68). Change explicitly approved by Amaury after dry run revealed insufficient_bars for Apr 2026 trades (250 days only covers ~178 trading days, SMA200 needs 200). Spec text should be updated to 400. |
| FR-03 | Single bulk HTTP request to Alpaca bars endpoint | ✅ | Lines 84–95: one `fetch()` call. All trades share the same bars array. |
| FR-04 | Convert buy_timestamp to ET date (America/New_York) | ✅ | `toEtDate()` L33–37 uses `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`. Exact spec body. |
| FR-05 | Prior bar = last bar with date strictly < ET trade date (no lookahead) | ✅ | L108: `if (bars[j].date < tradeDate)` — strict less-than. Iterates backwards. |
| FR-06 | Skip + log `[BACKFILL_SKIP] reason=no_prior_bar` when no prior bar | ✅ | L114–117: `i === -1` guard with correct log format. |
| FR-07 | SMA50 using 50 closes at reference index | ✅ | L122: `smaAtIndex(closes, i, 50)`. `smaAtIndex` slices `[i-49, i+1]`. |
| FR-08 | SMA200 using 200 closes at reference index | ✅ | L123: `smaAtIndex(closes, i, 200)`. `smaAtIndex` slices `[i-199, i+1]`. |
| FR-09 | Skip + log `[BACKFILL_SKIP] reason=insufficient_bars` when sma50 or sma200 null | ✅ | L125–129: `if (sma50 === null \|\| sma200 === null)`. |
| FR-10 | Regime: BULL if spyClose > sma200; CAUTION if spyClose > sma50; else BEAR | ✅ | L132: `spyClose > sma200 ? 'BULL' : spyClose > sma50 ? 'CAUTION' : 'BEAR'`. Exact spec logic. |
| FR-11 | Dry run: log [BACKFILL_DRY] per trade + [BACKFILL_DRY_DONE] summary, no Supabase writes | ✅ | L136–139 (log), L163–164 (summary). No `.update()` in dry path. |
| FR-12 | UPDATE with idempotency guard `WHERE id = X AND spx_price IS NULL` | ✅ | L142–151: `.update({...}).eq('id', trade.id).is('spx_price', null)`. |
| FR-13 | Log `[BACKFILL] id=... symbol=... buy=... spy=... sma50=... sma200=... regime=...` | ✅ | L157: `console.log(\`[BACKFILL] ${logLine}\`)`. Format matches spec. |
| FR-14 | `[BACKFILL_DONE] updated=N skipped=N failed=N` after live run | ✅ | L166. |
| FR-15 | `[BACKFILL_ERROR]` + `process.exit(1)` on Alpaca fetch failure | ✅ | L86–88 (non-ok response) + L92–94 (catch block). Both paths exit(1). |
| FR-16 | `[BACKFILL_ROW_ERROR] id=UUID` + continue on per-row Supabase failure | ✅ | L153–155: logs error, increments `failed`, loop continues. |
| FR-17 | No modification to rows where spx_price IS NOT NULL | ✅ | Double guard: STEP 1 SELECT filters to IS NULL; UPDATE uses `.is('spx_price', null)`. |
| FR-18 | No modification to any other table | ✅ | Only `from('trade_evaluations')` in the script. |
| NFR-01 | Runnable with `npx tsx` — no extra installs | ✅ | Only import is `@supabase/supabase-js`, already in project dependencies. |
| NFR-02 | Exactly one Alpaca HTTP request | ✅ | Single `fetch()` at L84. Per-trade loop uses in-memory `bars` array. |
| NFR-03 | Header comment documents methodology | ✅ | Lines 1–17: no-lookahead bias, ET date conversion, prior-close snapshot, regime logic, usage examples. |
| C-01 | No file in `src/` modified | ✅ | Git diff: only `scripts/` and `specs/` paths. |
| C-02 | Only `scripts/backfill-spx-regime.ts` created | ✅ | Confirmed — no existing file modified. |
| C-03 | Regime labels frozen as BULL / CAUTION / BEAR | ✅ | L132: only these three values possible. |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |
| `src/lib/db.ts` | UNTOUCHED | Script replicates `createClient` inline as designed. |
| `src/lib/alpaca.ts` | UNTOUCHED | Script replicates auth headers inline as designed. |

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `claude-agent.ts` not touched. |
| Supabase patterns | ✅ | `createClient` used with service role key. `.is()` / `.eq()` / `.gte()` parameterized — no SQL injection vectors. Error checked at L54. No `any` casts on query results. |
| TypeScript quality | ⚠️ | `main()` is ~120 lines (over the 50-line function guideline). Acceptable for a one-off script's single entry point — no logical case to split. `400` at L68 is an inline number (magic). Minor. |
| Security | ✅ | No hardcoded secrets. Auth from `process.env.*`. Supabase client uses service-role key server-side only. `console.log` never prints secret values. |

---

## Task Checklist

- Pre-implementation: **3/3** ✅
- STEP 0 (T-00a/b/c): **3/3** ✅
- Phase 1 (T-01–T-13): **13/13** ✅
- Phase 2 (T-14): **1/1** ✅ (T-15 is informational — no checkbox)
- Phase 3 (T-16–T-18): **3/3** ✅
- Post-implementation: pending this review

**Completed: 23/23 checkboxes**

---

## Findings

### CRITICAL (blocks merge)

None.

### HIGH (should fix)

None.

### MEDIUM (consider fixing)

- ~~**FR-02 spec drift**: spec said `250 calendar days`, implementation uses `400`.~~ → **Resolved** in `fix-backfill-spx-cleanup` (2026-06-16).
- ~~**Empty-trades early exit logs dry-run summary in live mode**: always logged `[BACKFILL_DRY_DONE]` regardless of `RUN_BACKFILL`.~~ → **Resolved** in `fix-backfill-spx-cleanup` (2026-06-16).

### LOW (optional)

- **Magic number `400`** (L68): Could be named constant `const SPY_LOOKBACK_CALENDAR_DAYS = 400` for readability.
- **No `.limit()` on STEP 1 SELECT**: The Supabase query has no `.limit()`. Safe in practice because the `buy_timestamp >= '2026-04-20'` filter bounds the result set, but violates the Supabase pattern guideline of always bounding queries. Consider `.limit(10000)` as a defensive ceiling.
- **Env vars not validated at startup**: `ALPACA_API_KEY!`, `ALPACA_SECRET_KEY!`, `SUPABASE_URL!`, `SUPABASE_SERVICE_ROLE_KEY!` use non-null assertions but no explicit check. Missing env vars will produce a cryptic runtime error rather than a clear `[BACKFILL_ERROR]` message.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. The two MEDIUM issues identified at review time were resolved in `specs/fix-backfill-spx-cleanup` (2026-06-16). LOW findings remain optional.
