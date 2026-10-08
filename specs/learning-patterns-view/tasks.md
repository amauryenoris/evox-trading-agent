# Tasks — Learning tab "Patterns" view + Analytics tab drops the old Pattern Library card

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [x] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — `LearningPanel.tsx` (modify)
- [x] T-01: Add `{ id: 'patterns', label: 'Patterns' }` to `SUB_VIEWS`, after `'setup'`, with no change to
  the existing three entries or the default active view (FR-01).
- [x] T-02: Add `const patternStats = useMemo(() => getPatternStats(allTrades), [allTrades])` (FR-02).
- [x] T-03: Render `<LearningPatterns patternStats={patternStats} allTrades={allTrades} />` when the
  `'patterns'` sub-view is active (FR-03).

### Phase 2 — `LearningPatterns.tsx` (new)
- [x] T-04: Create the file as a `'use client'` component accepting `{ patternStats: PatternStats,
  allTrades: TradeEvaluation[] }`.
- [x] T-05: Render the two-button toggle ("Latest lessons" default / "Setup patterns"), styled identically
  to `PerformanceAnalytics.tsx`'s scope toggle markup (FR-04/05).
- [x] T-06: "Latest lessons": `buildTimeline(allTrades).slice(0, 10)`; row = sell date, symbol, setup badge,
  outcome tone, signed `pnlPct` (2 decimals, no rescaling), holding days (FR-06/07).
- [x] T-07: First row expanded by default (lessons as a plain-text list); every other row expands via a
  real `<button>` (FR-08/09).
- [x] T-08: Caption: "Lessons are written by the model after each exit; treat them as hypotheses, not
  validated rules" (FR-10).
- [x] T-09: Empty state "No closed trades yet" when `allTrades` is empty (FR-11).
- [x] T-10: Render `multipleComparisonsNote` + "Patterns inform; they never gate entries" once at the top,
  visible regardless of which toggle position is active (FR-24) — confirm placement reads naturally for
  both "Latest lessons" and "Setup patterns" (the spec places it at the top of "Setup patterns"; rendering
  it once at the view level, above the toggle, satisfies the same requirement without duplicating it twice).
- [x] T-11: "Setup patterns": filter `patternStats.setups` to exclude `'UNKNOWN'`, sort by `baseline.n`
  descending, render one `LearningPatternSetupBlock` per entry, passing `record` and
  `patternStats.buckets[record.setup]` (FR-12).

### Phase 3 — `LearningPatternSetupBlock.tsx` (new)
- [x] T-12: Header: setup badge, `n`, `winRate`, `avgPnlPct`, `medianPnlPct`, `worstPnlPct`, and "fingerprint:
  X stored / Y recomputed / Z missing" (FR-13).
- [x] T-13: `filterDiagnostic(dimensions) as DimensionReport[]` — call the real helper, then restore the
  fuller type with the documented cast (per `design.md`'s Pre-Implementation Verification) (FR-14).
- [x] T-14: Each dimension: a "confirmatory"/"exploratory" tag matching `kind` (FR-15).
- [x] T-15: `skipped` dimension → one muted line "skipped: `<reason>`", no table (FR-16).
- [x] T-16: Not `skipped` and not `viable` → one muted line with `reason`, no table (FR-17).
- [x] T-17: `viable` → bucket table: bucket name, `n`, `winRate`, `avgPnlPct`, `shrunkAvgPnl`, `ci95.lower`–
  `ci95.upper`, translated label (FR-20), "`historical.n` / `forward.n`", translated forward-verdict text
  (FR-21) — plus the dimension's `baseline` shown alongside (FR-18/19).
- [x] T-18: `'exploratory'`-kind viable dimensions rendered in a visually muted style, labelled
  "exploratory" (FR-22).
- [x] T-19: One muted line per `ruleVersions` entry: "`{effectiveDate}` `{label}`: `{before.n}` before /
  `{after.n}` after" (FR-23).
- [x] T-20: Confirm no dollar figure or profit-factor number appears anywhere in this file (FR-25).

### Phase 4 — `page.tsx` (modify)
- [x] T-21: Remove `<PatternLibraryCard patterns={patterns} />` from the `analytics` tab's JSX, leaving
  `AgentReasoningLog`, `PerformanceAnalytics`, and `TradeHistoryTable` on that tab untouched (FR-26).
- [x] T-22: Confirm `patterns` has no other reader in `page.tsx`; remove its
  `fetchJSON<TradingPattern[]>('/api/patterns', [])` call from the `Promise.all` and destructuring, and
  remove the now-unused `TradingPattern` import from `@/lib/types` (FR-27).
- [x] T-23: Confirm `PatternLibraryCard.tsx` and `src/app/api/patterns/route.ts` are not deleted or modified
  (FR-28/C-03).

### Phase 5 — Verification
- [x] T-24: Run `npx tsc --noEmit` — must be clean.
- [x] T-25: Run the full Vitest suite — must pass.
- [x] T-26: Run `npm run build` — must succeed.
- [x] T-27: Show the diff of `LearningPanel.tsx` and `page.tsx`; list the new files.
- [x] T-28: Confirm every new component imports only from `ui.tsx`, `trade-views.ts`, `pattern-stats.ts`,
  `pattern-schema.ts`, `types.ts`, and React (plus each other, for `LearningPatterns` → 
  `LearningPatternSetupBlock`).
- [x] T-29: State plainly that the visual result was NOT verified in a browser, and complete the manual
  checklist in `design.md` → "Manual Verification Checklist" by hand (or explicitly flag it as pending for
  Amaury).
- [x] T-30: Re-run the throwaway `.tmp/pattern-stats-check.ts` (gitignored, never print keys) against the
  real `trade_evaluations`; paste a compact per-setup table (n, fingerprint coverage; each dimension's kind,
  viable/reason or skipped/missing-field; every viable bucket's n/avg/shrunk/label/forwardVerdict) into the
  implementation report, and explicitly call out whether `ema50_extension_bucket`, `drop3d_bucket`,
  `reentry_bucket`, and `confidence_bucket` were computable or skipped for each relevant setup. Nothing is
  written anywhere by this step.

## Post-Implementation

- [ ] Run `/review learning-patterns-view` to verify implementation matches spec
- [ ] Confirm Protected Zone files, `types.ts`, `db.ts`, `trade-views.ts`, `pattern-stats.ts`,
  `pattern-schema.ts`, `pattern-labels.ts`, `state-fingerprint.ts`, every API route, `learning.ts`,
  `AgentReasoningLog.tsx`, `TradeHistoryTable.tsx`, and `PerformanceAnalytics.tsx` are unchanged
- [ ] Confirm `PatternLibraryCard.tsx` and `/api/patterns` still exist, unmodified
- [ ] Confirm no new npm dependency was added

## Estimated Complexity

**Medium** — no backend work and no Protected Zone touch, but the "Setup patterns" view has real branching
density (skipped/non-viable/viable × up to 6 dimensions × per-bucket stat rows, across 5 setups) and a
non-trivial type-narrowing wrinkle (`filterDiagnostic`) to resolve cleanly, on top of the simpler toggle and
"Latest lessons" view and the small `page.tsx` cleanup.
