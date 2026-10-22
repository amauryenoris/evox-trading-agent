# Review Report — BUY Prompt Block: Lesson Selection, Hard-Rule Filter, Exploratory Buckets, Stale Prompt Sentence

**Date**: 2026-10-22
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS (no CRITICAL or HIGH findings; 1 MEDIUM, 3 LOW)

Evidence: `tsc --noEmit` clean · full Vitest suite 855/855 · `npm run build` green · `learning-context.ts` 98.2% lines / 90.9% branches (the 2 uncovered lines predate this change) · golden text captured from the OLD code before any edit and reproduced with the switches at 3 / false / true · read-only replay of the saved BUY snapshots (13 of 15 replayable; IREN and TSLA have no stored indicators any more). No live cycle was run.

Replay result (13 snapshots, `.tmp/les-replay.ts`): two lessons from two distinct trades in 13/13; fewer than 2 lessons in 0; `[exploratory]` text lines 0 (hidden lines were `macd_bucket`, `reentry_bucket`, `atr_bucket`, `ema50_extension_bucket`, `drop3d_bucket`); the MP 2026-10-20 block went from `UUUU + UUUU` (including "Never execute … ADX exceeds 30") to `UUUU + CRWV` without that lesson.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | At most `LESSONS_PER_TRADE` per trade | ✅ | `takenFromTrade` cap; tested with 1 and 3 |
| FR-02 | Same-setup trades newest first | ✅ | `bySellDesc`, existing |
| FR-03 | Pre-cutoff sector exclusion kept | ✅ | existing tests pass unchanged |
| FR-04 | Never a lesson from another setup | ✅ | existing test passes |
| FR-05 | Stored order | ✅ | "takes the first eligible lesson in stored order" |
| FR-06 | Skip a trade without eligible lessons | ✅ | tested |
| FR-07 | Stop at `MAX_LESSONS` | ✅ | tested |
| FR-08 | Distinct trades when per-trade = 1 | ✅ | tested, and in the replay |
| FR-09 | Same lesson line format | ✅ | golden text identical |
| FR-10 | Header and footer unchanged | ✅ | asserted |
| FR-11 | Omit section when none | ✅ | existing test passes |
| FR-12 | Per-trade 3 selects as today | ✅ | golden regression, 3 cases |
| FR-13 | "strong/strongly" not dropped | ✅ | tested with real lessons |
| FR-14 | Dollar amounts still dropped | ✅ | existing parametrized test |
| FR-15 | "win rate" still dropped | ✅ | |
| FR-16 | "profit factor" still dropped | ✅ | |
| FR-17 | "supported" still dropped | ✅ | |
| FR-18 | `filteredLessonCount` for statistics drops | ✅ | |
| FR-19 | Not counted for excluded or other-setup lessons | ✅ | existing tests (rewritten to use a dollar figure) |
| FR-20 | Hard-rule patterns exported as a named constant | ✅ | `HARD_RULE_LESSON_PATTERNS` |
| FR-21 | Exported pure `isHardRuleLesson` | ✅ | |
| FR-22 | True for prohibition or veto wording | ⚠️ | True for the approved patterns; the plural "hard filters" is not matched (MEDIUM-1) |
| FR-23 | False inside a negation | ✅ | "not a hard gate", "not a veto", "should not be used as a disqualifying signal" tested |
| FR-24 | True for imperative phrases after a negation word | ✅ | "It is not wise: never enter…" tested |
| FR-25 | Drop when enabled | ✅ | |
| FR-26 | Keep when disabled | ✅ | |
| FR-27 | Applied only after the statistics filter | ✅ | order in `collectLessons`; no double count tested |
| FR-28 | Count in `hardRuleLessonsFiltered` | ✅ | also after the slots are full |
| FR-29 | 0 when disabled | ✅ | |
| FR-30 | No exploratory lines when hidden | ✅ | |
| FR-31 | Shown after confirmatory, tagged, when enabled | ✅ | existing test, now with `options` |
| FR-32 | `bucketsShown` = lines in the text | ✅ | |
| FR-33 | `buildPatternIds` from `bucketsShown` only | ✅ | |
| FR-34 | `exploratoryHidden` count | ✅ | equals the difference between the two settings |
| FR-35 | Caps work on remaining lines | ✅ | cap test reworked to two long lessons so it still exercises the cap |
| FR-36 | Stats modules, schema, dashboard untouched | ✅ | not in the diff |
| FR-37 | `version: 3` | ✅ | |
| FR-38 | Version-2 fields keep their meaning | ✅ | |
| FR-39 | New snapshot fields | ✅ | exact key-set test |
| FR-40 | `buildPatternIds` accepts v2 and v3 | ✅ | tested with a stored v2 object |
| FR-41 | Persistence path in `claude-agent.ts` unchanged | ✅ | diff is one prompt line |
| FR-42 | Replace the "DIFFERENT signal_type" bullet with the approved sentence | ✅ | verbatim |
| FR-43 | Nothing else in the prompt changes | ✅ | `claude-agent.ts` diff: 1 line removed, 1 added |
| FR-44 | No "gate-importance" in the prompt text | ✅ | only a code comment at `:80` remains |
| FR-45 | Stop if the bullet is not found | ➖ | the bullet was found; the guard was not exercised |
| FR-46 | Constants exported from one place at the top | ✅ | |
| FR-47 | Values 1, true, false | ✅ | asserted |
| FR-48 | Pre-change text with 3 / false / true for inputs without "strong" | ✅ | golden regression |

NFR-01 ✅ · NFR-02 ✅ (98% module; filter function fully covered) · NFR-03 ✅ (largest function 38 lines) · NFR-04 ✅ · NFR-05 ✅ (no dependency, no query added).

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized and listed in design.md: **one** SYSTEM_PROMPT bullet (1 line replaced). Nothing else in the file changed |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | still type-compiles against the v3 snapshot |

`pattern-stats.ts`, `pattern-schema.ts`, the dashboard, `db.ts` and `types.ts` are untouched.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | The prompt sentence now says lessons "never approve or block the trade"; output schema and the forced `HOLD` are untouched; no new language letting Claude approve or reject trades |
| Supabase patterns | ✅ | N/A — no database code; snapshot is JSON in existing columns |
| TypeScript quality | ✅ | No `any`; immutable pure helpers; constants and patterns named; functions 3–38 lines; file 315 lines |
| Security | ✅ | No secrets; no logging added |

## Task Checklist

- Implementation tasks T-01…T-25: 25/25 completed
- Post-Implementation: this review and the Protected Zone confirmation, ticked by this report

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **The approved strong-tier patterns miss plural forms.** `hard[- ](filter|veto|gate|…)\b` does not match "hard filters". One of the 381 stored lessons (CVX "…should be treated as hard filters against new long entries…") therefore still reaches the block; it appeared in 2 of the 13 replayed snapshots (OXY and EWZ on 2026-10-21). This follows the "exactly as measured" instruction, but it leaves a hard-rule sentence in the text. A one-line fix accepts plurals (`filters?|vetoes|gates?|blocks?|stops?|rules?|passes`); a scan of all stored lessons found no other plural miss.

### LOW (optional)
1. The `n't` alternative of the negation guard cannot match (the word boundary fails after a letter, as in "isn't"); behavior is identical to the measured STEP 0 script, so it was kept as is.
2. Two of the 15 saved snapshots (IREN, TSLA) could not be replayed because their indicators are no longer stored.
3. `hardRuleLessonsFiltered` counts across every eligible trade on each build (20–23 for MR), so it measures corpus size more than per-entry effect; this follows the approved counting rule (O-4).

---

## Decision

**APPROVED WITH WARNINGS** — one MEDIUM finding (a plural form the approved patterns miss). No CRITICAL or HIGH findings. Ready to commit; apply the plural fix first if the "no hard-rule wording" check on the first live day must be strict. Nothing has been committed.
