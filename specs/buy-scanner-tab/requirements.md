# Requirements — Buy Scanner Dashboard Tab (5th tab)

## Background

The dashboard has 4 tabs today (Portfolio/Intelligence/Analytics/Reports),
defined additively in `DashboardTabs.tsx`'s `TABS` array and `page.tsx`'s
`tabs` object — confirmed low-risk to extend with a 5th. Two tables already
hold data nobody currently views on the dashboard: `market_daily_briefings`
(today's macro/sector narrative) and `selection_history` (which candidates
the scanner considered, which 6-8 it picked, and Claude's own score/regime/
risks/thesis for each). This CHANGE adds a read-only "Buy Scanner" tab
surfacing both.

## Verified Against Current Code (2026-09-10) — Corrections to the Originating Prompt

- **`selection_history` reader already exists and fits as-is**: `getRecentSelections(limit = 10): Promise<SelectionDecision[]>` in `src/lib/db.ts` returns exactly `{ timestamp, candidatesOffered, selectedSymbols, reasoning, candidateScores }` — no new function needed, call with `limit=5`.
- **`market_daily_briefings` reader exists but is date-keyed, not "latest"**: `getMarketDailyBriefingByDate(briefingDate: string)` already exists in `src/lib/db-market-briefing.ts` (re-exported through `db.ts`), but it requires an exact `briefing_date` and returns `null` on no exact match — it does not serve "most recent regardless of date," which is what a tolerant, possibly-stale-data tab needs. A new `getLatestBriefing()` (ordered by `created_at`, limit 1) will be added **alongside** the existing function in the same file, not a duplicate of it — they serve different query shapes.
- **No existing "BULL/CAUTION/BEAR" color convention exists in the dashboard.** The only existing "Regime" display (`SystemStatusBar.tsx`) colors a *different* field (`marketRegime`, a volatility indicator with only 2 tones: red for HIGH/VOLATILITY, amber otherwise) — `spx_regime`'s actual values are `'BULL' | 'CAUTION' | 'BEAR'` (per `types.ts`), with no prior mapping to reuse. This CHANGE defines a new, minimal tone mapping local to the new panel (green/amber/red via the existing `Badge` component's existing tones) rather than reusing a convention that turns out not to exist.
- **`DashboardTabs.tsx`'s `TABS` array, `page.tsx`'s `tabs` object, and `PerformanceAnalytics.tsx`'s structure all match the originating prompt's description exactly** — confirmed via direct read, additive edits are safe as described.
- **`/api/performance/route.ts` and `/api/positions/route.ts` confirm the exact GET-route pattern**: `export const dynamic = 'force-dynamic'`, plain `export async function GET()`, try/catch → `NextResponse.json(...)` / `NextResponse.json({ error: ... }, { status: 500 })`, no per-route auth code (handled globally by `middleware.ts` for all `/api/*` except `/api/cron/run`).

---

## Functional Requirements

FR-01: The system shall display a 5th dashboard tab labeled "Buy Scanner" positioned after the existing 4 tabs.

FR-02: The system shall provide a `GET /api/buy-scanner` route returning the latest `market_daily_briefings` row (or `null`) and the 5 most recent `selection_history` rows.

FR-03: The system shall render, for the latest Market Daily Briefing, its `spx_regime`, `spx_price` vs. `spx_sma50`/`spx_sma200`, the 3 sector relative-strength percentages, macro sentiment counts, `vix_proxy_change`, and the `narrative` text.

FR-04: The system shall render, for the most recent selection cycle, its `selectedSymbols` and, for each selected symbol present in `candidateScores`, that candidate's `score`/`regime`/`risks`/`thesis`.

FR-05: The system shall render the other (up to) 4 recent selection cycles as a compact list showing only their timestamp and selected symbols.

FR-06: The system shall show a calm, non-error notice when there are no selection cycles in the returned data, or when the most recent one is older than a defined staleness threshold.

FR-07: The system shall render a loading/skeleton state while `/api/buy-scanner` is in flight, matching the existing dashboard convention (e.g. `PerformanceAnalytics.tsx`).

FR-08: The system shall not provide any control that writes to, re-triggers, or mutates the selection pipeline or either underlying table.

---

## Non-Functional Requirements

NFR-01: The new tab's data fetching shall follow the "self-contained client component" pattern (own `useState`/`useEffect`/API route), matching `PerformanceAnalytics.tsx`, not the page-level `fetchJSON()` pattern.

NFR-02: The new panel shall use only `ui.tsx`'s existing exports (`Card`, `Badge`, `SignalBadge`, `Dot`, `Progress`) for shared visual primitives.

NFR-03: `npx tsc --noEmit` and `npm run build` shall both pass after the change.

NFR-04: All existing tests shall continue to pass, and their pass/fail counts shall be reported.

---

## Constraints

C-01: This feature touches no Protected Zone file (`src/lib/config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) and requires no special Amaury authorization beyond normal spec approval.

C-02: The system must not modify `selection_history`, `market_daily_briefings`, or `selection_failures` schemas — read-only consumption only.

C-03: The system must not modify `stock-selector.ts`, `claude-agent.ts`, or any part of the selection pipeline.

C-04: The system must not modify any of the 4 existing tabs' panels or `DashboardTabs.tsx`'s switching logic beyond the one additive `TABS` entry.

C-05: The system must not invent new shared UI primitives in `ui.tsx` — only consume existing exports.

## Out of Scope

- A "re-run scanner" button or any manual trigger for the selection pipeline.
- A date/cycle selector for browsing further back than the 5 most recent selection rows (may be a natural follow-up, not this CHANGE).
- Any change to `selection_history`, `market_daily_briefings`, `selection_failures`, or the scripts that write to them.
- Any change to the 4 existing dashboard tabs beyond the two additive wiring edits (`TABS` array, `tabs` object).
