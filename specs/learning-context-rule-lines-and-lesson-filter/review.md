# Review Report — Learning context: rule-version lines and lesson filter

**Date**: 2026-10-13
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verification basis: static review of the diff (2 source files, 186 insertions / 22 deletions), `npx tsc --noEmit`
(clean), full Vitest run (55 files / 590 tests pass), `npm run build` (succeeds), ESLint on the two changed files
(0 errors), coverage on `learning-context.ts` (97.7% lines, 89.5% branches; uncovered lines 88 and 218), and a
read-only run of `.tmp/rule-lines-check.ts` against 117 real closed trades (before/after saved in `.tmp/`).
**Not run:** a live agent cycle, the real BUY prompt end to end, and a real `open_position_contexts` write
containing a `version: 2` snapshot.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | One rule line per axis with a boundary | ✅ | `ruleVersionLines`; tested for ZLE05 (two) and MR (one) |
| FR-02 | Latest boundary by `effectiveDate` within an axis | ✅ | `latestSegment` |
| FR-03 | Buy-axis line labelled entry rules, with label, date, count | ✅ | `Entry rules (...)` |
| FR-04 | Sell-axis line labelled exit rules | ✅ | `Exit rules (...)` |
| FR-05, FR-06 | Counts from `buildSetupTrackRecords` segment `after.n` | ✅ | No new counting logic |
| FR-07 | Entry line before exit line | ✅ | Order asserted by `indexOf` |
| FR-08 | No boundaries → existing fallback line | ✅ | Tested with 3DAY; real EMA_RECLAIM matches |
| FR-09 | One axis only → only that line | ✅ | MR test; sell-only has no real setup and no test |
| FR-10 | Sell boundary not used for entry count | ✅ | Dedicated test; real ZLE05 now 23 entry vs 1 exit |
| FR-11 | Headline line unchanged | ✅ | `trackRecordLines` headline string untouched |
| FR-12 | Per-lesson-string eligibility after setup and sector-RS filters | ✅ | `collectLessons` loop |
| FR-13 | Skip dollar amount | ✅ | `/\$\s?\d/`; tested |
| FR-14 | Skip "win rate" | ✅ | Also matches `win-rate` / `winrate` |
| FR-15 | Skip "profit factor" | ✅ | |
| FR-16 | Skip "supported" | ✅ | |
| FR-17 | Skip "strong" / "strongly" | ✅ | See LOW-1 for "stronger" / "strongest" |
| FR-18 | Skipped text appears nowhere, none rewritten | ✅ | Test asserts absence; real run shows the "17% win rate" lesson gone |
| FR-19 | Next eligible lesson fills the slot, newest first | ✅ | Tested |
| FR-20 | Section and header omitted when none remain | ✅ | Tested |
| FR-21 | `filteredLessonCount` in snapshot | ✅ | |
| FR-22 | Counts only lessons that passed setup + sector-RS checks | ✅ | Two dedicated tests |
| FR-23 | `excludedLessonCount` meaning unchanged | ✅ | |
| FR-24 | Counted even when slots are full | ✅ | `continue` placed after the count; tested |
| FR-25 | `version: 2` | ✅ | Literal type and value |
| FR-26 | No dollar amount in the whole text | ✅ | Tested; 0 hits in real blocks for 5 setups |
| FR-27 | No "supported" / "strong" / "win rate" outside the headline | ✅ | Tested; real blocks show only the headline |
| FR-28 | Order, caps, truncation order, footer unchanged | ✅ | Existing cap/footer tests pass untouched |
| NFR-01 | <300 lines, functions <50 | ✅ | 238 lines; longest function `buildSetupLearningBlock` ~33 |
| NFR-02 | Pure: no I/O, logging, clock, mutation | ✅ | grep finds no `Date.now`, `new Date()` or `console.`; purity test passes; `latestSegment` sorts a filtered copy |
| NFR-03 | Deterministic | ✅ | Existing test |
| NFR-04 | ≥80% coverage | ✅ | 97.7% lines |
| NFR-05 | tsc / suite / build | ✅ | |
| NFR-06 | Patterns as named constants | ✅ | `STATISTIC_LESSON_PATTERNS` |
| C-01 | No Protected Zone change | ✅ | See audit |
| C-02 | Listed files unmodified | ✅ | `git status`: only `learning-context.ts` and its test |
| C-03 | No system-prompt change | ✅ | |
| C-04 | No dependency / migration / dashboard / workflow | ✅ | |
| C-05 | Block still informs only | ✅ | Footer and gating logic untouched |
| C-06 | `specs/setup-aware-learning-context/` unmodified | ✅ | Not in `git status` |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | Assigns the snapshot opaquely; compiles with the new field |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `claude-agent.ts` not touched; decision schema and prompt text unchanged; footer intact |
| Supabase patterns | ✅ | N/A — no query added or changed |
| TypeScript quality | ✅ | No `any`; no mutation; named constants; the `RULE_VERSION_BOUNDARIES` import was removed and ESLint reports no unused import |
| Security | ✅ | No secrets, no logging. `.tmp/` script reads `.env.local`, prints no values, is gitignored |

## Task Checklist

- Implementation tasks: 22/22 completed
- Pre-implementation: 4/4 checked
- Post-implementation: 3 items, covered by this review (see tasks.md)

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **The filter drops a large share of real lessons.** On the 117 real trades, `filteredLessonCount` for the
   stand-in candidates was 19 (MEAN_REVERSION), 13 (TREND_ZLE05), 6 (TREND_PULLBACK) and 1 (EMA_RECLAIM). Every
   block still showed 2 clean lessons, so nothing is empty today, but the pool the model sees is the newest few
   clean lessons rather than the newest few lessons. This matches the spec, which accepted the blunt filter
   (Risks section). If lessons start disappearing for setups with fewer trades, narrow the "strong" pattern or
   extend the cap, after looking at `filteredLessonCount` in the first live snapshots.

### LOW (optional)
1. The patterns are exact words: "stronger", "strongest" and "strength" pass through, as do "11 dollars" and
   "USD 11". The spec limited the list to five patterns (Out of Scope, last bullet), so this is by design.
2. `specs/setup-aware-learning-context/` (requirements, design, review) still describe `version: 1` and the old
   single "Current rule version" line. Left alone on purpose (C-06); the docs are now out of date for those two
   details.
3. FR-09's sell-only case has no test and no real setup that exercises it; the code path is symmetric with the
   buy-only case that is tested.
4. Already-stored snapshots (if any) are `version: 1` and lack `filteredLessonCount`. Nothing reads them today
   (grep: only `learning-context.ts`, `learning.ts`, `claude-agent.ts` and tests reference the type).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.

Recommendation: after deploy, check that the first new `open_position_contexts` row carries
`indicators.learningContext.version === 2` with a numeric `filteredLessonCount`, and decide on MEDIUM-1 from the
observed values.
