# Tasks — Buy Scanner Dashboard Tab (5th tab)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, this feature touches no Protected Zone file (see design.md)
- [x] Database migrations drafted — N/A, no schema changes

## Implementation Checklist

### Phase 1 — Data layer (`src/lib/db-market-briefing.ts`, `src/lib/db.ts`)

- [x] T-01: In `src/lib/db-market-briefing.ts`, add:
  ```ts
  export async function getLatestBriefing(): Promise<MarketDailyBriefing | null> {
    const db = getClient()
    const { data, error } = await db
      .from('market_daily_briefings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw new Error(`Failed to fetch market daily briefing: ${error.message}`)
    return (data?.[0] ?? null) as MarketDailyBriefing | null
  }
  ```
- [x] T-02: In `src/lib/db.ts`, add `getLatestBriefing` to the existing `export { getMarketDailyBriefingByDate, upsertMarketDailyBriefing } from './db-market-briefing'` block.
- [x] T-03: Confirm `getRecentSelections()` (already in `db.ts`) is not modified — it will be called as-is with `limit=5`.

### Phase 2 — API route

- [x] T-04: Create `src/app/api/buy-scanner/route.ts`:
  ```ts
  import { NextResponse } from 'next/server'
  import { getLatestBriefing, getRecentSelections } from '@/lib/db'

  export const dynamic = 'force-dynamic'

  export async function GET() {
    try {
      const [briefing, selections] = await Promise.all([
        getLatestBriefing(),
        getRecentSelections(5),
      ])
      return NextResponse.json({ briefing, selections })
    } catch (error) {
      console.error('[buy-scanner]:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
  ```

### Phase 3 — `BuyScannerPanel.tsx`

- [x] T-05: Create `src/components/dashboard/BuyScannerPanel.tsx` (`'use client'`), mirroring `PerformanceAnalytics.tsx`'s shape: `useState`/`useEffect` fetching `/api/buy-scanner` on mount, `animate-pulse` skeleton loading state, error state, imports from `./ui`. (`Dot` was not imported — no use for it emerged in the final layout, and importing it unused would replicate an existing dead-import pattern seen in `NearMissWatchlist.tsx` rather than avoid it. Used `Card`/`Badge` only.)
- [x] T-06: Briefing section — `Card` showing:
  - `spx_regime` via a local tone map (`BULL` → green, `CAUTION` → amber, `BEAR` → red, else neutral) rendered with `Badge`
  - `spx_price` vs. `spx_sma50`/`spx_sma200`
  - `gdx_relative_strength_pct` / `xle_relative_strength_pct` / `xlk_relative_strength_pct`
  - `macro_sentiment_bullish_count` / `bearish_count` / `neutral_count`
  - `vix_proxy_change`
  - `narrative` rendered as-is
  - Handle `briefing === null` with a calm "No briefing available" notice, not an error.
- [x] T-07: Selections section — most recent row: `selectedSymbols` list/chips, and for each selected symbol present in `candidateScores`, a per-candidate row (mirroring `PatternLibraryCard.tsx`'s divide-y row layout) showing `score`/`regime`/`risks`/`thesis`.
- [x] T-08: Older selections — remaining (up to 4) rows as a compact list: timestamp + `selectedSymbols` only, no scores.
- [x] T-09: Empty/stale notice — if `selections.length === 0`, or the most recent `createdAt` is older than a defined threshold (e.g. 2 calendar days — see design.md's note on why a simple calendar-day check is used instead of a trading-day-aware one in a client component), show a calm notice (e.g. "No selection cycles in the last N days"), not an error state.

### Phase 4 — Dashboard wiring (additive only)

- [x] T-10: In `src/components/dashboard/DashboardTabs.tsx`, add `{ id: 'scanner', label: 'Buy Scanner', kicker: '05' }` to the `TABS` array. No other line changes.
- [x] T-11: In `src/app/dashboard/page.tsx`, import `BuyScannerPanel` and add:
  ```tsx
  scanner: (
    <div className="space-y-5">
      <ZoneTitle
        kicker="05 · Buy Scanner"
        title="What the scanner is considering"
        subtitle="Today's market briefing and the candidates behind the most recent selection cycles."
      />
      <BuyScannerPanel />
    </div>
  ),
  ```
  No other line in `page.tsx` changes.

### Phase 5 — Testing

- [x] T-12: Add `src/lib/__tests__/db-market-briefing.test.ts` coverage for `getLatestBriefing()` (mirroring the existing `getMarketDailyBriefingByDate`/`upsertMarketDailyBriefing` describe blocks in the same file): returns the row when found, returns `null` when no rows exist, throws on a Supabase error.
- [x] T-13: No new tests for the API route or `BuyScannerPanel.tsx` — consistent with this repo's existing convention (no test files exist for any `src/app/api/**` route or `src/components/dashboard/**` component today). Verify these by manual/live inspection instead (Phase 6).

### Phase 6 — Verification

- [x] T-14: Confirm the new tab appears as the 5th entry in the dashboard nav, in the correct position, and the 4 existing tabs behave unchanged. Verified via code diff: `TABS` array now has 5 entries in order (portfolio/intelligence/analytics/reports/scanner), `tabs` object has the corresponding 5th key; `git diff` confirms zero changes to the 4 existing entries.
- [x] T-15: Confirm `/api/buy-scanner` returns real data matching a live sample row from both `market_daily_briefings` and `selection_history` — **confirmed via `npx supabase db query --linked`** (the CLI's own auth, independent of the app's `.env.local` service-role key — see blocker note below). Latest briefing: `2026-09-10`, `spx_regime=BULL`, `spx_price=757.67`, narrative present. Latest 5 `selection_history` rows: all from `2026-09-10`, 6-8 `selected_symbols` each, `candidate_scores` array length matching `candidates_offered` length (30-31) in every row — exactly the shape `BuyScannerPanel.tsx`/`getRecentSelections()` expect.
- [x] T-16: Confirm the empty/stale-data state renders sensibly if `selections` is empty — **verified by code inspection only**, not by live triggering: live data is currently fresh (most recent selection row is from today, well inside the 2-day threshold), so the stale/empty notice does not currently render in production and can't be observed live without artificially deleting rows (destructive, out of scope). `isStale()`/`selections.length === 0` branching in `BuyScannerPanel.tsx` was re-read and confirmed to cover both cases correctly.
- [x] T-17: Confirm no existing component, route, or test was modified beyond the two additive dashboard-wiring edits (T-10, T-11). Verified via `git status --porcelain` + `git diff`: only the files listed in design.md's Impact table changed (plus the pre-existing, unrelated `specs/gate-constants-hoist/review.md`).
- [x] T-18: `npx tsc --noEmit` passes.
- [x] T-19: `npm run build` passes — `/api/buy-scanner` appears in the build's route list.
- [x] T-20: Full test suite: **409/409 passing across 45 files** (up from 406/45 — the 3 new `getLatestBriefing()` tests).
- [x] T-21: Report the final line count of all new/modified files — see completion report.

**Environment note (`.env.local` key, resolved path for T-15):** Two live-verification attempts failed before finding a working one: (1) a temporary, non-committed script calling `getLatestBriefing()`/`getRecentSelections()` through `db.ts` directly failed with `Invalid API key` from Supabase — `SUPABASE_URL` correctly points to the linked project (`hhrtqxwonpmryziuejeq`) and the key is present/JWT-shaped with no formatting issue, so `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` appears stale/rotated (a pre-existing local-environment issue, not a bug in this feature — any `db.ts` function would fail identically); (2) the `mcp__supabase__execute_sql` tool separately failed with an unrelated org/access-token-scope error. **`npx supabase db query --linked "<sql>"` succeeded** — it authenticates via the CLI's own login/access token (the same one used earlier this session for `supabase db push`), independent of the app's `.env.local` key — and that's what produced the T-15 confirmation above. Did not touch `.env.local` myself (Protected Zone, out of scope for this feature) — flagging to Amaury that the app-level service-role key may need rotation, since it currently blocks any local script from calling `db.ts` functions directly, independent of this feature.

## Post-Implementation

- [x] Run `/review buy-scanner-tab` to verify implementation matches spec — see `specs/buy-scanner-tab/review.md` (APPROVED)
- [x] Confirm no Protected Zone file was touched (expected — none listed in scope). Verified via `git status`/`git diff` — no Protected Zone file appears in the diff.

## Estimated Complexity

**Medium** — no Protected Zone friction and no schema changes, but a new UI panel with several data sections (briefing + current + historical selections + empty/stale handling) is more surface area than a typical additive backend fix in this series.
