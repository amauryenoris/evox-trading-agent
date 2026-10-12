# Requirements — Setup-aware learning context for the BUY prompt + persisted decision snapshot

## Context

`buildLearningContext()` (`learning.ts`) feeds the BUY prompt once per candidate (`claude-agent.ts:2119`). Today
it injects pattern_library rows, the last 5 closed trades unfiltered by setup/symbol, a `DIMENSION_IMPORTANCE`
fingerprint comparison, and general lessons from the last 200 trades. Consequences: lessons from other setups
reach every candidate, n=1-4 pattern rows are shown as if meaningful, Claude never sees the real track record of
the candidate's setup, and lessons written when sector relative strength was computed from stale bars (before
commit `c18a449`, 2026-10-05) are still shown. `patternIdsUsed` is always `[]`, so there is no record of what
Claude was shown when it approved a BUY.

This change replaces the injected block with a setup-scoped, evidence-labelled block built from the approved
`pattern-stats` / `pattern-schema` / `pattern-labels` / `trade-views` modules, and persists a snapshot of the
exact block with each opened position.

## Functional Requirements

### Module `learning-context.ts` — block content

FR-01: The system shall expose a pure function `buildSetupLearningBlock({ setup, symbol, indicators, asOf, trades })` returning `{ text, snapshot }`.

FR-02: The system shall derive every time-dependent value from the `asOf` argument and shall not read the system clock.

FR-03: The system shall not perform I/O, write logs, or mutate its arguments inside `buildSetupLearningBlock`.

FR-04: The system shall render the block sections in this order: setup track record, matching conditions, same-symbol history, lessons, footer.

FR-05: The system shall render in the track-record section, for the candidate's setup: closed-trade count, win rate, average pnl %, median pnl %, and worst pnl %.

FR-06: The system shall render in the track-record section the number of closed trades in the setup's current rule version.

FR-07: The system shall express every metric in the block as a percentage or a trade count.

FR-08: The system shall not generate a dollar figure or a profit-factor figure in the block (lesson text is quoted verbatim from earlier model output and is not rewritten).

FR-09: If the candidate's setup has no closed trades, the system shall render one line stating that, in place of the track-record, matching-conditions and lessons sections.

### Matching conditions

FR-10: The system shall compute the candidate's bucket for each dimension of the setup's schema using the same bucket functions that `pattern-stats` applies to closed trades.

FR-11: The system shall render a matching-conditions line for a dimension only if the dimension is not diagnostic.

FR-12: The system shall render a matching-conditions line for a dimension only if the dimension is viable.

FR-13: The system shall render a matching-conditions line for a dimension only if the candidate's bucket resolved to a value.

FR-14: The system shall render a matching-conditions line for a dimension only if the candidate's bucket has at least `MIN_BUCKET_N` closed trades.

FR-15: The system shall include in each matching-conditions line the bucket name, the bucket's trade count, its average pnl %, its shrunk average pnl %, its label wording, and the setup baseline average pnl %.

FR-16: The system shall translate bucket labels to exactly: `INSUFFICIENT` → "too few trades", `INCONCLUSIVE` → "inconclusive", `DIFFERS_POS` → "differs (+)", `DIFFERS_NEG` → "differs (-)".

FR-17: The system shall mark each line of an exploratory dimension with the word "exploratory".

FR-18: The system shall not generate the words "supported" or "strong" in the block, in any letter case (lesson text is quoted verbatim and is not rewritten).

### Same-symbol history

FR-19: The system shall render the three most recent closed trades of the candidate's symbol, of any setup, newest sell first.

FR-20: The system shall include in each same-symbol line the date, the setup, the pnl %, and the holding days.

FR-21: If the symbol has no closed trades, the system shall omit the same-symbol section.

### Lessons

FR-22: The system shall render at most two lessons.

FR-23: The system shall take lessons only from closed trades whose setup equals the candidate's setup, of any symbol.

FR-24: The system shall order lesson-source trades by sell time, newest first.

FR-25: The system shall tag each lesson with "(SYMBOL SETUP date pnl%)".

FR-26: The system shall exclude lessons from any trade whose buy time is before `SECTOR_RS_RELIABLE_FROM` and whose recorded buy indicators contain sector-rotation data.

FR-27: The system shall compare buy times to `SECTOR_RS_RELIABLE_FROM` as instants, not as strings.

FR-28: The system shall preface the lessons with the header "Lessons from single trades; hypotheses that may be wrong".

FR-29: If no lesson qualifies, the system shall omit the lessons section, including its header.

### Footer, caps, snapshot

FR-30: The system shall end the block with the line "This block informs; it never gates entries."

FR-31: The system shall keep the block at or under 40 lines.

FR-32: The system shall keep the block at or under 3000 characters.

FR-33: If the block exceeds a cap, the system shall remove lessons before removing any other section content.

FR-34: The system shall return a snapshot with `version` (1), `setup`, `asOf`, `text`, `baseline`, `bucketsShown`, `lessonsShown`, and `excludedLessonCount`.

FR-35: The system shall set `snapshot.text` equal to the returned `text`.

FR-36: The system shall list in `bucketsShown` exactly the buckets rendered as matching-conditions lines, as `{ dimension, bucket, n }`.

FR-37: The system shall list in `lessonsShown` exactly the lessons rendered, as `{ tradeId, symbol, setup }`.

FR-38: The system shall set `excludedLessonCount` to the number of same-setup closed trades that have lessons and were excluded under FR-26.

FR-39: The system shall expose a function that maps a snapshot to the strings "{setup}|{dimension}|{bucket}", one per entry of `bucketsShown`.

### `pattern-stats.ts` additive helper

FR-40: The system shall expose one new exported function from `pattern-stats.ts` that returns a trade's bucket value for a named dimension.

FR-41: The system shall leave every existing export of `pattern-stats.ts` unchanged in name, signature and behavior.

### `learning.ts` wrapper

FR-42: The system shall make `buildLearningContext` accept the candidate's setup, symbol, indicators and `asOf`, and return `{ text, snapshot }`.

FR-43: The system shall load closed trades inside `buildLearningContext` through the existing `getTradeEvaluations` function only.

FR-44: The system shall request a trade limit that covers all closed trades up to the data-access row cap.

FR-45: The system shall delegate block construction in `buildLearningContext` to `buildSetupLearningBlock`.

FR-46: The system shall not include pattern_library patterns in the BUY prompt.

FR-47: The system shall not include unfiltered recent-trade lessons in the BUY prompt.

FR-48: The system shall not include general lessons in the BUY prompt.

FR-49: The system shall not include the `DIMENSION_IMPORTANCE` fingerprint comparison in the BUY prompt.

FR-50: The system shall leave `updatePatternLibrary()` and its writes to `pattern_library` unchanged.

FR-51: If `getTradeEvaluations` fails, the system shall propagate the error as it does today.

### `claude-agent.ts` wiring

FR-52: The system shall call `buildLearningContext` once per candidate with that candidate's setup, symbol, indicators and the cycle timestamp as `asOf`.

FR-53: The system shall pass `snapshot`-derived `text` to the prompt builder in the position where the old string was passed.

FR-54: The system shall carry the snapshot of each candidate through the buy queue to the ranking-winner save site.

FR-55: The system shall persist the snapshot under the key `learningContext` inside the `indicators` of `saveOpenPositionContext` at the direct-BUY site.

FR-56: The system shall persist the snapshot under the key `learningContext` inside the `indicators` of `saveOpenPositionContext` at the ranking-winner site.

FR-57: The system shall set `patternIdsUsed` at both candidate-driven sites to the strings produced by FR-39.

FR-58: The system shall leave the orphaned-position reconcile save site unchanged.

## Non-Functional Requirements

NFR-01: `learning-context.ts` shall be under 300 lines and each function under 50 lines.

NFR-02: The new code shall use no `any` casts and shall not introduce a new dependency.

NFR-03: `buildSetupLearningBlock` shall be deterministic: identical inputs produce identical output.

NFR-04: New code shall reach at least 80% line coverage.

NFR-05: `npx tsc --noEmit` shall report zero errors.

NFR-06: The full Vitest suite shall pass.

NFR-07: `npm run build` shall succeed.

NFR-08: The block shall add no database read beyond the single `getTradeEvaluations` call per `buildLearningContext` call.

## Constraints

C-01: Only `src/lib/learning.ts` and `src/lib/claude-agent.ts` of the Protected Zone may be modified, and only for the wiring in FR-42 to FR-58.

C-02: The change shall not modify system prompt text other than the learning block.

C-03: The change shall not modify the decision schema, setup gates, sizing, risk, exits, or order logic.

C-04: The change shall not modify `db.ts`, `types.ts`, `trade-views.ts`, `state-fingerprint.ts`, `pattern-schema.ts`, `pattern-labels.ts`, migrations, the dashboard, workflows, or `package.json`.

C-05: Claude's output schema and the rule that Claude never decides the action shall remain unchanged.

## Out of Scope

- Retiring `pattern_library`, `getRelevantPatterns`, or `PatternLibraryCard` (a later change; the weekly PDF still reads that table).
- Changing the `buildEnrichedPrompt` template or the system prompt.
- Computing the learning block once per cycle or caching trades across candidates.
- Changing how `pattern-stats` compares timestamps (see design.md, Notes).
- Showing the persisted snapshot in the dashboard.
- Running a live agent cycle (needs Alpaca, Claude and market hours).
