# Design — Health Monitor Dashboard Tab (6th tab)

## Architecture Decision

This feature is the third dashboard tab added this session, following the
exact same shape as Buy Scanner: one new `db.ts` read function
(`getLatestHealthSnapshots()`), one new API route
(`src/app/api/health-monitor/route.ts`) that owns the "pick the latest
batch" grouping logic, one new client component
(`HealthMonitorPanel.tsx`), and two additive wiring edits. No new
abstractions, no new UI primitives, no writes, no cross-table joins.

## Data Flow

```
HealthMonitorPanel ('use client', mounts)
  │
  ├─ useEffect → fetch('/api/health-monitor')
  │
  └─ GET /api/health-monitor (route.ts)
        │
        └─ getLatestHealthSnapshots()   (NEW, db.ts)
              → selects * from position_health_snapshots
                order by snapshot_timestamp desc, limit 20
              → returns PositionHealthSnapshot[] (raw rows, unfiltered —
                may span more than one batch; 20 gives headroom for ~2
                recent runs at up to 5 positions/run)
        │
        └─ route.ts groups: snapshotTimestamp = rows[0]?.snapshot_timestamp ?? null
                             snapshots = rows.filter(r => r.snapshot_timestamp === snapshotTimestamp)
        │
        └─ NextResponse.json({ snapshots, snapshotTimestamp })
  │
  └─ HealthMonitorPanel renders:
        - Header: "Last checked: {snapshotTimestamp}" (or nothing/empty-state if null)
        - Per-position Card: symbol, current_price, days_since_entry,
          entry→current ADX/MACD/z-score bucket pairs (two-column layout,
          muted labels — no pre-existing before/after pattern to reuse),
          entry→current SPX regime, raw current_adx/current_macd_histogram/
          current_z_score alongside their buckets
        - Empty notice if snapshots.length === 0
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `db.ts` function returns raw, unfiltered rows; API route does the "latest batch" grouping | Matches the originating prompt's own sample `getLatestHealthSnapshots()` snippet (order + limit only, no grouping); keeps `db.ts` a thin data-access layer, consistent with `getRecentSelections()`'s precedent of returning a plain bounded list and letting the caller decide what to do with it | Route has a few extra lines of grouping logic | **Chosen** |
| `db.ts` function does the grouping itself (e.g. `getLatestHealthSnapshotBatch()`) | One less step in the route | Diverges from the prompt's given snippet; conflates "fetch" with "business logic of what counts as the current batch," which arguably belongs closer to the API-consumer layer (mirrors how `/api/buy-scanner/route.ts` already does its own combining logic rather than pushing it into `db.ts`) | Rejected |
| `PositionHealthSnapshot` type in camelCase (mapped from DB `snake_case`), mirroring `SelectionDecision`/`OpenPositionContext` | Consistent with those two types | Those types back active writers with richer logic; this table is pure read/display like `market_daily_briefings`, whose type (`MarketDailyBriefing`) already keeps `snake_case` with no mapping layer — matching that closer precedent, and matching the prompt's own sample function which returns `data` with no mapping step | Rejected |
| `PositionHealthSnapshot` type in `snake_case`, no mapping layer, mirroring `MarketDailyBriefing` | Matches the closer precedent (another pure-read, display-only table) and the prompt's own sample code exactly | Slight naming inconsistency across the codebase's various DB-backed types (already true today, pre-existing) | **Chosen** |
| Custom "entry → current" visual comparison component | More polished | No existing convention to match, would be inventing new visual language beyond what the prompt allows ("if none exists, a simple two-column layout... is fine") | Rejected |
| Simple two-column (entry / current) layout with muted labels | Matches the prompt's explicit fallback instruction; no new UI primitive; consistent with `KV`-style label/value pairs already used in `BuyScannerPanel.tsx` | Less visually distinctive than a dedicated comparison widget | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `PositionHealthSnapshot` interface (snake_case fields, mirroring the live table exactly, including `id: string`) |
| `src/lib/db.ts` | MODIFY | Add `getLatestHealthSnapshots(): Promise<PositionHealthSnapshot[]>` — `getClient() → .select('*') → .order('snapshot_timestamp', { ascending: false }) → .limit(20) → return data ?? []` |
| `src/app/api/health-monitor/route.ts` | CREATE | New GET route: fetch via `getLatestHealthSnapshots()`, group to the latest `snapshot_timestamp`, return `{ snapshots, snapshotTimestamp }` |
| `src/components/dashboard/HealthMonitorPanel.tsx` | CREATE | New `'use client'` component, mirrors `BuyScannerPanel.tsx`'s/`PerformanceAnalytics.tsx`'s structure |
| `src/components/dashboard/DashboardTabs.tsx` | MODIFY | Add one `TABS` entry: `{ id: 'health', label: 'Health Monitor', kicker: '06' }`, after `scanner` |
| `src/app/dashboard/page.tsx` | MODIFY | Add one `tabs.health` entry (`ZoneTitle` + `<HealthMonitorPanel />`), import `HealthMonitorPanel` |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`,
`risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`,
`watchlist-monitor.ts`, `learning.ts`, `.env`/`.env.local`, `vercel.json`,
`scripts/position-health-check.ts`, or its workflow, or any DB migration.
All touched files are "touch freely" per `CLAUDE.md`'s file permission
matrix.

## Database Changes

None. Read-only consumption of `position_health_snapshots`, already live
with real data (spot-checked via `npx supabase db query --linked`). As of
the most recent re-check (2026-09-14), the latest batch is from 2026-09-11
— see requirements.md's "Verified Against Current Code" section for why
that's an expected, handled case (FR-09) rather than a problem with this
spec.

## Open Questions

None — the originating prompt's Context section was verified against the
live schema, `db.ts`, `DashboardTabs.tsx`, and `page.tsx` with zero drift
found (only one addition: the table's `id` primary key column, not
functionally relevant to the design). The one design judgment call this
spec makes explicitly (`PositionHealthSnapshot`'s snake_case naming) is
justified above by precedent, not left open.
