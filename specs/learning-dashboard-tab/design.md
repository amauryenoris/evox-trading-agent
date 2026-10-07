# Design — New "Learning" dashboard tab + fix misleading pattern cards

## Architecture Decision

This change is pure UI, layered on top of the already-approved data layer (`src/lib/trade-views.ts`, CHANGE 1)
and the already-shipped `/api/trades?limit=` (CHANGE 1). It touches exactly two existing files
(`src/app/dashboard/page.tsx`, `src/components/dashboard/DashboardTabs.tsx`) to wire in a seventh tab, adds four
new client components under `src/components/dashboard/`, and makes a small, scoped fix to
`PatternLibraryCard.tsx`. No new data-fetching path is introduced beyond the one additional `fetchJSON` call in
`page.tsx` — every new component is a pure function of props, consistent with how the rest of the dashboard's
tab panels are server-rendered and handed down as `ReactNode`.

The four new files are:
- `LearningPanel.tsx` — the shell. Owns the active-sub-view `useState`, computes `buildTimeline`,
  `groupBySymbol`, `groupBySetup` once via `useMemo`, renders the three selector buttons, the empty state, and
  delegates to one of the three view components below.
- `LearningTimeline.tsx` — the Timeline sub-view (FR-10 to FR-16).
- `LearningBySymbol.tsx` — the By-symbol sub-view (FR-17 to FR-22).
- `LearningBySetup.tsx` — the By-setup sub-view (FR-23 to FR-27).

This is the maximum file count the scope allows (4) and the natural seam: each view has independent local state
(pagination for Timeline, per-row expand/collapse for Timeline and By-symbol) and a non-trivial amount of markup
on its own, so splitting keeps every file comfortably under the 300-line cap without an artificial shared
sub-component layer that the scope doesn't ask for.

## Data Flow

```
page.tsx (server component)
  Promise.all([
    ...existing 7 fetches...,
    fetchJSON<TradeEvaluation[]>('/api/trades?limit=500', [])   ← NEW: allTrades
  ])
          │
          ▼
  tabs.learning = <LearningPanel allTrades={allTrades} />        ← NEW tabs key
          │
          ▼
DashboardTabs.tsx (client, unchanged logic)
  TABS += { id: 'learning', label: 'Learning', kicker: '07' }    ← NEW entry, appended last
  tabs['learning'] rendered when that tab is active
          │
          ▼
LearningPanel.tsx (client, NEW)
  const timeline = useMemo(() => buildTimeline(allTrades), [allTrades])
  const bySymbol = useMemo(() => groupBySymbol(allTrades), [allTrades])
  const bySetup  = useMemo(() => groupBySetup(allTrades), [allTrades])
  activeView: 'timeline' | 'symbol' | 'setup' (useState, default 'timeline')
          │
   ┌──────┼──────────────┐
   ▼                     ▼                     ▼
LearningTimeline    LearningBySymbol      LearningBySetup
(paginated list,    (per-symbol blocks,   (per-setup blocks,
 expand per row)     expand per symbol)    bucket tables)
```

`allTrades` is computed once, server-side, from the already-approved `/api/trades?limit=500` route — no new
network surface, no client-side fetch. All three `trade-views.ts` calls run once per render via `useMemo`,
keyed on the `allTrades` reference (stable across re-renders since it's a server-passed prop).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One `LearningPanel.tsx` file containing all three views | Fewer files | Would exceed ~300 lines given three distinct table/card layouts plus per-row expand state for two of them; harder to scan | Rejected |
| Split into shell + 3 view components (4 files total) | Matches the scope's own file cap; each view's local state (pagination, expand-set) stays contained to its own component | One more file than the 3-view-only minimum | **Chosen** |
| Reuse `WeeklyReportsCard`'s `role="button"` div for row expand/collapse | Existing precedent in the codebase | The spec explicitly asks for a real `<button>` element for Timeline row expansion (an accessibility improvement over the existing precedent) | Rejected — real `<button>` used, as required |
| Reuse the existing 50-row `trades` fetch for Learning instead of a new 500-row fetch | No new fetch call | By-setup bucket analysis needs `MIN_BUCKET_N`/`LOW_SAMPLE_N`-sized samples (8/20); 50 rows total across all setups and symbols would starve most buckets. The route already supports up to 500 via CHANGE 1 | Rejected — new `allTrades` fetch at `limit=500` |
| Fetch `allTrades` client-side inside `LearningPanel` | Simpler prop plumbing | Explicitly forbidden by scope ("no client-side fetching"); also inconsistent with how every other tab panel gets its data | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/app/dashboard/page.tsx` | MODIFY | Add `allTrades` fetch to the existing `Promise.all`; add a `learning` key to `tabs` rendering `<LearningPanel allTrades={allTrades} />` inside the existing `ZoneTitle` pattern (kicker `"07 · Learning"`) |
| `src/components/dashboard/DashboardTabs.tsx` | MODIFY | Append one entry to `TABS`: `{ id: 'learning', label: 'Learning', kicker: '07' }` |
| `src/components/dashboard/LearningPanel.tsx` | CREATE | Shell: sub-view selector, `useMemo` over `trade-views.ts`, empty state |
| `src/components/dashboard/LearningTimeline.tsx` | CREATE | Timeline sub-view |
| `src/components/dashboard/LearningBySymbol.tsx` | CREATE | By-symbol sub-view |
| `src/components/dashboard/LearningBySetup.tsx` | CREATE | By-setup sub-view |
| `src/components/dashboard/PatternLibraryCard.tsx` | MODIFY | Remove the `p.id`-derived symbol label (keep `p.id` as the `key`); show `p.patternKey` as muted text when present; add the aggregation caption |

No other file is read or written by this change. `src/lib/trade-views.ts`, `src/lib/db.ts`, `src/lib/types.ts`,
`src/lib/learning.ts`, every API route, and every Protected Zone file are untouched.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. Every touched/created file is in the "touch
freely" column of the file permission matrix in `CLAUDE.md` (`src/app/dashboard/**`,
`src/components/dashboard/**`).

## Database Changes

None.

## Pre-Implementation Verification (FAIL FAST check — already performed)

- **Does adding a tab require changes beyond `DashboardTabs.tsx` and `page.tsx`?** No. `DashboardTabs.tsx`
  defines `type TabId = (typeof TABS)[number]['id']` — a type derived from its own `TABS` array. `page.tsx`'s
  `tabs` object is a plain object literal checked structurally against the `tabs: Record<TabId, ReactNode>` prop
  — adding one `TABS` entry and one matching `tabs` key in `page.tsx` is sufficient; there is no separate typed
  union of tab ids anywhere else in the codebase (confirmed by reading both files in full). No STOP condition
  triggered.
- **Can `fetchJSON` pass a query string?** Yes. `fetchJSON<T>(path: string, fallback: T)` does
  `` fetch(`${base}${path}`, ...) `` with no parsing of `path` — `/api/trades?limit=500` works exactly like the
  existing `/api/trades` call. No STOP condition triggered.
- **Does `trade-views.ts` already export everything this feature needs?** Yes — `summarizeTrades`,
  `buildTimeline`, `groupBySymbol`, `groupBySetup`, `MIN_BUCKET_N`, `LOW_SAMPLE_N`, `SYMBOL_SETUP_WARN_N`, and
  the `TimelineEntry` / `SymbolGroup` / `SetupGroup` / `FingerprintBucket` / `TradeSummary` types used to shape
  this UI are all present and unchanged since CHANGE 1's review. No bug or gap found; `trade-views.ts` is not
  touched by this change.
- **Does `SignalBadge` handle an `'UNKNOWN'` setup string safely?** Yes — `SignalBadge` falls back to
  `{ tone: 'neutral', label: signal }` for any string not in its lookup map (the existing, accepted precedent is
  `MEAN_REVERSION` in today's `PatternLibraryCard.tsx`). `'UNKNOWN'` hits the same fallback and renders as a
  neutral badge labeled "UNKNOWN" — satisfying FR-14 with no change to `ui.tsx`.
- **Does `TradingPattern` already carry a `patternKey`?** Yes — `patternKey?: string | null` is already in
  `types.ts` and already populated by `db.ts` / `learning.ts`. No type or data-layer change needed for FR-31.

## Manual Verification Checklist (visual result NOT automatically verified)

This change has no component-test infrastructure and no browser automation in this environment. The following
must be checked by hand after implementation, in a running `npm run dev` session:

1. The "Learning" tab (kicker "07") appears after "Health Monitor" in the tab bar and is clickable.
2. All three sub-views (Timeline, By symbol, By setup) render without a runtime error, with Timeline shown by
   default.
3. Timeline: "Show more" reveals additional rows past the first 30; clicking a row's expand `<button>` reveals
   buy/sell price, fingerprint chips, and lessons as plain text (no HTML injection).
4. By-symbol: a symbol with a thin setup shows the "small sample (n<5)" label; expanding a symbol shows its
   trades.
5. By-setup: a setup with no bucket reaching `MIN_BUCKET_N` shows "Not enough trades per bucket"; a thin bucket
   shows "hypothesis (n<20)".
6. No dollar figure appears as a headline number anywhere in the Learning tab.
7. `PatternLibraryCard` no longer shows a misleading per-card symbol; it shows the aggregation caption and, when
   present, the `patternKey` as muted text; everything else on the card (badge, sample count, description, avg
   P&L, insufficient-data badge) looks unchanged.

## Open Questions

- None. All FAIL FAST conditions were checked against the current codebase and passed; no clarification is
  needed from Amaury before implementation.
