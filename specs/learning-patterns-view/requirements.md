# Requirements — Learning tab "Patterns" view + Analytics tab drops the old Pattern Library card

## Context

`src/lib/pattern-stats.ts` (approved) exports `getPatternStats(trades: TradeEvaluation[]): PatternStats`, where
`PatternStats = { schema, multipleComparisonsNote, setups: SetupTrackRecord[], buckets: Record<SetupName,
DimensionReport[]> }`. `SetupTrackRecord` carries `setup`, `baseline` (a `TradeSummary` from `trade-views.ts`:
`n`, `wins`, `winRate`, `avgPnlPct`, `medianPnlPct`, `worstPnlPct`, `bestPnlPct`), `fingerprintCoverage: {
stored, recomputed, missing }`, and `ruleVersions: RuleVersionSegmentSummary[]` (`label`, `appliesTo`,
`effectiveDate`, `before: TradeSummary`, `after: TradeSummary`). `DimensionReport` carries `dimension`, `kind`
(`'confirmatory' | 'exploratory' | 'diagnostic'`), `skipped`, `reason?`, `viable`, `baseline`, and
`buckets: BucketReport[]`. `BucketReport` carries `bucket`, `summary: TradeSummary`, `shrunkAvgPnl`,
`ci95: { mean, lower, upper }`, `label: 'INSUFFICIENT' | 'INCONCLUSIVE' | 'DIFFERS_POS' | 'DIFFERS_NEG'`,
`historical: TradeSummary`, `forward: TradeSummary`, `forwardVerdict: 'PENDING' | 'CONSISTENT' |
'CONTRADICTED'`. `pattern-schema.ts` exports `filterDiagnostic(dimensions: DimensionSchemaEntry[])` and
`MULTIPLE_COMPARISONS_NOTE`. None of `pattern-stats.ts`/`pattern-schema.ts`/`pattern-labels.ts`/
`state-fingerprint.ts`/`trade-views.ts` import `db.ts`, `@supabase/supabase-js`, `fs`, or read `process.env` —
confirmed safe to import into a client component.

`LearningPanel.tsx` (approved, CHANGE 2) is the Learning tab shell — three sub-view buttons (Timeline default,
By symbol, By setup), receiving `allTrades: TradeEvaluation[]` (fetched via `/api/trades?limit=500` in
`page.tsx`, with `stateFingerprint` and `buyIndicators` intact after the JSON round-trip — confirmed, no
mapper drops fields). `trade-views.ts` exports `buildTimeline(trades)`, returning entries newest-first with
`lessons: string[]`. `pnlPct` is already in percent units.

The Analytics tab currently renders `PatternLibraryCard` fed by `patterns` (fetched from `/api/patterns`,
itself reading the old `pattern_library` table) — this CHANGE removes that card from the Analytics tab render
only. The component file, the API route, and the table are untouched and keep serving the weekly PDF report
and the agent's prompt until a later `learning.ts` CHANGE. In `page.tsx`, `patterns` is used by nothing other
than `<PatternLibraryCard patterns={patterns} />` — confirmed by reading the file in full — so once that
render is removed, its `fetchJSON<TradingPattern[]>('/api/patterns', [])` call and the now-unused
`TradingPattern` type import are removed too.

`PerformanceAnalytics.tsx`'s scope toggle uses this exact markup, to be replicated (not imported, not edited):
```
<div className="flex p-0.5 rounded-md bg-white/[0.04] border border-border text-[10.5px]">
  <button className={cx('px-2.5 py-1 rounded transition tracking-wide',
    active ? 'bg-purple text-white' : 'text-muted hover:text-text')}>Label</button>
  ...
</div>
```

**Pre-Implementation verification already performed (see `design.md`): no FAIL FAST condition is
triggered.** One integration wrinkle was found and is handled by design, not by stopping:
`filterDiagnostic(dimensions: DimensionSchemaEntry[]): DimensionSchemaEntry[]` is typed for bare schema
entries. `DimensionReport` is structurally assignable to `DimensionSchemaEntry` (it has `dimension`/`kind`
plus more), so TypeScript accepts `filterDiagnostic(someDimensionReports)` at the call site — but the
function's declared return type narrows the result to `DimensionSchemaEntry[]`, which would hide the extra
fields (`viable`, `buckets`, `baseline`, etc.) the UI needs. The new code calls `filterDiagnostic` for
fidelity to the named mechanism, then restores the fuller type with a safe, explicit, documented cast back to
`DimensionReport[]` — the underlying runtime objects are never altered by `filterDiagnostic` (it only
filters, it does not transform), so this is sound.

## Functional Requirements

### `LearningPanel.tsx` (modify)

FR-01: The system shall add a fourth sub-view selector button labeled "Patterns" after the existing three
("Timeline", "By symbol", "By setup"), without changing the order, label, or default-selection behavior of
any existing button.

FR-02: The system shall compute `getPatternStats(allTrades)` inside a `useMemo` keyed on `allTrades`, alongside
the existing `buildTimeline`/`groupBySymbol`/`groupBySetup` memoizations.

FR-03: Where the "Patterns" sub-view is active, the system shall render the new `LearningPatterns` component,
passing it the memoized `PatternStats` result and `allTrades`.

### `LearningPatterns.tsx` (new) — view toggle

FR-04: The system shall render a two-button toggle styled identically to `PerformanceAnalytics.tsx`'s scope
toggle (`bg-white/[0.04] border border-border` container; active button `bg-purple text-white`; inactive
`text-muted hover:text-text`), labeled "Latest lessons" and "Setup patterns".

FR-05: The system shall default to the "Latest lessons" view on first render.

### "Latest lessons" view

FR-06: The system shall render the first 10 entries of `buildTimeline(allTrades)`.

FR-07: Each row shall show the sell date, the symbol, a setup badge, an outcome-colored tone (green for
`profit`, red for `loss`), the entry's `pnlPct` as a signed percentage with 2 decimal places (never rescaled),
and the holding days.

FR-08: The first row shall be expanded by default, showing its `lessons` as a plain-text list.

FR-09: Every other row shall be collapsed by default and shall expand via a real `<button>` element, showing
its `lessons` as a plain-text list when expanded.

FR-10: The system shall render the caption "Lessons are written by the model after each exit; treat them as
hypotheses, not validated rules".

FR-11: Where `allTrades` is empty, the system shall render "No closed trades yet" instead of the row list.

### "Setup patterns" view

FR-12: The system shall render one block per setup present in `getPatternStats(allTrades).setups`, excluding
the `'UNKNOWN'` entry, ordered by `baseline.n` descending.

FR-13: Each setup block's header shall show a setup badge, `baseline.n`, `baseline.winRate`,
`baseline.avgPnlPct`, `baseline.medianPnlPct`, `baseline.worstPnlPct`, and the text "fingerprint: X stored /
Y recomputed / Z missing" built from `fingerprintCoverage`.

FR-14: For each setup, the system shall render its dimensions from `getPatternStats(allTrades).buckets[setup]`
with every `'diagnostic'`-kind dimension removed via `filterDiagnostic`.

FR-15: Each rendered dimension shall show a tag reading "confirmatory" or "exploratory" matching its `kind`.

FR-16: Where a dimension's `skipped` is `true`, the system shall render one muted line reading "skipped:
`<reason>`" and no bucket table for that dimension.

FR-17: Where a dimension's `skipped` is `false` and `viable` is `false`, the system shall render one muted
line containing its `reason` and no bucket table for that dimension.

FR-18: Where a dimension's `viable` is `true`, the system shall render a table of its `buckets`, each row
showing: bucket name, `summary.n`, `summary.winRate`, `summary.avgPnlPct`, `shrunkAvgPnl`, the 95% confidence
interval (`ci95.lower`–`ci95.upper`), the bucket's label (translated per FR-20), "`historical.n` / `forward.n`"
for history/forward sample sizes, and the forward-verdict text (per FR-21).

FR-19: The system shall render the dimension's `baseline` summary alongside every bucket table it renders.

FR-20: The system shall translate each `BucketLabel` value to display text exactly as follows:
`INSUFFICIENT` → "too few trades", `INCONCLUSIVE` → "inconclusive", `DIFFERS_POS` → "differs (+)",
`DIFFERS_NEG` → "differs (-)" — and shall never render the words "supported" or "strong" anywhere in this
view.

FR-21: The system shall translate each `forwardVerdict` value to display text exactly as follows: `PENDING` →
"forward: pending (n<5)", `CONSISTENT` → "consistent so far", `CONTRADICTED` → "contradicted".

FR-22: Where a dimension is `'exploratory'`-kind and viable, the system shall render its bucket table in a
visually muted style and labelled "exploratory".

FR-23: The system shall render, for each setup block, one muted line per entry of `ruleVersions`, reading
"`{effectiveDate}` `{label}`: `{before.n}` before / `{after.n}` after".

FR-24: The system shall render, once at the top of the "Setup patterns" view, the text of
`multipleComparisonsNote` followed by "Patterns inform; they never gate entries".

FR-25: The system shall never render a dollar-denominated figure or a profit-factor figure anywhere in
`LearningPatterns.tsx` — percent metrics and trade counts only.

### Analytics tab cleanup

FR-26: The system shall remove `<PatternLibraryCard patterns={patterns} />` from the Analytics tab's rendered
content in `page.tsx`.

FR-27: Where the `patterns` value fetched for `PatternLibraryCard` is used by nothing else in `page.tsx`, the
system shall remove that fetch from the `Promise.all` call and its now-unused `TradingPattern` type import.

FR-28: The system shall not delete, rename, or modify `PatternLibraryCard.tsx` or the `/api/patterns` route.

## Non-Functional Requirements

NFR-01: New components shall be client components (`'use client'`) importing only from `ui.tsx`,
`trade-views.ts`, `pattern-stats.ts`, `pattern-schema.ts`, `types.ts`, and React.

NFR-02: The implementation shall introduce at most 2 new files (`LearningPatterns.tsx` and, optionally, one
helper component for rendering a single setup's block), each under 300 lines.

NFR-03: No new component shall perform client-side data fetching; all data shall arrive via the `allTrades`
prop already computed server-side.

NFR-04: No new or modified component shall use `dangerouslySetInnerHTML`.

NFR-05: This change shall not introduce any new npm dependency.

NFR-06: All color/tone usage shall use only the existing design tokens (`ink`, `surface`, `surface2`,
`border`, `border2`, `text`, `muted`, `mute2`, `green`, `green2`, `red`, `red2`, `purple`, `purple2`, `amber`,
`blue`) via `ui.tsx` primitives or token-based Tailwind classes.

NFR-07: `npx tsc --noEmit` shall report zero errors after this change.

NFR-08: The full Vitest suite shall pass after this change.

NFR-09: `npm run build` shall succeed after this change.

NFR-10: `pnlPct` shall never be rescaled anywhere in the new or modified code.

## Constraints

C-01: This feature shall not modify any Protected Zone file, `types.ts`, `db.ts`, `trade-views.ts`,
`pattern-stats.ts`, `pattern-schema.ts`, `pattern-labels.ts`, `state-fingerprint.ts`, any API route,
`learning.ts`, `AgentReasoningLog.tsx`, `TradeHistoryTable.tsx`, `PerformanceAnalytics.tsx`, middleware,
`next.config.js`, `package.json`, or any migration.

C-02: This feature shall not add component-test infrastructure or any new test file.

C-03: This feature shall not delete `PatternLibraryCard.tsx` or the `/api/patterns` route.

C-04: This feature shall not introduce any client-side fetch call.

## Out of Scope

- Any change to how `pattern_library`, the weekly PDF report, or the agent's prompt source their data
  (deferred to a later `learning.ts` CHANGE).
- Deleting `PatternLibraryCard.tsx` or `/api/patterns` (explicitly deferred).
- Automated/visual verification in a browser — this is a static, code-level implementation; a manual
  by-hand checklist is produced instead (see `design.md`).
- Automated tests for the new components (no component-test infrastructure exists, and none may be added).
- Any dashboard content beyond the Learning tab's 4th view and the Analytics tab's card removal.
