# Design — Learning tab "Patterns" view + Analytics tab drops the old Pattern Library card

## Architecture Decision

This is pure UI, layered on top of the already-approved `pattern-stats.ts` module and the already-shipped
Learning tab (CHANGE 2). It modifies two existing files (`LearningPanel.tsx`, `page.tsx`) and adds up to two
new client components under `src/components/dashboard/`. No new data-fetching path is introduced — the
"Patterns" view is a pure function of the `allTrades` prop `LearningPanel` already receives.

Two new files:
- **`LearningPatterns.tsx`** — the view's shell: the two-button toggle (FR-04/05), the "Latest lessons"
  sub-view (FR-06 to FR-11, small — 10 rows + expand state), and the top caption (FR-24). Delegates each
  setup's block to...
- **`LearningPatternSetupBlock.tsx`** (the optional helper from the ALLOWED list) — renders one setup's full
  block: header (FR-13), dimension list with viable/not-viable/skipped branching (FR-14 to FR-22), and rule
  versions (FR-23). Pulled into its own file because the "Setup patterns" view repeats this block once per
  setup and its rendering logic (per-dimension branching, per-bucket table rows, label/verdict translation)
  is substantial enough that inlining it in `LearningPatterns.tsx` would push that file over the 300-line cap
  and make the toggle/lessons logic harder to scan.

## Data Flow

```
allTrades: TradeEvaluation[]  (already a LearningPanel prop, from page.tsx's /api/trades?limit=500 fetch)
        │
        ▼
LearningPanel.tsx (MODIFIED)
  SUB_VIEWS += { id: 'patterns', label: 'Patterns' }          ← NEW, appended last
  const patternStats = useMemo(() => getPatternStats(allTrades), [allTrades])   ← NEW
        │
        ▼ (when the 'patterns' sub-view is active)
LearningPatterns.tsx (NEW)
  activeToggle: 'lessons' | 'setups' (useState, default 'lessons')
   ┌──────────────┴──────────────┐
   ▼                             ▼
"Latest lessons"           "Setup patterns"
  buildTimeline(allTrades)   patternStats.setups
    .slice(0, 10)              .filter(s => s.setup !== 'UNKNOWN')
  first row expanded           .sort(by baseline.n desc)
  others expand via <button>   .map(record => (
                                  <LearningPatternSetupBlock
                                    key={record.setup}
                                    record={record}
                                    dimensions={patternStats.buckets[record.setup]}
                                  />
                                ))
                                     │
                                     ▼
                          LearningPatternSetupBlock.tsx (NEW)
                            header: badge, n, winRate, avg/median/worst, fingerprint coverage
                            dimensions: filterDiagnostic(dimensions) as DimensionReport[]  ← documented cast
                              .map(dim =>
                                dim.skipped        → muted "skipped: <reason>" line
                                : !dim.viable      → muted "<reason>" line
                                : viable           → bucket table (+ baseline, + exploratory muting)
                              )
                            ruleVersions: one muted line per boundary
```

`page.tsx`'s only other change is removing the `PatternLibraryCard` render from the Analytics tab and, since
`patterns` is used nowhere else there, dropping its fetch from the `Promise.all` and the now-unused
`TradingPattern` import.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Inline the per-setup block directly in `LearningPatterns.tsx` | One fewer file | The "Setup patterns" view's branching (skipped/non-viable/viable × up to 6 dimensions × bucket tables) is dense enough to push the file well past 300 lines and bury the simpler toggle/lessons logic | Rejected |
| Split into `LearningPatterns.tsx` (shell + lessons) + `LearningPatternSetupBlock.tsx` (one setup's block) | Matches the ALLOWED "+ optionally one helper file" ceiling exactly; keeps each file's concerns legible | One more file than the 1-file minimum | **Chosen** |
| Call `filterDiagnostic` and keep its declared `DimensionSchemaEntry[]` return type, re-deriving `viable`/`buckets`/etc. by re-matching against the original `DimensionReport[]` by `dimension` name | Avoids any cast | More code, another join operation, for a problem a single documented cast already solves safely (the objects are untouched by `filterDiagnostic`, only filtered) | Rejected |
| Skip `filterDiagnostic` entirely and inline `.filter(d => d.kind !== 'diagnostic')` on `DimensionReport[]` directly | No cast needed, fully type-safe without exception | The spec explicitly names `filterDiagnostic` as the mechanism to use ("diagnostic ones removed with filterDiagnostic") — bypassing it entirely to dodge a one-line, well-understood cast is overcautious | Rejected — `filterDiagnostic` is called, then the result is cast back to `DimensionReport[]` (see Pre-Implementation Verification) |
| Fetch `PatternStats` or `TradeEvaluation[]` client-side inside `LearningPatterns.tsx` | Simpler prop plumbing | Explicitly forbidden (NFR-03/C-04); `allTrades` is already available from the parent | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/components/dashboard/LearningPanel.tsx` | MODIFY | Add the 4th `SUB_VIEWS` entry; add the `getPatternStats` `useMemo`; render `LearningPatterns` when active |
| `src/components/dashboard/LearningPatterns.tsx` | CREATE | Toggle shell, "Latest lessons" view, top caption |
| `src/components/dashboard/LearningPatternSetupBlock.tsx` | CREATE | One setup's full block for the "Setup patterns" view |
| `src/app/dashboard/page.tsx` | MODIFY | Remove `<PatternLibraryCard patterns={patterns} />` from the Analytics tab; remove the now-unused `/api/patterns` fetch and `TradingPattern` import |

No other file is read or written by this change. `pattern-stats.ts`, `pattern-schema.ts`, `pattern-labels.ts`,
`trade-views.ts`, `PatternLibraryCard.tsx`, `/api/patterns`, `PerformanceAnalytics.tsx`, and every Protected
Zone file are untouched.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. All touched/created files are in the "touch
freely" column of `CLAUDE.md`'s permission matrix (`src/app/dashboard/**`, `src/components/dashboard/**`).

## Database Changes

None.

## Pre-Implementation Verification (FAIL FAST check — already performed)

- **Does `pattern-stats.ts` (or what it imports) pull in a server-only module?** No. Read
  `pattern-stats.ts`, `pattern-schema.ts`, `pattern-labels.ts`, and `state-fingerprint.ts` in full: their only
  imports are each other, `trade-views.ts`, and `./types` — no `db.ts`, no `@supabase/supabase-js`, no `fs`,
  no `process.env` read anywhere. Safe to import into a `'use client'` component. No STOP condition.
- **Is every field this UI needs actually exported?** Yes — `label`, `ci95` (`mean`/`lower`/`upper`),
  `historical`/`forward` (each a full `TradeSummary`), `forwardVerdict`, `viable`/`reason`, `skipped`/`reason`,
  and `fingerprintCoverage` are all present on the real `BucketReport`/`DimensionReport`/`SetupTrackRecord`
  types, confirmed by reading `pattern-stats.ts` in full. No STOP condition.
- **Does `allTrades` carry what `getPatternStats` needs after going through `/api/trades`?** Yes —
  `/api/trades` returns `NextResponse.json(trades)` with no field-dropping mapper (confirmed in CHANGE 1's
  review), so `stateFingerprint` and `buyIndicators` survive the JSON round-trip into `allTrades` on the
  client. `confidence` is not among them — but it was never going to be: `pattern-stats.ts` already reports
  `confidence_bucket` as `skipped: missing field confidence` for every setup, by design, independent of this
  CHANGE. No STOP condition.
- **The `filterDiagnostic` typing wrinkle** (described in `requirements.md`'s Context): confirmed not a STOP
  — every field remains present at runtime; only the TypeScript return type is narrower than this UI needs.
  Resolved with one explicit, commented cast at the single call site in `LearningPatternSetupBlock.tsx`:
  `filterDiagnostic(dimensions) as DimensionReport[]`.

## Manual Verification Checklist (visual result NOT automatically verified)

This change has no component-test infrastructure and no browser automation in this environment. The
following must be checked by hand after implementation, in a running `npm run dev` session:

1. The Learning tab shows a 4th selector button, "Patterns", after "By setup".
2. Clicking it shows the toggle ("Latest lessons" / "Setup patterns"), styled like `PerformanceAnalytics`'s
   scope toggle (rounded pill, active = purple fill).
3. "Latest lessons" shows up to 10 rows, the first already expanded with its lessons listed as plain text;
   clicking another row's button expands it the same way.
4. "Setup patterns" shows one block per setup (not `UNKNOWN`), ordered by `n` descending, each with a header,
   dimension tags (confirmatory/exploratory), bucket tables for viable dimensions (with label/verdict text,
   never "supported"/"strong"), muted lines for skipped/non-viable dimensions, and rule-version lines.
5. No dollar figure or profit-factor number appears anywhere in the Patterns view.
6. The Analytics tab no longer shows the Pattern Library card; `TradeHistoryTable` and `PerformanceAnalytics`
   on that tab are otherwise unchanged.

## Open Questions

- None. All FAIL FAST conditions were checked against the current codebase and passed; the one integration
  wrinkle found (`filterDiagnostic`'s narrow return type) has a documented, safe resolution.
