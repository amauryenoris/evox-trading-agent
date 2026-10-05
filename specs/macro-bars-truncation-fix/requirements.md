# Requirements — Fix Truncated Macro/Sector Bar Fetch + Staleness Guard

## Background

STEP 0 (2026-10-03, prior session) proved mechanistically (live Alpaca GETs reproduced stored values to 6 decimal places): the five calls `getBars('SPY'|'GDX'|'XLE'|'XLK'|'VIXY', '1Day', 400)` in `runAgentCycle()` pass only 3 arguments, so `alpaca.ts`'s `getBars()` default `limit=250` applies. With `sort=asc` and no pagination (`next_page_token` is present in the response but never read), a 400-calendar-day window (~276 trading days) gets truncated to the **oldest** 250 bars — the data used is `next_page_token`-confirmed stale by ~5 weeks (live-tested on 2026-10-03: last bar returned was `2026-08-27`). This produces wrong sector RS (`sector-rotation.ts`), wrong SPX snapshot (`state-fingerprint.ts`: `spx_price`/`spx_sma50`/`spx_sma200`/`spx_regime`), wrong VIXY change, a wrong narrative, wrong dashboard values, and wrong per-trade `indicators.sectorRotation`.

**Re-verified this session** (2026-10-05), exact current locations, unchanged since STEP 0:
```
claude-agent.ts:1194  getBars('SPY', '1Day', 400).catch(...)
claude-agent.ts:1198  getBars('GDX', '1Day', 400).catch(...)
claude-agent.ts:1202  getBars('XLE', '1Day', 400).catch(...)
claude-agent.ts:1206  getBars('XLK', '1Day', 400).catch(...)
claude-agent.ts:1210  getBars('VIXY', '1Day', 400).catch(...)
```
```
claude-agent.ts:1216  const spxSnapshot = computeSpxSnapshot(spyBars)
claude-agent.ts:1218  const sectorRotation = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)
claude-agent.ts:1222  const vixyChangePct = computeVixyChangePct(vixyBars)
```

**Every other `getBars()` call site, checked this session** (answers the VERIFY section's "report only" item in advance — re-confirm live at implementation time per usual practice):

| Call site | `daysBack` | `limit` | Trading days in range vs. limit | Truncated? |
|---|---|---|---|---|
| `claude-agent.ts:1194,1198,1202,1206,1210` (SPY/GDX/XLE/XLK/VIXY, macro/sector) | 400 | 250 (default — omitted) | ~276 > 250 | **Yes — the bug** |
| `claude-agent.ts:1328,1363,1383` (per-symbol indicators, 3 sites) | 300 | 300 (explicit) | ~214 < 300 | No |
| `run-cycle.ts:29` (per-symbol, exit-only runner) | 300 | 300 (explicit) | ~214 < 300 | No |
| `app/api/performance/route.ts:94` (`getBars('SPY', '1Day', 2)`) | 2 | 250 (default) | ~1-2 < 250 | No |
| `scripts/position-health-check.ts:80,98` | 400 | 400 (explicit) | ~276 < 400 | No |
| `scripts/daily-bars-sync.ts:61` | 400 | 400 (explicit) | ~276 < 400 | No |

Confirms context's claim exactly: **only the 5 macro/sector calls are truncated.** Every other site either explicitly matches `limit` to `daysBack` (the `(400, 400)` precedent this fix follows) or requests a window short enough that the 250 default never binds.

**Likely contributing cause, found this session, not in scope to fix here**: `.claude/skills/alpaca-patterns.md:75-76` documents `getBars()`'s signature incorrectly:
```ts
const bars = await getBars(symbol, '1Day', 300, 300)
// args: symbol, timeframe, limit, feed_delay_minutes
```
The real signature is `(symbol, timeframe, daysBack, limit)` — the skill mislabels the 3rd argument as `limit` (it's `daysBack`) and invents a non-existent 4th `feed_delay_minutes` argument. Whoever wrote the 3-argument macro/sector calls may reasonably have believed, per this doc, that the 3rd argument already *was* the limit. Noted here as a plausible root cause worth a future, separate doc fix — not touched by this change (not in the `claude-agent.ts` / helper file / test file diff this change is scoped to).

**FAIL FAST check performed this session** — tracing every consumer of `spxSnapshot`/`sectorRotation`/`vixyChangePct` to confirm treating a stale symbol as unavailable (empty bars → existing null path) cannot crash anything:
- `computeSpxSnapshot([])` → `bars.length < 2` → all-null object (`state-fingerprint.ts:54-56`). Safe.
- `computeSectorRotation` with an empty `spyBars` → `spyReturn === null` → all-null object (`sector-rotation.ts:25-27`); with only one empty sector array, that sector alone is null, others compute normally (sectors are independent once `spyReturn` exists). Safe.
- `computeVixyChangePct([])` → `bars.length < 3` → null (`market-daily-briefing.ts:17`). Safe.
- `formatSpxSnapshotContext`/`formatSectorRotationContext`/`formatSectorRotationSnapshot`/`formatVixyChangeContext` all already render `"...: no data"` / `"SPX: no data"` for null fields (`state-fingerprint.ts` callers, `sector-rotation.ts:41-50`, `market-daily-briefing.ts:63-87`). Safe.
- `generateDailyBriefing()` passes these "no data" strings into Claude's narrative prompt — plain text, no crash risk — and `buildBriefingRecord` copies nulls straight into nullable DB columns (every `market_daily_briefings` numeric column is nullable per its migration). Safe.
- Dashboard: `BuyScannerPanel.tsx:23-26`'s `fmtPct(n)` already returns `'—'` for `null`. Safe.
- Per-trade: `indicatorsAtBuy.sectorRotation = sectorRotation` stores an object that may have null fields inside a JSONB column — no schema constraint requires non-null. Safe.

**Conclusion: FAIL FAST is not triggered.** Every consumer already tolerates null/unavailable macro data; this change does not introduce a new failure mode, it makes an existing, already-null-safe path trigger under a new (correct) condition.

**One pre-existing behavior this change interacts with, not altered by it**: `generateDailyBriefing()` (`market-daily-briefing.ts:154-175`, explicitly forbidden to touch) only synthesizes once per UTC `briefing_date` — later cycles the same day reuse the cached row. If the *first* cycle of a day hits stale bars (nulls persisted), that day's row stays null-filled even if a later cycle that same day would have fetched fresh data. This is existing, unchanged behavior; noted here so it isn't mistaken for a new defect once this fix ships.

---

## Functional Requirements

FR-01: The system shall pass an explicit `limit` of 400 to each of the five macro/sector `getBars()` calls (`SPY`, `GDX`, `XLE`, `XLK`, `VIXY`), matching their `daysBack` of 400.

FR-02: The system shall not add any pagination logic (`next_page_token` handling) as part of this change.

FR-03: The system shall provide a pure function that, given a bars array and a reference date, returns whether the newest bar in that array is older than `STALE_MACRO_BARS_MAX_DAYS`.

FR-04: The system shall define `STALE_MACRO_BARS_MAX_DAYS` as a named constant equal to 5 (calendar days).

FR-05: Where a bars array is empty, the staleness function shall report it as stale.

FR-06: For each of the five macro/sector fetches, the system shall apply the staleness check after the fetch resolves (success or caught failure) and before that data is used by any computation.

FR-07: Where a fetch's data is found stale, the system shall log `[STALE_MACRO_BARS] symbol=X lastBar=YYYY-MM-DD ageDays=N` naming that specific symbol, its last bar's date, and its age in days.

FR-08: Where a fetch's data is found stale, the system shall treat that symbol's data as unavailable to downstream computation in the same way the existing `.catch()` fallback already does (i.e., substitute an empty array), producing null outputs through the existing, already-null-safe formulas — not a new null-handling branch.

FR-09: The system shall apply the staleness check uniformly to all five symbols (SPY, GDX, XLE, XLK, VIXY) — no symbol-specific exception.

FR-10: The system shall not change `compute-spx-snapshot-window.test.ts`'s existing expectations; where its "~276 bars from a 400-calendar-day fetch" comment is now inconsistent with the corrected fetch behavior, the system shall update only that comment.

---

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero errors after the change.

NFR-02: The full existing test suite shall pass with no regressions, plus new tests for the staleness helper.

NFR-03: The change shall not alter the RS formula (`sector-rotation.ts`), the SPX snapshot formula (`state-fingerprint.ts`), or the VIXY change formula (`market-daily-briefing.ts`).

NFR-04: The change shall not alter any per-symbol indicator bar fetch (the 5 confirmed-unaffected call sites in the Background table).

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. **⚠️ Requires Amaury's explicit confirmation before implementation**, separate from spec approval, per `CLAUDE.md`'s File Permission Matrix and `specs/README.md`'s Protected Zone rule.

C-02: No change to `alpaca.ts`, `sector-rotation.ts` formulas, `state-fingerprint.ts` formulas, `market-daily-briefing.ts`, any db file, or any migration.

C-03: No change to any per-symbol bar fetch.

C-04: No backfill or rewrite of already-stored `market_daily_briefings` rows or already-stored per-trade `indicators.sectorRotation` — that is an explicitly separate, future decision.

C-05: `risk-manager.ts`, `indicators.ts`, `config.ts`, and `learning.ts` shall not be touched.

C-06: The new staleness-check function shall be pure (no I/O, no `Date.now()`/`new Date()` call inside it) — the reference date is always passed in by the caller.

---

## Out of Scope

- Pagination / following `next_page_token` to fetch more than 250 bars in one logical request
- Fixing `.claude/skills/alpaca-patterns.md:75-76`'s incorrect parameter documentation (noted as a plausible contributing cause, left for a separate change)
- Backfilling or correcting already-stored `market_daily_briefings` rows or already-stored per-trade `indicators.sectorRotation`/`indicators.spx_*` fields
- Changing `generateDailyBriefing()`'s once-per-UTC-day caching behavior
- Any dashboard change (the existing `fmtPct`/`isStale` null-rendering in `BuyScannerPanel.tsx` already handles the corrected null outputs correctly, with no code change needed there)
- Any gate or learning-code change (confirmed in STEP 0: RS is not consumed by `risk-manager.ts` or `learning.ts` at all)
