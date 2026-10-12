# Tasks — Setup-aware learning context for the BUY prompt + persisted decision snapshot

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`src/lib/learning.ts`, `src/lib/claude-agent.ts`, wiring only)
- [x ] Database migrations drafted (if applicable) — N/A, none needed
- [x] Open Questions 1-6 in `design.md` answered

## Implementation Checklist

### Phase 0 — Read-only pre-checks
- [x] T-01: Confirm `open_position_contexts.pattern_ids` is a text array (grep `supabase/migrations`, read only). If it
  is not, STOP and report (fail-fast #2).
- [x] T-02: Re-confirm `buildLearningContext` has a single call site and the prompt builder only receives its string.

### Phase 1 — `pattern-stats.ts` additive helper (TDD)
- [x] T-03: Test first: `getTradeDimensionValue` returns the same value `buildBucketReports` used for a stored trade,
  for fingerprint, `ema50_extension_bucket`, `drop3d_bucket` and `reentry_bucket` dimensions.
- [x] T-04: Export `getTradeDimensionValue(dimension, trade, allTrades)` delegating to `getDimensionValue`.
  No other change; existing pattern-stats tests must still pass.

### Phase 2 — `learning-context.ts` (TDD)
- [x] T-05: Write `learning-context.test.ts` (all cases listed in Phase 4) — RED.
- [x] T-06: Create types: `LearningSnapshot` (version 1, setup, asOf, text, baseline, bucketsShown, lessonsShown,
  excludedLessonCount) and the input type; named constants `SECTOR_RS_RELIABLE_FROM`, `MAX_BLOCK_LINES = 40`,
  `MAX_BLOCK_CHARS = 3000`, `MAX_LESSONS = 2`, `SAME_SYMBOL_HISTORY_COUNT = 3`.
- [x] T-07: Track-record section (FR-05/06/07/09) from `buildSetupTrackRecords` + `RULE_VERSION_BOUNDARIES`.
- [x] T-08: Matching-conditions section (FR-10 to FR-18): candidate pseudo-trade, `filterDiagnostic`, viable +
  resolved + `n >= MIN_BUCKET_N`, label wording, exploratory tag, baseline next to each line.
- [x] T-09: Same-symbol section (FR-19 to FR-21).
- [x] T-10: Lessons section (FR-22 to FR-29): same-setup filter via `getStatsSetupName`, instant-based cutoff,
  `excludedLessonCount`, narrow type guard for `sectorRotation`.
- [x] T-11: Footer, cap enforcement with the documented truncation order, snapshot assembly (FR-30 to FR-38).
- [x] T-12: `buildPatternIds(snapshot)` (FR-39).
- [x] T-13: Tests GREEN; file under 300 lines, functions under 50, no `any`.

### Phase 3 — `learning.ts` wrapper ⚠️ Protected Zone
- [x] T-14: Replace `buildLearningContext` with the wrapper (FR-42 to FR-45, FR-51); add `LEARNING_TRADES_LIMIT = 1000`.
- [x] T-15: Remove now-dead prompt code (`compareFingerprints`, `buildRecentTradeLessonsLines`, fingerprint helpers) and
  the `DIMENSION_IMPORTANCE` import. Do not touch `updatePatternLibrary`, `getRelevantPatterns`, `matchesConditions`.
- [x] T-16: Update obsolete existing tests per the answer to Open Question 3.

### Phase 4 — `claude-agent.ts` wiring ⚠️ Protected Zone
- [x] T-17: At `:2119` call `buildLearningContext({ setup: signalType, symbol, indicators, asOf: timestamp })`; pass `.text`
  to `buildEnrichedPrompt`; keep `.snapshot`.
- [x] T-18: Add a snapshot field to the `buyQueue` entry type (`:1599`) and `buyQueue.push` (`:2460`).
- [x] T-19: Direct-BUY site (`:2392`): `indicatorsAtBuy.learningContext = snapshot`; `patternIdsUsed: buildPatternIds(snapshot)`.
- [x] T-20: Ranking-winner site (`:2603`): same, from `best`'s queued snapshot.
- [x] T-21: Confirm the reconcile site (`:244`) is unchanged and nothing else in `claude-agent.ts` differs
  (`git diff` review against FR-52 to FR-58 and C-02/C-03).

### Phase 5 — Testing
- [x] T-22: Unit tests cover: a ZLE05 lesson never appears for a 3DAY candidate; bucket line only when `n >= MIN_BUCKET_N`
  and the dimension is viable; diagnostic dimensions never shown; pre-fix sector-RS exclusion (and trades without
  sector data are kept); same-symbol ordering and limit; line and character caps with lessons dropped first; no `$`
  or profit-factor; no "supported"/"strong"; empty-setup case; inputs not mutated; snapshot shape and
  `snapshot.text === text`; `buildPatternIds`; Z vs `-04:00` cutoff boundary.
- [x] T-23: Verify 80% coverage on `learning-context.ts` (`npm run test:coverage` or `vitest run --coverage`).

### Phase 6 — Verification
- [x] T-24: `npx tsc --noEmit` clean.
- [x] T-25: Full Vitest suite passes.
- [x] T-26: `npm run build` succeeds.
- [x] T-27: Show the diffs of `learning.ts` and `claude-agent.ts`; list new files.
- [x] T-28: Read-only throwaway `.tmp/learning-context-check.ts` (gitignored, no keys printed): print the rendered block
  for FCX as `TREND_PULLBACK_3DAY`, one `MEAN_REVERSION` and one `TREND_ZLE05` candidate, using each chosen
  trade's stored buy indicators as the candidate. Nothing is written anywhere.
- [x] T-29: Confirm `updatePatternLibrary` is byte-identical (`git diff` shows no hunk inside it) and the pattern-library
  write tests still pass.
- [x] T-30: State plainly what was not run: a live agent cycle, the real BUY prompt end to end, and the persisted
  `learningContext` in a real `open_position_contexts` row.

## Post-Implementation

- [ ] Run `/review setup-aware-learning-context` to verify implementation matches spec
- [ ] Confirm only `learning.ts` and `claude-agent.ts` changed in the Protected Zone, and only the wiring
- [ ] Confirm `db.ts`, `types.ts`, `trade-views.ts`, `state-fingerprint.ts`, `pattern-schema.ts`, `pattern-labels.ts`,
  migrations, dashboard, workflows and `package.json` are unchanged

## Estimated Complexity

**Medium-High** — the new module is pure and well-bounded, but it sits on a Protected Zone prompt path that
influences live capital, needs careful cap/truncation logic, and removes behavior that existing tests assert.
