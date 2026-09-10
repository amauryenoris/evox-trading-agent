# Design — Buy Scanner Dashboard Tab (5th tab)

## Architecture Decision

This feature lives entirely in the presentation + read layer: one new API
route (`src/app/api/buy-scanner/route.ts`), one new client component
(`src/components/dashboard/BuyScannerPanel.tsx`), one new `db.ts`-adjacent
read function (`getLatestBriefing()` in `src/lib/db-market-briefing.ts`),
and two additive wiring edits (`DashboardTabs.tsx`'s `TABS` array,
`page.tsx`'s `tabs` object). It reuses `getRecentSelections()` (already in
`db.ts`) as-is. No new abstractions, no new UI primitives, no writes.

## Data Flow

```
BuyScannerPanel ('use client', mounts)
  │
  ├─ useEffect → fetch('/api/buy-scanner')
  │
  └─ GET /api/buy-scanner (route.ts)
        │
        ├─ getLatestBriefing()          (NEW, db-market-briefing.ts)
        │     → selects * from market_daily_briefings
        │       order by created_at desc, limit 1
        │     → returns MarketDailyBriefing | null
        │
        └─ getRecentSelections(5)       (EXISTING, db.ts — reused as-is)
              → selects * from selection_history
                order by created_at desc, limit 5
              → returns SelectionDecision[] (timestamp, candidatesOffered,
                selectedSymbols, reasoning, candidateScores)
        │
        └─ NextResponse.json({ briefing, selections })
  │
  └─ BuyScannerPanel renders:
        - Briefing Card (spx_regime badge, price vs SMA50/200, sector RS%,
          macro sentiment counts, vix_proxy_change, narrative)
        - Most-recent selection: selectedSymbols + matching candidateScores
          rendered as a divide-y list (mirroring PatternLibraryCard.tsx's
          per-row layout, not individually bordered cards)
        - Older 4 selections: compact timestamp + selectedSymbols list
        - Empty/stale notice if selections.length === 0 or the most recent
          createdAt is older than the staleness threshold
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Self-contained client component (own route + `useEffect`), mirroring `PerformanceAnalytics.tsx` | Independent loading state; room to grow a cycle/date selector later, as this tab's data naturally invites | One extra network round-trip vs. server-side prop drilling | **Chosen** — matches the originating prompt's confirmed pattern-2 choice and this tab's stated future needs |
| Page-level `fetchJSON()` + props (pattern 1, used by `PositionsTable` etc.) | One fewer client fetch | No independent loading state; awkward to extend with a future selector without touching `page.tsx`'s server fetch list | Rejected |
| Reuse `getMarketDailyBriefingByDate(todayISODate)` for the briefing instead of adding `getLatestBriefing()` | No new function | Returns `null` on any day without an exact-date row (weekends, pre-cron hours, a skipped day) — exactly the "stale/no data" case this tab must tolerate gracefully, not silently show as `null`/empty when a perfectly good recent briefing exists from a prior day | Rejected |
| Add `getLatestBriefing()` alongside the existing date-keyed function, same file | Correct "most recent regardless of date" semantics; matches this file's existing `getClient() → select → order → limit` pattern (verified against other `db.ts` readers) | One additional read function | **Chosen** |
| Reuse `SystemStatusBar.tsx`'s existing "Regime" red/amber tone logic for `spx_regime` | Zero new mapping | That logic colors a *different* field (`marketRegime`, volatility-based) with different values than `spx_regime` (`BULL`/`CAUTION`/`BEAR`) — reusing it would be visually wrong, not just a style deviation | Rejected |
| Define a small local `spx_regime → Badge tone` map inside `BuyScannerPanel.tsx` (green=BULL, amber=CAUTION, red=BEAR), using only `ui.tsx`'s existing `Badge` tones | Correct semantics, zero new UI primitives (same idiom as `SignalBadge`'s own internal map in `ui.tsx`, just kept local to this panel since `spx_regime` isn't reused elsewhere yet) | A minor, spec-documented judgment call rather than reuse of a pre-existing convention | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db-market-briefing.ts` | MODIFY | Add `getLatestBriefing(): Promise<MarketDailyBriefing \| null>` alongside the existing `getMarketDailyBriefingByDate()`/`upsertMarketDailyBriefing()` |
| `src/lib/db.ts` | MODIFY | Add `getLatestBriefing` to the existing `export { ... } from './db-market-briefing'` re-export block |
| `src/app/api/buy-scanner/route.ts` | CREATE | New GET route, mirrors `/api/performance` / `/api/positions` shape |
| `src/components/dashboard/BuyScannerPanel.tsx` | CREATE | New `'use client'` component, mirrors `PerformanceAnalytics.tsx`'s structure |
| `src/components/dashboard/DashboardTabs.tsx` | MODIFY | Add one `TABS` entry: `{ id: 'scanner', label: 'Buy Scanner', kicker: '05' }` |
| `src/app/dashboard/page.tsx` | MODIFY | Add one `tabs.scanner` entry (`ZoneTitle` + `<BuyScannerPanel />`), import `BuyScannerPanel` |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`,
`risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`,
`watchlist-monitor.ts`, `learning.ts`, `.env`/`.env.local`, `vercel.json`,
or any DB migration. All touched files are listed as "touch freely" in
`CLAUDE.md`'s file permission matrix.

## Database Changes

None. Read-only consumption of `market_daily_briefings` and
`selection_history`, both already live with real data.

## Open Questions

None — all ambiguities the originating prompt flagged for verification
(existing reader functions, `TABS`/`tabs` shape, `PerformanceAnalytics.tsx`
structure, `spx_regime` color convention) were checked directly against the
current codebase and resolved above; none require further design input
before implementation.
