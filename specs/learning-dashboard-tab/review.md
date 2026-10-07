# Review Report — New "Learning" dashboard tab + fix misleading pattern cards

**Date**: 2026-10-07
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Fetch `/api/trades?limit=500` into `allTrades` inside the existing `Promise.all` | ✅ | `page.tsx:61-67` |
| FR-02 | Default `allTrades` to `[]` on failure | ✅ | `fetchJSON<TradeEvaluation[]>('/api/trades?limit=500', [])` — existing fallback mechanism |
| FR-03 | Existing `trades` fetch and its consumers unchanged | ✅ | `trades` still flows only to `TradeHistoryTable` (`page.tsx:123`); `allTrades` flows only to `LearningPanel` (`page.tsx:164`) — verified both are distinct variables with distinct consumers |
| FR-04 | `tabs.learning` key renders the panel with `allTrades` | ✅ | `page.tsx:157-165` |
| FR-05 | `TABS` gains exactly one entry, appended, others unchanged | ✅ | `DashboardTabs.tsx` diff shows a pure addition after `health`; no existing entry's `id`/`label`/`kicker` changed |
| FR-06 | Three sub-view selector controls | ✅ | `SUB_VIEWS` array → "Timeline", "By symbol", "By setup" buttons, `LearningPanel.tsx:15-19,43-58` |
| FR-07 | Timeline shown by default | ✅ | `useState<SubView>('timeline')` |
| FR-08 | Data derived via `useMemo` over `buildTimeline`/`groupBySymbol`/`groupBySetup` | ✅ | `LearningPanel.tsx:28-30` |
| FR-09 | "No closed trades yet" empty state | ✅ | `LearningPanel.tsx:32-38`, exact literal text, rendered instead of selector+view |
| FR-10 | Timeline renders `buildTimeline` order as-is (newest first) | ✅ | `LearningTimeline` only slices, never re-sorts `entries` |
| FR-11 | 30 at a time + "Show more" | ✅ | `PAGE_SIZE = 30`, `visibleCount` state, `hasMore` gate |
| FR-12 | Row: sell date, symbol, setup badge, outcome tone, signed 2dp `pnlPct`, holding days | ✅ | `LearningTimeline.tsx:48-61` |
| FR-13 | `pnlPct` never rescaled | ✅ | `fmtSignedPct` only formats (sign + `toFixed(2)`), no multiplication/division |
| FR-14 | `'UNKNOWN'` setup renders with a neutral tone | ✅ | Via `SignalBadge`'s existing fallback (`{tone:'neutral', label: signal}` for any unmapped string) — same mechanism already accepted for `MEAN_REVERSION` |
| FR-15 | Row expandable via real `<button>`, reveals buy/sell price, chips, lessons | ✅ | `LearningTimeline.tsx:42-63` is a real `<button type="button">`; expanded block at `65-86` |
| FR-16 | Lessons rendered as plain text, never HTML-interpreting | ✅ | `<li key={i}>{lesson}</li>` — plain JSX text child; `dangerouslySetInnerHTML` grep across all 4 new files returned no matches |
| FR-17 | By-symbol renders `groupBySymbol` output, one block per symbol | ✅ | `LearningBySymbol.tsx:43-93` |
| FR-18 | Block shows overall `n`, win rate, avg, median | ✅ | `LearningBySymbol.tsx:54-64` |
| FR-19 | One row per `bySetup` entry with `n`, win rate, avg | ✅ | `LearningBySymbol.tsx:69-77` |
| FR-20 | `lowSample` → muted "small sample (n<5)" label | ✅ | `LearningBySymbol.tsx:75`, exact text |
| FR-21 | Expand shows that symbol's trades newest-first (date, setup, pnlPct) | ✅ | `LearningBySymbol.tsx:80-90`, using `group.trades` (already newest-first per `groupBySymbol`) |
| FR-22 | Caption "Small samples are context, not statistics" | ✅ | `LearningBySymbol.tsx:40`, exact text |
| FR-23 | By-setup renders `groupBySetup` output, one block per setup | ✅ | `LearningBySetup.tsx:30-67` |
| FR-24 | Block shows `n`, win rate, avg, median, "N of M trades have a state fingerprint" | ✅ | `LearningBySetup.tsx:34-42`, exact wording via `tradesWithFingerprint`/`n` |
| FR-25 | Buckets as rows: dimension, bucket, n, win rate, avg | ✅ | `LearningBySetup.tsx:49-63` |
| FR-26 | Bucket `lowSample` → "hypothesis (n<20)" | ✅ | `LearningBySetup.tsx:61`, exact text |
| FR-27 | Empty `buckets` → "Not enough trades per bucket" | ✅ | `LearningBySetup.tsx:45-46`, exact text, ternary replaces the table entirely |
| FR-28 | No dollar total as a headline anywhere in the three sub-views | ✅ | No `pnlUSD` or dollar sum rendered in any of the three views; the only `$` figures are per-trade buy/sell *prices* inside Timeline's expanded detail, which are not totals |
| FR-29 | Stop deriving symbol from `p.id` | ✅ | `const symbol = p.id.split('_').pop()...` line removed, confirmed by diff |
| FR-30 | `p.id` still used as React key | ✅ | `<div key={p.id} ...>` unchanged |
| FR-31 | `p.patternKey` shown as small muted text when present | ✅ | `PatternLibraryCard.tsx:44-46` |
| FR-32 | Caption "Each card aggregates trades from several symbols" | ✅ | `PatternLibraryCard.tsx:21`, exact text |
| FR-33 | Badge/sample count/description/avg P&L/insufficient-data badge unchanged | ✅ | Diff shows only additions/removal of the symbol line; all five elements present and untouched |

**33/33 functional requirements SATISFIED.**

### Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | New components import only `ui.tsx`/`trade-views.ts`/`types.ts`/React | ✅ | Verified via import grep on all 4 new files; `LearningPanel` additionally imports its three sibling view components, which is the explicit shell+3-views architecture this same spec's `design.md` mandates — not an external dependency |
| NFR-02 | ≤4 new files, each <300 lines | ✅ | Exactly 4 files created; longest is `LearningTimeline.tsx` at 104 lines |
| NFR-03 | No client-side fetching in new components | ✅ | No `fetch`/`useEffect` in any of the 4 files — only `useState`/`useMemo` |
| NFR-04 | No `dangerouslySetInnerHTML` | ✅ | Confirmed via grep, no matches |
| NFR-05 | No new npm dependency | ✅ | `package.json` not in the diff |
| NFR-06 | Only existing design tokens / `ui.tsx` primitives for color | ✅ | All classes use token names (`text-muted`, `text-mute2`, `text-green`, `text-red`, `text-text`, `border-border`, `border-border2`) or the pre-existing `bg-white/[x]` hover-overlay convention already used pervasively across the dashboard (not a new color) |
| NFR-07 | `tsc --noEmit` clean | ✅ | Re-ran during review — zero errors |
| NFR-08 | Full Vitest suite passes | ✅ | Re-ran during review — 52 files / 512 tests passed, unchanged from before this feature |
| NFR-09 | `npm run build` succeeds | ✅ | Re-ran during review — compiled and generated routes successfully, `/dashboard` listed as dynamic |

### Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | `trade-views.ts` not modified | ✅ | Not in the diff |
| C-02 | `AgentReasoningLog.tsx`, `TradeHistoryTable.tsx`, API routes, `db.ts`, `types.ts`, `learning.ts`, migrations, middleware, `next.config.js`, `package.json` untouched | ✅ | None appear in `git status` |
| C-03 | Protected Zone untouched without confirmation | ✅ | See Protected Zone Audit below |
| C-04 | No test infrastructure / new test file added | ✅ | No test files in the diff |
| C-05 | `pnlPct` never rescaled | ✅ | Confirmed in all three views — displayed value is always the raw field, formatted only |
| C-06 | UI copy in English | ✅ | All new/changed copy is English, matching the dashboard |
| C-07 | Visual result not automatically verified | ✅ | Correctly disclosed — `tasks.md` T-27 explicitly records this as not run and pending for Amaury, rather than claiming it was checked |

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

No Protected Zone file appears in `git status`. No unauthorized change to flag.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity (claude-agent.ts) | ➖ N/A | File not touched by this change |
| Supabase patterns (db.ts / queries) | ➖ N/A | `db.ts` not touched; no new component imports it; no new query added |
| TypeScript quality | ✅ | No `any` types, no mutation (grep for `.push`/`.splice`/in-place `.sort()` on any prop array returned no matches — every array operation is `.map`/`.filter`/`.slice`/`Object.entries`, all non-mutating). Named constants used (`PAGE_SIZE`). One stylistic note: each component's top-level render function runs 70–100 lines including JSX, over the 50-line guideline — but this matches 100% of the existing dashboard components reviewed for precedent (`TradeHistoryTable`, `WeeklyReportsCard`, `PatternLibraryCard` are all similarly sized or larger), so this is the established house style for JSX-returning components, not a deviation introduced by this change |
| Security | ✅ | No secrets, no DB/network calls, no `console.log` anywhere in the 4 new files or the 3 modified files' diffs |

---

## Task Checklist

- Completed: 34/35 tasks. The one remaining item, "Run `/review learning-dashboard-tab` to verify implementation matches spec," is satisfied by this report and is checked off below.

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- `fmtSignedPct`/`fmtPct` treat exactly `0` as "positive" (prefixing `+0.00%`), where `TradeHistoryTable`'s existing precedent (`isProfit = pnlPct > 0`) shows no sign at all for exactly `0`. Purely cosmetic, affects only the zero-pnl edge case, and doesn't violate any FR (all three new files are internally consistent with each other).
- Lesson list items in `LearningTimeline` use the array index as the React `key` (`key={i}`). Safe here since the list is static per render and never reordered, but a more defensive key (e.g. `${entry.id}-lesson-${i}`) would be marginally more robust against future edits.
- Small cross-file duplication of `fmtPct`/`fmtWinRate`/`fmtDate`/`cx` across `LearningTimeline.tsx`, `LearningBySymbol.tsx`, and `LearningBySetup.tsx`. This is a direct consequence of the spec's hard 4-file cap (no 5th shared-utils file was in scope) and is a deliberate, documented trade-off in `design.md`, not an oversight.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. All 33 functional requirements, all 9 non-functional requirements, and all 7 constraints are satisfied. Protected Zone is untouched. `tsc --noEmit` is clean, the full test suite (52 files / 512 tests) passes, and `npm run build` succeeds — all re-verified independently during this review. The only open item is the explicitly-disclosed manual visual checklist, which requires a human running `npm run dev` and is correctly not claimed as done. Ready to commit.
