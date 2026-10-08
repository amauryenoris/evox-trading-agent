# Review Report — learning-patterns-view

**Date**: 2026-10-08
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

Verification basis: static code review plus `npx tsc --noEmit` (clean), full Vitest run (55 files / 558 tests pass),
`npm run build` (succeeds), and a read-only run of `.tmp/pattern-stats-check.ts` against 113 real closed trades.
The visual result was NOT checked in a browser.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | 4th "Patterns" button after the existing three; others unchanged | ✅ | `SUB_VIEWS` appended; default stays `'timeline'` |
| FR-02 | `getPatternStats(allTrades)` in a `useMemo` keyed on `allTrades` | ✅ | `LearningPanel.tsx` |
| FR-03 | Render `LearningPatterns` with memoized stats + `allTrades` when active | ✅ | |
| FR-04 | Two-button toggle styled like `PerformanceAnalytics` scope toggle | ✅ | Same classes; container has an added `w-fit` |
| FR-05 | Default to "Latest lessons" | ✅ | |
| FR-06 | First 10 entries of `buildTimeline(allTrades)` | ✅ | `LATEST_LESSONS_COUNT = 10` |
| FR-07 | Date, symbol, setup badge, outcome tone, signed `pnlPct` 2dp, holding days | ✅ | `pnlPct` not rescaled |
| FR-08 | First row expanded by default, lessons as plain list | ✅ | `overrides[id] ?? index === 0` |
| FR-09 | Other rows collapsed, expand via real `<button>` | ✅ | `aria-expanded` set |
| FR-10 | Lessons caption text | ✅ | Exact wording |
| FR-11 | "No closed trades yet" when empty | ✅ | Unreachable in practice (parent returns early) but implemented |
| FR-12 | One block per setup excl. UNKNOWN, ordered by `baseline.n` desc | ✅ | `flatMap` narrows `UNKNOWN` out, then sort |
| FR-13 | Header: badge, n, win rate, avg, median, worst, fingerprint coverage | ✅ | |
| FR-14 | Dimensions from `buckets[setup]`, diagnostic removed via `filterDiagnostic` | ✅ | Real helper called, documented cast |
| FR-15 | confirmatory/exploratory tag | ✅ | `Badge` showing `kind` |
| FR-16 | Skipped → "skipped: reason", no table | ✅ | |
| FR-17 | Not viable → reason line, no table | ✅ | |
| FR-18 | Viable → table with bucket, n, win, avg, shrunk, CI, label, hist/fwd n, verdict | ✅ | |
| FR-19 | Baseline shown with every bucket table | ✅ | |
| FR-20 | Label translation; never "supported"/"strong" | ✅ | Grep of both files clean |
| FR-21 | Forward verdict translation | ✅ | Exact strings |
| FR-22 | Exploratory viable tables muted + labelled | ✅ | `opacity-60` + "exploratory" tag |
| FR-23 | One muted line per `ruleVersions` entry | ✅ | |
| FR-24 | Note + "Patterns inform; they never gate entries" once at the top | ⚠️ | Rendered once above the toggle (visible in both views) per T-10's stated alternative, not inside "Setup patterns" only. Text and single-instance requirement met; placement differs from the FR wording |
| FR-25 | No dollar or profit-factor figure | ✅ | No `$` figure in either file; the only `$` is a template-literal key |
| FR-26 | Remove `PatternLibraryCard` from Analytics tab | ✅ | |
| FR-27 | Remove unused `patterns` fetch and `TradingPattern` import | ✅ | Also removed the now-unused `PatternLibraryCard` import |
| FR-28 | Don't touch `PatternLibraryCard.tsx` / `/api/patterns` | ✅ | Both exist, unmodified |
| NFR-01 | Client components, restricted imports | ✅ | react, `types`, `trade-views`, `pattern-stats`, `pattern-schema`, `ui`, and each other only |
| NFR-02 | At most 2 new files, each <300 lines | ✅ | 148 and 142 lines |
| NFR-03 | No client-side data fetching | ✅ | |
| NFR-04 | No `dangerouslySetInnerHTML` | ✅ | |
| NFR-05 | No new dependency | ✅ | `package.json` unchanged |
| NFR-06 | Design tokens only | ✅ | Token classes and `ui.tsx` primitives |
| NFR-07 | tsc clean | ✅ | Verified |
| NFR-08 | Vitest passes | ✅ | 558/558 |
| NFR-09 | Build succeeds | ✅ | Verified |
| NFR-10 | `pnlPct` never rescaled | ✅ | The only `* 100` is on `winRate` (a 0–1 fraction) |
| C-01 | No forbidden file modified | ✅ | Only `LearningPanel.tsx` and `page.tsx` modified |
| C-02 | No new test file / test infra | ✅ | |
| C-03 | Don't delete card or route | ✅ | |
| C-04 | No client-side fetch | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |
| .env / .env.local, vercel.json, migrations | UNTOUCHED | `.env.local` was only read by the gitignored throwaway script |

`git status` shows no change under `src/lib/`.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A — `claude-agent.ts` not touched |
| Supabase patterns | ✅ | N/A — no `db.ts` import or query in new code |
| TypeScript quality | ⚠️ | No `any`, no mutation. One documented cast. `LatestLessons` is ~65 lines (>50 limit); see MEDIUM |
| Security | ✅ | No secrets, no `console.*`, no raw HTML, no fetch |

## Task Checklist

- Completed: 30/30 implementation tasks (the 4 Post-Implementation items are what this review covers)

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- `LatestLessons` in `LearningPatterns.tsx` is ~65 lines, over the project's 50-line function limit. Extract the row into a small `LessonRow` component.
- Analytics tab layout: the `xl:grid-cols-2` grid now contains only `TradeHistoryTable`, so it renders at half width on wide screens. The spec said to leave the tab otherwise untouched, so this was not changed; decide whether to make it full width (small follow-up).

### LOW (optional)
- `cx`, `fmtDate` and `fmtSignedPct` are duplicated from `LearningTimeline.tsx`/`LearningPanel.tsx`. The spec's NFR-01 import allow-list prevented sharing them; revisit if a shared util is ever allowed.
- The Analytics subtitle still says "...and the patterns it has learned to exploit", which no longer matches the removed card.
- FR-24 placement deviates from the FR wording (see table); T-10 explicitly allowed it.
- Visual rendering (table width at narrow screens, muting contrast, row layout) is unverified. Manual checklist in `design.md` is pending for Amaury.

---

## Decision

**APPROVED WITH WARNINGS** — no CRITICAL or HIGH findings; one function-length overage and a layout follow-up (MEDIUM) plus the unchecked manual visual verification. Ready to commit after the manual browser check.
