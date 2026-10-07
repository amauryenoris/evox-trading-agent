# Tasks — New "Learning" dashboard tab + fix misleading pattern cards

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [x] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Tab wiring (`page.tsx`, `DashboardTabs.tsx`)
- [x] T-01: `DashboardTabs.tsx` — append `{ id: 'learning', label: 'Learning', kicker: '07' }` to `TABS`,
  after the existing six entries, with no change to any existing entry.
- [x] T-02: `page.tsx` — add `fetchJSON<TradeEvaluation[]>('/api/trades?limit=500', [])` to the existing
  `Promise.all`, destructured into a new `allTrades` variable; leave the existing `trades` fetch and all of its
  consumers untouched.
- [x] T-03: `page.tsx` — add a `learning` key to the `tabs` record, following the existing `ZoneTitle` +
  content-block pattern used by the other six tabs (kicker `"07 · Learning"`), rendering
  `<LearningPanel allTrades={allTrades} />`.

### Phase 2 — Learning panel shell (`src/components/dashboard/LearningPanel.tsx`)
- [x] T-04: Create `LearningPanel.tsx` as a `'use client'` component accepting `{ allTrades: TradeEvaluation[] }`.
- [x] T-05: Compute `timeline = useMemo(() => buildTimeline(allTrades), [allTrades])`, and the equivalent
  `useMemo` calls for `groupBySymbol` and `groupBySetup`.
- [x] T-06: Render three selector controls ("Timeline", "By symbol", "By setup") backed by a `useState` for the
  active sub-view, defaulting to Timeline.
- [x] T-07: Render the "No closed trades yet" empty state when `allTrades.length === 0`, instead of any sub-view
  or selector.
- [x] T-08: Delegate to `LearningTimeline`, `LearningBySymbol`, or `LearningBySetup` based on the active
  sub-view, passing each its slice of the memoized data.

### Phase 3 — Timeline sub-view (`src/components/dashboard/LearningTimeline.tsx`)
- [x] T-09: Create `LearningTimeline.tsx`; render `TimelineEntry[]` in the given (newest-first) order, 30 at a
  time, with a "Show more" button that reveals the next 30 (local `useState<number>` page-size counter).
- [x] T-10: Each row: sell date, symbol, setup badge (`SignalBadge`, which already neutral-falls-back for
  `'UNKNOWN'`), outcome tone (green for `profit`, red for `loss`), `pnlPct` as `(sign)XX.XX%` with no rescaling,
  holding days.
- [x] T-11: Make each row expandable via a real `<button>`; on expand, show buy price, sell price,
  `fingerprintChips`, and `lessons` — lessons rendered as plain text nodes, never `dangerouslySetInnerHTML`.

### Phase 4 — By-symbol sub-view (`src/components/dashboard/LearningBySymbol.tsx`)
- [x] T-12: Create `LearningBySymbol.tsx`; render one block per `SymbolGroup`, each showing overall `n`, win
  rate, average `pnlPct`, median `pnlPct`.
- [x] T-13: Render one row per `bySetup` entry (`n`, win rate, avg `pnlPct`); show a muted "small sample (n<5)"
  label when that row's `lowSample` is `true`.
- [x] T-14: Make each symbol block expandable to show that symbol's `trades` (already newest-first from
  `groupBySymbol`), each row showing date, setup, `pnlPct`.
- [x] T-15: Render the caption "Small samples are context, not statistics" once for the view.

### Phase 5 — By-setup sub-view (`src/components/dashboard/LearningBySetup.tsx`)
- [x] T-16: Create `LearningBySetup.tsx`; render one block per `SetupGroup`, each showing overall `n`, win rate,
  average `pnlPct`, median `pnlPct`, and "`{tradesWithFingerprint}` of `{n}` trades have a state fingerprint".
- [x] T-17: Render `buckets` as rows of dimension, bucket, `n`, win rate, avg `pnlPct`; label a row "hypothesis
  (n<20)" when its `lowSample` is `true`.
- [x] T-18: When a setup's `buckets` array is empty, render "Not enough trades per bucket" instead of a bucket
  table for that setup.

### Phase 6 — Pattern Library fix (`src/components/dashboard/PatternLibraryCard.tsx`)
- [x] T-19: Remove the `const symbol = p.id.split('_').pop() ?? ''` derivation and its rendering; keep
  `key={p.id}` on the card's root element.
- [x] T-20: Render `p.patternKey` as small muted text when it is present (not `null`/`undefined`).
- [x] T-21: Add one muted caption under the card title: "Each card aggregates trades from several symbols".
- [x] T-22: Confirm the setup badge, sample count, description, avg P&L, and insufficient-data badge are
  otherwise unchanged (diff review, not a rewrite).

### Phase 7 — Verification
- [x] T-23: Run `npx tsc --noEmit` — must be clean.
- [x] T-24: Run the full Vitest suite — must pass (no new tests are added per scope).
- [x] T-25: Run `npm run build` — must succeed.
- [x] T-26: Diff `page.tsx`, `DashboardTabs.tsx`, `PatternLibraryCard.tsx`; list the new files; confirm every
  new component imports only from `ui.tsx`, `trade-views.ts`, `types.ts`, and React.
- [x] T-27: Record that the visual result was NOT verified in a browser — flagged as pending for Amaury; the
  manual checklist in `design.md` → "Manual Verification Checklist" has not been run.

## Post-Implementation

- [x] Run `/review learning-dashboard-tab` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (`config.ts`, `claude-agent.ts`, `risk-manager.ts`,
  `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, any migration)
- [x] Confirm `src/lib/trade-views.ts`, `src/lib/db.ts`, `src/lib/types.ts`, `src/lib/learning.ts` unchanged
- [x] Confirm no new npm dependency was added (`package.json` diff empty)
- [x] Confirm `AgentReasoningLog.tsx` and `TradeHistoryTable.tsx` unchanged

## Estimated Complexity

**Medium** — no backend/data-layer work (CHANGE 1 already shipped what's needed) and no Protected Zone or
dependency changes, but four new client components with per-row expand state, pagination, and three distinct
data shapes to render correctly (timeline rows, per-symbol/per-setup breakdowns, bucket tables) make this
larger in surface area than CHANGE 1, and it cannot be verified by an automated test suite — only by hand.
