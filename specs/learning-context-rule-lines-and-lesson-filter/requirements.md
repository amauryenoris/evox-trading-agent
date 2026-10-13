# Requirements — Learning context: rule-version lines and lesson filter

Follow-up to MEDIUM-1 and MEDIUM-3 of `specs/setup-aware-learning-context/review.md` (code in commit `6286ca7`).
Scope is `src/lib/learning-context.ts` and its test file only. The earlier spec directory is not modified.

## Functional Requirements

### A. Rule-version lines (MEDIUM-1)

FR-01: The system shall render the rule-version information of the track-record section as one line per rule axis that has at least one boundary for the candidate's setup.
FR-02: The system shall use the latest boundary by `effectiveDate` within an axis to define that axis's current rule version.
FR-03: The system shall label the buy-axis line as entry rules, including the boundary label, its effective date and the count of trades bought on or after that date.
FR-04: The system shall label the sell-axis line as exit rules, including the boundary label, its effective date and the count of trades sold on or after that date.
FR-05: The system shall count entry-rule trades using the same segment data as `buildSetupTrackRecords` (`after.n` of the matching buy-axis segment).
FR-06: The system shall count exit-rule trades using the same segment data as `buildSetupTrackRecords` (`after.n` of the matching sell-axis segment).
FR-07: The system shall render the buy-axis line before the sell-axis line when both exist.
FR-08: Where a setup has no boundary on either axis, the system shall render the existing line `Current rule version: n=<baseline n> (no rule changes recorded)`.
FR-09: Where a setup has a boundary on only one axis, the system shall render only that axis's line.
FR-10: The system shall not use a sell-axis boundary to compute the entry-rule count.
FR-11: The system shall keep the track-record headline line (n, win rate, avg, median, worst) unchanged.

### B. Lesson filter (MEDIUM-3)

FR-12: The system shall evaluate each lesson string individually for eligibility, after the same-setup filter and the pre-fix sector-RS exclusion.
FR-13: The system shall skip a lesson that contains a dollar amount (a `$` followed by a digit).
FR-14: The system shall skip a lesson that contains the phrase "win rate" (case-insensitive).
FR-15: The system shall skip a lesson that contains the phrase "profit factor" (case-insensitive).
FR-16: The system shall skip a lesson that contains the word "supported" (case-insensitive).
FR-17: The system shall skip a lesson that contains the word "strong" or "strongly" (case-insensitive).
FR-18: The system shall show a skipped lesson's text nowhere in the block, rewriting or truncating none of it.
FR-19: The system shall fill the lesson slots (maximum `MAX_LESSONS`) with the next eligible lessons, newest trade first, when a lesson is skipped.
FR-20: The system shall omit the lessons section, header included, when no eligible lesson remains.
FR-21: The system shall record the number of lessons skipped by this filter in the snapshot as `filteredLessonCount`.
FR-22: The system shall count in `filteredLessonCount` only lessons that passed the same-setup and sector-RS checks and failed the content filter.
FR-23: The system shall leave `excludedLessonCount` with its current meaning (trades excluded by the sector-RS cutoff).
FR-24: The system shall count a lesson in `filteredLessonCount` regardless of whether the lesson slots are already full.
FR-25: The system shall set the snapshot `version` to 2.

### C. Guarantees on the full text

FR-26: The system shall produce a block whose complete text, lessons included, contains no dollar amount.
FR-27: The system shall produce a block whose complete text contains neither "supported" nor "strong" nor "win rate" outside the generated track-record headline (`win rate <n>%`).
FR-28: The system shall keep section order, caps (40 lines, 3000 characters), the truncation order (lessons first) and the footer as they are.

## Non-Functional Requirements

NFR-01: `learning-context.ts` shall stay under 300 lines and every function under 50 lines.
NFR-02: The module shall remain pure: no I/O, no logging, no clock, no input mutation.
NFR-03: Output shall be deterministic for identical input.
NFR-04: New and changed code shall have at least 80% line coverage.
NFR-05: `npx tsc --noEmit`, the full Vitest suite and `npm run build` shall pass.
NFR-06: The filter patterns shall be named constants, not inline literals.

## Constraints

C-01: No Protected Zone file shall be modified (`learning.ts` and `claude-agent.ts` included).
C-02: `pattern-stats.ts`, `pattern-schema.ts`, `pattern-labels.ts`, `trade-views.ts`, `state-fingerprint.ts`, `types.ts`, `db.ts` shall not be modified.
C-03: No system-prompt text shall change (MEDIUM-2 stays out of scope).
C-04: No new dependency, migration, dashboard or workflow change.
C-05: The learning block shall continue to inform only; no gate, sizing, risk or exit logic shall change.
C-06: `specs/setup-aware-learning-context/` shall not be modified.

## Out of Scope

- MEDIUM-2 (stale SYSTEM_PROMPT sentence about gate-importance context).
- Retiring `pattern_library`, `getRelevantPatterns`, `matchesConditions`, `gate-importance.ts`.
- Rewriting how lessons are generated or stored (post-mortem prompt, `lessons_learned` column).
- Back-filling or editing `learningContext` snapshots already stored with `version: 1`.
- The LOW findings of the earlier review (`bySellDesc` NaN, string timestamp comparison in `pattern-stats.ts`).
- Semantic detection of statistics in lessons beyond the five patterns in FR-13 to FR-17.
