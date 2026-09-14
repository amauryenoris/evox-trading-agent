# Tasks — Health Monitor Dashboard Tab (6th tab)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, this feature touches no Protected Zone file (see design.md)
- [x] Database migrations drafted — N/A, no schema changes

## Implementation Checklist

### Phase 1 — Types + data layer (`src/lib/types.ts`, `src/lib/db.ts`)

- [x] T-01: In `src/lib/types.ts`, add (near `MarketDailyBriefing`, following its snake_case, direct-passthrough convention):
  ```ts
  export interface PositionHealthSnapshot {
    id: string
    symbol: string
    position_buy_timestamp: string
    snapshot_timestamp: string
    entry_adx_bucket: string | null
    entry_macd_bucket: string | null
    entry_z_bucket: string | null
    entry_spx_regime: string | null
    current_adx_bucket: string | null
    current_macd_bucket: string | null
    current_z_bucket: string | null
    current_spx_regime: string | null
    current_adx: number | null
    current_macd_histogram: number | null
    current_z_score: number | null
    current_price: number | null
    days_since_entry: number | null
  }
  ```
- [x] T-02: In `src/lib/db.ts`, add:
  ```ts
  export async function getLatestHealthSnapshots(): Promise<PositionHealthSnapshot[]> {
    const db = getClient()
    const { data, error } = await db
      .from('position_health_snapshots')
      .select('*')
      .order('snapshot_timestamp', { ascending: false })
      .limit(20) // most recent batch is at most MAX_POSITIONS (5) rows; 20 gives headroom for ~2 recent runs
    if (error) throw new Error(`Failed to fetch position health snapshots: ${error.message}`)
    return data ?? []
  }
  ```
  (No grouping here — returns raw, potentially multi-batch rows; the API route groups to the latest batch.)

### Phase 2 — API route

- [x] T-03: Create `src/app/api/health-monitor/route.ts`:
  ```ts
  import { NextResponse } from 'next/server'
  import { getLatestHealthSnapshots } from '@/lib/db'

  export const dynamic = 'force-dynamic'

  export async function GET() {
    try {
      const rows = await getLatestHealthSnapshots()
      const snapshotTimestamp = rows[0]?.snapshot_timestamp ?? null
      const snapshots = snapshotTimestamp
        ? rows.filter((r) => r.snapshot_timestamp === snapshotTimestamp)
        : []
      return NextResponse.json({ snapshots, snapshotTimestamp })
    } catch (error) {
      console.error('[health-monitor]:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
  ```

### Phase 3 — `HealthMonitorPanel.tsx`

- [x] T-04: Create `src/components/dashboard/HealthMonitorPanel.tsx` (`'use client'`), mirroring `BuyScannerPanel.tsx`'s shape: `useState`/`useEffect` fetching `/api/health-monitor` on mount, `animate-pulse` skeleton loading state, error state, imports from `./ui` (only `Card` was needed — no forced unused imports).
- [x] T-05: Header — "Last checked: {snapshotTimestamp}" (formatted via `toLocaleString`), replaced by the empty-state notice when `snapshotTimestamp` is `null`.
- [x] T-06: Per-position Card — `symbol`, `current_price`, `days_since_entry`.
- [x] T-07: Entry-vs-current comparison — two-column layout (muted "Entry" / "Current" labels) for ADX bucket, MACD bucket, z-score bucket, and SPX regime; raw `current_adx`/`current_macd_histogram`/`current_z_score` shown alongside their bucket labels.
- [x] T-08: Empty state — if `snapshots.length === 0` (which per `route.ts`'s grouping logic always coincides with `snapshotTimestamp === null` — checked both defensively), a calm notice ("No health check data available."), not an error style.

### Phase 4 — Dashboard wiring (additive only)

- [x] T-09: In `src/components/dashboard/DashboardTabs.tsx`, add `{ id: 'health', label: 'Health Monitor', kicker: '06' }` to the `TABS` array, after the `scanner` entry. No other line changes.
- [x] T-10: In `src/app/dashboard/page.tsx`, import `HealthMonitorPanel` and add a `tabs.health` entry (`ZoneTitle` + `<HealthMonitorPanel />`), matching the `scanner` entry's exact JSX shape. No other line in `page.tsx` changes.

### Phase 5 — Testing

- [x] T-11: Create `src/lib/__tests__/db.health-monitor.test.ts` (mirroring `db.selection-failures.test.ts`'s mocking pattern) covering `getLatestHealthSnapshots()`: queries `position_health_snapshots`, orders by `snapshot_timestamp` descending, limits to 20, returns the rows, returns `[]` when no rows exist (including when `data` is `null`), throws on a Supabase error. 4/4 passing.
- [x] T-12: No new tests for the API route or `HealthMonitorPanel.tsx` — consistent with this session's established convention (no test files exist for any `src/app/api/**` route or `src/components/dashboard/**` component). Verified by manual/live inspection instead (Phase 6).

### Phase 6 — Verification

- [x] T-13: Confirm the new tab appears as the 6th entry in the dashboard nav, immediately after "Buy Scanner," and the 5 existing tabs behave unchanged. Verified via `git diff`: `TABS` array's 5 existing entries untouched, `{ id: 'health', label: 'Health Monitor', kicker: '06' }` appended last.
- [x] T-14: Confirm `/api/health-monitor` returns real data matching a live sample row from `position_health_snapshots` — confirmed via `npx supabase db query --linked`. Latest 5 rows spot-checked: real drift visible (e.g. XOM: `entry_adx_bucket=HIGH` → `current_adx_bucket=MID`, `days_since_entry=12`), all fields present and matching `PositionHealthSnapshot`'s shape exactly.
- [x] T-15: Confirm the response correctly groups/filters to only the single most recent `snapshot_timestamp` batch, not mixing in an older run's rows — confirmed against real batch boundaries: most recent batch (`2026-09-11T22:32:24.188Z`) has 1 row (XOM only); the prior batch (`2026-09-10T22:32:59.955Z`) has 3 rows (AMZN, MSFT, XOM). `route.ts`'s `rows.filter((r) => r.snapshot_timestamp === snapshotTimestamp)` correctly isolates only the single most recent timestamp's row(s), excluding the older batch's AMZN/MSFT rows.
- [x] T-16: Confirm the empty state renders sensibly if `snapshots` is empty — verified by code inspection (live data is not currently empty, same honest-reporting approach used for Buy Scanner's stale-state check): `snapshots.length === 0 || snapshotTimestamp === null` branch in `HealthMonitorPanel.tsx` renders the calm "No health check data available." notice, not an error style.
- [x] T-17: Confirm no existing component, route, or test was modified beyond the two additive dashboard-wiring edits (T-09, T-10). Verified via `git status`/`git diff` — diff is exactly the files in design.md's Impact table plus the pre-existing, unrelated `specs/gate-constants-hoist/review.md`.
- [x] T-18: `npx tsc --noEmit` passes.
- [x] T-19: `npm run build` passes — `/api/health-monitor` appears in the build's route list.
- [x] T-20: Full test suite: **413/413 passing across 46 files** (up from 409/45 — the 4 new `getLatestHealthSnapshots()` tests).
- [x] T-21: Report the final line count of all new/modified files — see completion report.

## Post-Implementation

- [x] Run `/review health-monitor-tab` to verify implementation matches spec — see `specs/health-monitor-tab/review.md` (APPROVED)
- [x] Confirm no Protected Zone file was touched (expected — none listed in scope). Verified via `git status`/`git diff`.

## Estimated Complexity

**Low-Medium** — same shape as Buy Scanner (already proven this session), one fewer data source to combine (single table, no second query to merge), but the entry-vs-current comparison layout is new visual territory with no existing pattern to lean on.
