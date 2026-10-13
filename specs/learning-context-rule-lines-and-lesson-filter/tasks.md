# Tasks — Learning context: rule-version lines and lesson filter

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open Questions 1-4 in `design.md` answered
- [x] Protected Zone changes confirmed — N/A, none required
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 0 — Read-only pre-checks
- [x] T-01: Grep that `LearningSnapshot`, `learningContext` and `excludedLessonCount` are used only in `learning-context.ts`, `learning.ts`, `claude-agent.ts` (and tests). If a consumer of `version` exists, STOP and report.
- [x] T-02: Print the current rule-version line for each of the 5 setups from real trades (read-only `.tmp/` script, no keys printed) to capture the "before" output.

### Phase 1 — Tests first (RED)
- [x] T-03: TREND_ZLE05 with buy boundary 2026-06-04 and sell boundary 2026-10-05: expect an `Entry rules` line with the buy-axis `after.n` and an `Exit rules` line with the sell-axis `after.n`, entry first (FR-01 to FR-07).
- [x] T-04: Entry count does not change when only a sell-axis trade is added after 2026-10-05 (FR-10).
- [x] T-05: MEAN_REVERSION (buy only) renders one line; 3DAY and EMA_RECLAIM keep `no rule changes recorded` (FR-08, FR-09).
- [x] T-06: Each filter pattern rejects its sample lesson and a clean lesson passes: `$11.16`, `17% win rate`, `profit factor`, `supported`, `strong` / `strongly` (FR-13 to FR-17).
- [x] T-07: A skipped lesson's text is absent from `text` and a later clean lesson takes its slot (FR-18, FR-19).
- [x] T-08: Section omitted, header included, when every lesson is rejected (FR-20).
- [x] T-09: `filteredLessonCount` counts rejects after same-setup and sector-RS checks, even when slots are full; `excludedLessonCount` unchanged (FR-21 to FR-24).
- [x] T-10: Snapshot key set asserted exactly, with `filteredLessonCount`, `version: 2` (FR-25).
- [x] T-11: Whole-text guarantee: no `$<digit>`, no "supported", no "strong" in any rendered block (FR-26, FR-27).
- [x] T-12: Existing cases (caps, truncation order, immutability, determinism) still pass unchanged (FR-28, NFR-03).

### Phase 2 — `learning-context.ts` (GREEN)
- [x] T-13: Add named constants for the five filter patterns (NFR-06) and `isCleanLesson(text)`.
- [x] T-14: Update `collectLessons` to flatten, partition, count rejects, take first `MAX_LESSONS` clean lessons; return `filteredLessonCount`.
- [x] T-15: Replace `ruleVersionText` with `ruleVersionLines` (per-axis, latest boundary per axis, fallback line); update `trackRecordLines`.
- [x] T-16: Add `filteredLessonCount` to `LearningSnapshot`, set `version: 2`, populate it in `buildSetupLearningBlock`.
- [x] T-17: Confirm file under 300 lines and functions under 50 lines; no `any`.

### Phase 3 — Verification
- [x] T-18: `npx tsc --noEmit` clean.
- [x] T-19: Full Vitest run passes; coverage of `learning-context.ts` at least 80%.
- [x] T-20: `npm run build` succeeds.
- [x] T-21: Re-run the T-02 script and show before/after blocks for one real candidate per setup (3DAY via FCX, one MR, one ZLE05); show which real lessons are now filtered. Say what cannot be run (live cycle, real prompt, real DB write).
- [x] T-22: `git diff --stat` shows only `learning-context.ts` and its test file changed.

## Post-Implementation

- [x] Run /review learning-context-rule-lines-and-lesson-filter to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged
- [x] Confirm `specs/setup-aware-learning-context/` unchanged

## Estimated Complexity

Low — two localized changes in one pure module (about +30 lines) with straightforward tests; no caller, schema or
Protected Zone impact.
