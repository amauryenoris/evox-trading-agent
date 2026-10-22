# Tasks — BUY Prompt Block: Lesson Selection, Hard-Rule Filter, Exploratory Buckets, Stale Prompt Sentence

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone change confirmed: `src/lib/claude-agent.ts` (single SYSTEM_PROMPT bullet at `:127`)
- [x] O-1 to O-6 answered (extra statistics patterns, rollback wording, `options` argument, counting rules, `exploratoryHidden`, snapshot types)
- [x] Database migrations drafted (N/A — none)

## Implementation Checklist

### Phase 1 — Baseline and fixtures (before any code change)
- [x] T-01: Run the existing `learning-context.test.ts` and record that it is green.
- [x] T-02: Create a fixtures file with real lesson texts from STEP 0 (the UUUU "Never execute a mean-reversion trade when ADX exceeds 30", "treat that as a veto condition", "must be treated as a hard filter", "Avoid trend-continuation entries when…", "Sector underperformance … is a soft caution flag rather than a hard gate … should not be blocked solely by sector filters", "strong downtrend" lessons, plus clean lessons).
- [x] T-03: Capture today's block text for a few real-shaped inputs (golden text) to use in the switch-off regression test; inputs avoid "strong/strongly" lessons (O-2).

### Phase 2 — Tests first (RED), `learning-context.test.ts`
- [x] T-04: Selection: three lessons per trade never give two lessons from one trade; distinct trades required; a trade without eligible lessons is skipped; stored order; stops at `MAX_LESSONS`; blocks with 1 and with 0 lessons render correctly; header and footer unchanged.
- [x] T-05: Statistics filter: "strong downtrend" and "moved strongly higher" pass; dollar amount, win rate, profit factor, supported still dropped; `filteredLessonCount` meaning unchanged (not counted for excluded or other-setup trades).
- [x] T-06: `isHardRuleLesson`: true for the four real samples; false for "not a hard gate" and "should not be blocked"; true for "Never enter…" even after a negation word; `hardRuleLessonsFiltered` counts only lessons that passed the statistics filter; 0 when disabled.
- [x] T-07: Exploratory switch: hidden → no `[exploratory]` text, `bucketsShown` and `buildPatternIds` contain only confirmatory buckets, `exploratoryHidden` counts the removed lines; shown → today's order and tags; caps still work.
- [x] T-08: Snapshot: version 3, new fields, all version-2 fields intact; `buildPatternIds` works for a version-2 and a version-3 snapshot.
- [x] T-09: Regression: with `lessonsPerTrade: 3`, `hardRuleFilterEnabled: false`, `showExploratoryBuckets: true` the text equals the golden text from T-03.
- [x] T-10: Update the existing tests that encode the old behavior (list in design.md).

### Phase 3 — Implementation (not Protected Zone)
- [x] T-11: `learning-context.ts`: export the three constants at the top and the optional `options` argument.
- [x] T-12: Remove the "strong/strongly" pattern from the statistics filter.
- [x] T-13: Add the exported hard-rule pattern constant and `isHardRuleLesson` (normative definition in design.md).
- [x] T-14: Rework `collectLessons` (per-trade cap, both filters, counters).
- [x] T-15: Exploratory switch and `exploratoryHidden`; derive `bucketsShown` from rendered lines.
- [x] T-16: Snapshot version 3, new fields, exported union type for stored snapshots; `buildPatternIds` accepts both.
- [x] T-17: Confirm `learning.ts` and `claude-agent.ts` need no other change (consumers compile).

### Phase 4 — SYSTEM_PROMPT (⚠️ Protected Zone — only after confirmation)
- [x] T-18: Confirm the bullet at `claude-agent.ts:127` is found verbatim; if not, STOP and report what is there.
- [x] T-19: Replace that bullet with the approved sentence; change nothing else in the prompt; confirm no "gate-importance" remains in the prompt text.

### Phase 5 — Verification
- [x] T-20: `npx tsc --noEmit` clean.
- [x] T-21: `npx vitest run` — full suite green.
- [x] T-22: Coverage ≥ 80% on new code; 100% lines on the filter function.
- [x] T-23: `npm run build` green.
- [x] T-24: Read-only replay (script in `.tmp/`, SELECT-only): run the real closed trades through the new selection and print, for the last 15 saved BUY snapshots, the lesson trade ids, texts truncated to 100 characters, and the hidden lines.
- [x] T-25: Show `git diff`; final report states that no live cycle was run, and what to watch on the first live day: two different trade ids per snapshot (or one when only one qualifies); no veto or hard-filter wording; no `[exploratory]` text lines; about 15% of BUYs with fewer than 2 lessons, concentrated in 3DAY and EMA_RECLAIM; no reasoning that cites reentry, ATR or MACD buckets; no reference to "gate-importance".

## Post-Implementation

- [x] Run `/review lessons-block-selection-fix` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except the single `claude-agent.ts` sentence

## Estimated Complexity

**Medium** — one pure module and its tests, but the selection, two filters, a visibility switch and a snapshot version all interact, and about six existing tests encode the old behavior and must be reworked deliberately. The Protected Zone part is one sentence.
