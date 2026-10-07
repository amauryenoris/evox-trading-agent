# Requirements — New "Learning" dashboard tab + fix misleading pattern cards

## Context

STEP 0 (2026-10-06) plus the approved `src/lib/trade-views.ts` (CHANGE 1) confirmed: `page.tsx` is a server
component that fetches everything through one `Promise.all` of `fetchJSON<T>(path, fallback)` calls and builds a
`tabs` record (currently 6 keys: `portfolio`, `intelligence`, `analytics`, `reports`, `scanner`, `health`) handed
to `DashboardTabs.tsx`, a client component whose `TabId` type is derived from its own `TABS` array
(`(typeof TABS)[number]['id']`) — so `tabs: Record<TabId, ReactNode>` in `page.tsx` already forces every `TABS`
entry to have a matching key, with no other typed union to update elsewhere. `fetchJSON` takes any path string,
so `/api/trades?limit=500` works with no change to the helper. `/api/trades` already accepts `?limit=1..500`
(CHANGE 1). `trade-views.ts` exports `summarizeTrades`, `buildTimeline`, `groupBySymbol`, `groupBySetup`,
`MIN_BUCKET_N`, `LOW_SAMPLE_N`, `SYMBOL_SETUP_WARN_N` — all pure, and `pnlPct` is already in percent units.
`ui.tsx` exports `Card`, `Badge`, `SignalBadge`, `Dot`, `Progress`, `Sparkline`; `SignalBadge` already falls back
to a neutral-toned badge for any signal string it doesn't recognize (the existing precedent is `MEAN_REVERSION`
in `PatternLibraryCard.tsx` today — the same fallback mechanism covers `'UNKNOWN'`). `PatternLibraryCard.tsx`
currently derives a per-card symbol from `p.id.split('_').pop()` — the first trade that created the
pattern-library row — while the row itself aggregates many symbols, making the displayed symbol misleading.
`TradingPattern.patternKey?: string | null` already exists in `types.ts`. UI copy is English, matching the rest
of the dashboard.

## Functional Requirements

### Tab wiring (`page.tsx`, `DashboardTabs.tsx`)

FR-01: `page.tsx` shall fetch `TradeEvaluation[]` from `/api/trades?limit=500` via the existing `fetchJSON`
helper, inside the existing `Promise.all`, storing the result in a new `allTrades` variable.

FR-02: `page.tsx` shall default `allTrades` to `[]` when that fetch fails, using `fetchJSON`'s existing fallback
mechanism.

FR-03: `page.tsx` shall leave the existing `/api/trades` (no `limit`) fetch, its `trades` variable, and every
existing consumer of `trades` unchanged.

FR-04: `page.tsx` shall add a `learning` key to the `tabs` record, rendering the new Learning panel and passing
it `allTrades`.

FR-05: `DashboardTabs.tsx`'s `TABS` array shall gain exactly one new entry — id `learning`, label `"Learning"`,
kicker `"07"` — appended after the existing six entries, without changing any existing entry's `id`, `label`, or
`kicker`.

### Learning panel shell (`LearningPanel.tsx`)

FR-06: `LearningPanel` shall render three sub-view selector controls labeled "Timeline", "By symbol", and
"By setup".

FR-07: `LearningPanel` shall show the "Timeline" sub-view by default on first render.

FR-08: `LearningPanel` shall derive the data for all three sub-views from its `allTrades` prop via
`buildTimeline`, `groupBySymbol`, and `groupBySetup`, each memoized (`useMemo`) on `allTrades`.

FR-09: `LearningPanel` shall render the message "No closed trades yet" in place of any sub-view when
`allTrades` is empty.

### Timeline sub-view

FR-10: The Timeline view shall render `buildTimeline(allTrades)` entries in the order returned (newest first).

FR-11: The Timeline view shall render entries 30 at a time, with a "Show more" control that reveals the next 30.

FR-12: Each Timeline row shall show the sell date, the symbol, a setup badge, an outcome-colored tone (green for
`profit`, red for `loss`), the entry's `pnlPct` as a signed percentage with 2 decimal places, and holding days.

FR-13: The Timeline view shall never rescale `pnlPct` — the displayed value shall be the same number
`buildTimeline` returned, formatted only (sign + 2 decimals).

FR-14: Where an entry's `setup` is `'UNKNOWN'`, its badge shall render with a neutral tone.

FR-15: Each Timeline row shall be expandable via a real `<button>` element; expanding it shall reveal the buy
price, the sell price, the fingerprint chips, and the lessons list.

FR-16: The Timeline view shall render each lesson as plain text — never via `dangerouslySetInnerHTML` or any
other HTML-interpreting mechanism.

### By-symbol sub-view

FR-17: The By-symbol view shall render `groupBySymbol(allTrades)` output, one block per symbol.

FR-18: Each symbol block shall show its overall `n`, win rate, average `pnlPct`, and median `pnlPct`.

FR-19: Each symbol block shall show one row per entry in its `bySetup` breakdown, each with `n`, win rate, and
average `pnlPct`.

FR-20: Where a `bySetup` row's `lowSample` is `true`, the By-symbol view shall show a muted "small sample (n<5)"
label on that row.

FR-21: Each symbol block shall be expandable to show that symbol's trades newest first, each row showing date,
setup, and `pnlPct`.

FR-22: The By-symbol view shall show the caption "Small samples are context, not statistics".

### By-setup sub-view

FR-23: The By-setup view shall render `groupBySetup(allTrades)` output, one block per setup.

FR-24: Each setup block shall show its overall `n`, win rate, average `pnlPct`, median `pnlPct`, and the text
"N of M trades have a state fingerprint" built from `tradesWithFingerprint` and `n`.

FR-25: Each setup block shall show its coarse buckets as rows of dimension, bucket, `n`, win rate, and average
`pnlPct`.

FR-26: Where a bucket row's `lowSample` is `true`, the By-setup view shall label that row "hypothesis (n<20)".

FR-27: Where a setup's `buckets` array is empty, the By-setup view shall show "Not enough trades per bucket" for
that setup instead of a bucket table.

### Cross-cutting display rule

FR-28: None of the three Learning sub-views shall show a dollar-denominated total as a headline metric; only win
rate and percent-based metrics shall appear as headline figures.

### Pattern Library fix (`PatternLibraryCard.tsx`)

FR-29: `PatternLibraryCard` shall stop deriving a displayed symbol label from `p.id`.

FR-30: `PatternLibraryCard` shall continue using `p.id` as the React `key` for each rendered card.

FR-31: Where `p.patternKey` is present (not `null`, not `undefined`), `PatternLibraryCard` shall show it as
small muted text.

FR-32: `PatternLibraryCard` shall show one muted caption under the card title reading "Each card aggregates
trades from several symbols".

FR-33: `PatternLibraryCard` shall leave the setup badge, sample count, description, average P&L, and
insufficient-data badge exactly as they are today.

## Non-Functional Requirements

NFR-01: Every new component shall be a client component (`'use client'`) importing only from `ui.tsx`,
`trade-views.ts`, `types.ts`, and React — no other module.

NFR-02: New component files shall number at most 4, each under 300 lines.

NFR-03: No new component shall perform client-side data fetching; all data shall arrive via props computed
server-side in `page.tsx`.

NFR-04: No new or modified component shall use `dangerouslySetInnerHTML`.

NFR-05: This change shall not introduce any new npm dependency.

NFR-06: All color/tone usage in new or modified components shall use only the existing design tokens (`ink`,
`surface`, `surface2`, `border`, `border2`, `text`, `muted`, `mute2`, `green`, `green2`, `red`, `red2`, `purple`,
`purple2`, `amber`, `blue`) via `ui.tsx` primitives or token-based Tailwind classes — no new hardcoded colors.

NFR-07: `npx tsc --noEmit` shall report zero errors after this change.

NFR-08: The full Vitest suite shall pass after this change.

NFR-09: `npm run build` shall succeed after this change.

## Constraints

C-01: This feature must not modify `src/lib/trade-views.ts`. If it is found to have a bug or to be missing
something this feature needs, implementation must STOP and report rather than editing it.

C-02: This feature must not modify `AgentReasoningLog.tsx`, `TradeHistoryTable.tsx`, any API route, `db.ts`,
`types.ts`, `learning.ts`, any Supabase migration, middleware, `next.config.js`, or `package.json`.

C-03: This feature must not touch the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`,
`indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) without explicit confirmation
from Amaury.

C-04: This feature must not add component-test infrastructure or any new test file.

C-05: `pnlPct` must never be rescaled (multiplied or divided) anywhere it is displayed.

C-06: New and modified UI copy shall be in English, matching the surrounding dashboard.

C-07: The visual result of this change is not verified by an automated check — see Out of Scope.

## Out of Scope

- Changes to `AgentReasoningLog.tsx` or the SELL card (explicitly deferred to a future CHANGE).
- Any API route, database, or `trade-views.ts` change.
- Automated/visual verification in a browser — this is a static, code-level implementation; a manual
  by-hand checklist is produced instead (see `design.md` and `tasks.md`).
- Automated tests for the new components (no component-test infrastructure exists, and none may be added).
- Reordering or renumbering the six existing tabs.
- Any dashboard content beyond the Learning tab and the `PatternLibraryCard` fix.
