# Requirements — BUY Prompt Block: Lesson Selection, Hard-Rule Filter, Exploratory Buckets, Stale Prompt Sentence

## Functional Requirements

### A. Lesson selection (`learning-context.ts`)

FR-01: The system shall take at most `LESSONS_PER_TRADE` lessons from any one closed trade.
FR-02: The system shall iterate the closed trades of the candidate's setup from the newest sell time to the oldest.
FR-03: The system shall keep excluding trades bought before the sector-RS cutoff that carry sector-rotation data.
FR-04: The system shall never show a lesson from a trade of another setup.
FR-05: The system shall take the lessons of a trade in their stored order.
FR-06: The system shall skip a trade that has no eligible lesson.
FR-07: The system shall stop collecting when `MAX_LESSONS` lessons have been collected.
FR-08: The system shall show lessons from distinct trades only when `LESSONS_PER_TRADE` is 1.
FR-09: The system shall render each lesson as `- {text} (SYMBOL SETUP date pnl%)`, as today.
FR-10: The system shall keep the lessons header and the block footer text unchanged.
FR-11: The system shall omit the lessons section, header included, when no lesson qualifies.
FR-12: The system shall select the same lessons as today when `LESSONS_PER_TRADE` is 3.

### B. Statistics filter

FR-13: The system shall not drop a lesson because it contains the word "strong" or "strongly".
FR-14: The system shall keep dropping a lesson that contains a dollar amount.
FR-15: The system shall keep dropping a lesson that contains "win rate".
FR-16: The system shall keep dropping a lesson that contains "profit factor".
FR-17: The system shall keep dropping a lesson that contains "supported".
FR-18: The system shall count the lessons dropped by the statistics filter in `filteredLessonCount`.
FR-19: The system shall not count in `filteredLessonCount` a lesson from an excluded pre-cutoff trade or from another setup.

### C. Hard-rule filter

FR-20: The system shall export the hard-rule patterns as a named constant.
FR-21: The system shall export a pure function `isHardRuleLesson(text)`.
FR-22: The system shall return true from `isHardRuleLesson` for lessons that use prohibition or veto wording.
FR-23: The system shall return false from `isHardRuleLesson` when the matched wording sits inside a negation.
FR-24: The system shall return true from `isHardRuleLesson` for the imperative phrases even when a negation word precedes them.
FR-25: The system shall drop lessons for which `isHardRuleLesson` is true when `HARD_RULE_FILTER_ENABLED` is true.
FR-26: The system shall keep such lessons when `HARD_RULE_FILTER_ENABLED` is false.
FR-27: The system shall apply the hard-rule filter only to lessons that passed the statistics filter.
FR-28: The system shall count the lessons dropped by the hard-rule filter in `hardRuleLessonsFiltered`.
FR-29: The system shall set `hardRuleLessonsFiltered` to 0 when the filter is disabled.

### D. Exploratory buckets

FR-30: The system shall render no exploratory bucket line in the text when `SHOW_EXPLORATORY_BUCKETS` is false.
FR-31: The system shall render exploratory lines after the confirmatory ones, tagged `[exploratory]`, when `SHOW_EXPLORATORY_BUCKETS` is true.
FR-32: The system shall list in `bucketsShown` only the bucket lines present in the text.
FR-33: The system shall derive `buildPatternIds` only from `bucketsShown`.
FR-34: The system shall record in `exploratoryHidden` the number of exploratory bucket lines hidden by the switch.
FR-35: The system shall keep the line and character caps working on the remaining lines.
FR-36: The system shall leave the bucket statistics (`pattern-stats.ts`), the schema and the dashboard unchanged.

### E. Snapshot

FR-37: The system shall emit `version: 3` in new snapshots.
FR-38: The system shall keep every version-2 field with its current meaning.
FR-39: The system shall add `hardRuleLessonsFiltered` and `exploratoryHidden` to the snapshot.
FR-40: The system shall let `buildPatternIds` accept snapshots of version 2 and version 3.
FR-41: The system shall keep the snapshot persistence path in `claude-agent.ts` unchanged.

### F. SYSTEM_PROMPT sentence (`claude-agent.ts`)

FR-42: The system shall replace the bullet that starts "When a cited lesson comes from a DIFFERENT signal_type" with the sentence approved in the brief.
FR-43: The system shall change no other text of the SYSTEM_PROMPT.
FR-44: The system shall leave no reference to "gate-importance" in the SYSTEM_PROMPT text.
FR-45: The system shall stop and report, without editing, if that bullet is not found verbatim at the stated place.

### G. Switches

FR-46: The system shall export `LESSONS_PER_TRADE`, `HARD_RULE_FILTER_ENABLED` and `SHOW_EXPLORATORY_BUCKETS` from one place at the top of `learning-context.ts`.
FR-47: The system shall use the values 1, true and false for those constants.
FR-48: The system shall reproduce the pre-change text for inputs without "strong" or "strongly" lessons when the constants are 3, false and true.

## Non-Functional Requirements

NFR-01: Lesson selection and both filters shall be deterministic for the same trades.
NFR-02: New code shall reach at least 80% coverage; the filter function shall reach 100% of its lines.
NFR-03: Every function added or changed shall be 50 lines or fewer.
NFR-04: `tsc`, the full Vitest suite and `npm run build` shall pass.
NFR-05: The change shall add no dependency and no database query.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. Authorized: the single SYSTEM_PROMPT sentence in `src/lib/claude-agent.ts`.
C-02: No other Protected Zone file shall be touched; `learning.ts` and the post-mortem prompt are out of scope.
C-03: `pattern-stats.ts`, `pattern-schema.ts`, the dashboard and the entry, exit, sizing and stop logic shall not change.
C-04: No migration; the snapshot is a JSON value inside existing columns.
C-05: No live cycle is run during implementation or verification.

## Out of Scope

- The post-mortem prompt that produces exactly 3 lessons per trade.
- Rewriting or deleting stored lessons.
- Any new statistics pattern beyond the existing four (see open question O-1).
- Changing which bucket dimensions are exploratory.
