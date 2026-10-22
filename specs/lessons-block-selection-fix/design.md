# Design — BUY Prompt Block: Lesson Selection, Hard-Rule Filter, Exploratory Buckets, Stale Prompt Sentence

## Architecture Decision

All behavior changes live in `src/lib/learning-context.ts`, the pure builder of the BUY learning block: three exported switch constants, a reworked `collectLessons` (per-trade cap, statistics filter without "strong", hard-rule filter), a bucket-line filter in `buildSetupLearningBlock`, and a version-3 snapshot with two new counters. `learning.ts` and `claude-agent.ts` only call `buildSetupLearningBlock` and store its snapshot, so they do not change, except one sentence of `SYSTEM_PROMPT` in `claude-agent.ts` (the only Protected Zone edit). To let tests exercise both settings of each switch without module mocking, the builder takes an optional `options` object whose defaults are the exported constants (see O-3).

## Verified Facts (from the code, nothing assumed)

| Item | Where | Fact |
|------|-------|------|
| Selection | `learning-context.ts:165-185` | loops over every lesson of the newest trades until `MAX_LESSONS`; a trade has 3 lessons, so one trade fills both slots |
| Statistics filter | `:24-30` | five patterns today: `$ digit`, `win rate`, `profit factor`, `supported`, `strong/strongly` |
| Exploratory lines | `:129-150` | `matchLineFor` tags `[exploratory]`; `matchingConditions` appends exploratory after confirmatory; caps drop lines from the end (`:216-220`) |
| Snapshot | `:53-63, :222-232` | `version: 2` literal; `bucketsShown` = rendered match lines; `buildPatternIds` derives from `bucketsShown` (`:236-238`) |
| Consumers | grep over `src/` | `LearningSnapshot` is used by `learning.ts` (type only), `claude-agent.ts` (stores `indicators.learningContext`, calls `buildPatternIds`) and the tests; **no code reads a stored snapshot back**. `patternIdsUsed` is only persisted (`pattern_ids`), not consumed elsewhere → fail-fast #1 is not triggered |
| SYSTEM_PROMPT bullet | `claude-agent.ts:127` | found verbatim: "- When a cited lesson comes from a DIFFERENT signal_type … use the gate-importance context provided alongside it … rather than treating it as directly binding." → fail-fast #2 is not triggered |
| `gate-importance.ts` | `src/lib/` | exists, but no prompt code feeds it; the only other mention is a code comment at `claude-agent.ts:80` |

## Normative Definition of the Strong-Tier Hard-Rule Filter

Copied from the measured STEP 0 script (`.tmp/les-strong.ts`, 99 of 381 lessons dropped); it is the definition to implement. The strong tier's precision was not audited separately: the 10-lesson sample reviewed in STEP 0 was drawn from the broader tier (about 8 of 10 clearly hard-rule).

Patterns (case-insensitive):
1. `\bhard[- ](filter|veto|gate|block|stop|stops|rule|pass)\b`
2. `\bveto\b`
3. `\bdisqualif\w*`
4. `\bnever\s+(enter|execute|initiate|apply|override|open|take)\b`
5. `\b(do not|don't)\s+(enter|execute|take|open|initiate)\b`
6. `\bavoid\s+(entering|initiating|trend|taking|entries)\b`
7. `\b(must not|should never|must never)\b`
8. `\b(should|must)\s+(be\s+)?(automatically\s+)?(rejected|skipped|disabled|suppressed)\b|\bblocked or deferred\b|\bshould (have been )?blocked\b|\bautomatically (disqualified|rejected)\b`

Negation guard: a match counts unless the 60 characters before it end (within 45 characters of the match, not crossing `.`, `;` or an em dash) with a negation word: `not`, `n't`, `no longer`, `rather than`, `without`, `nor`, `cannot`, `should not`, `does not`, `did not`. **Exemption:** a match that itself starts with `never`, `do not`, `don't`, `must not`, `should never`, `must never` or `avoid` always counts (those are the imperative prohibitions).

Weak-tier words (`block*`, `deferred`, `prerequisite`, `mandatory`, `enforce*`) are **not** part of the filter.

Effect measured on the 381 stored lessons: statistics filter without "strong": 20 dropped (was 63); strong-tier hard-rule: 99 dropped.

## Selection Algorithm

1. Candidate trades = same-setup trades with lessons, newest sell first, minus pre-cutoff sector trades (unchanged).
2. For each trade, walk its lessons in stored order: apply the statistics filter (count drops in `filteredLessonCount`); then, if enabled, the hard-rule filter (count drops in `hardRuleLessonsFiltered`); keep passing lessons until `LESSONS_PER_TRADE` were taken from this trade.
3. Stop adding when `MAX_LESSONS` lessons are collected, but keep counting filtered lessons of the remaining eligible trades, as today.
4. With `LESSONS_PER_TRADE = 1` the collected lessons are necessarily from distinct trades; with 3 the algorithm equals today's.

## Exploratory Buckets

`matchingConditions` still produces all lines. When the switch is false, the builder removes the exploratory ones before rendering, sets `exploratoryHidden` to how many it removed, and computes `bucketsShown` / `buildPatternIds` from what remains (so the snapshot equals what the model saw). Caps are applied afterwards on the remaining lines.

## Data Flow

1. `buildLearningContext` (unchanged) loads up to 1000 trades → `buildSetupLearningBlock({ …, trades })`.
2. Track record, matching conditions (confirmatory only when hidden), same-symbol history, lessons (new selection), footer.
3. Snapshot version 3 → `claude-agent.ts` stores it in `indicators.learningContext` and derives `patternIdsUsed` (unchanged lines).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Optional `options` argument defaulting to the constants | Tests flip each switch without mocking; production unchanged | One optional parameter on `SetupLearningInput` | **Chosen** (O-3) |
| Module mocking or a mutable constant for tests | No signature change | Fragile, hidden global state | Rejected |
| Filter hard-rule language at write time (post-mortem prompt) | Fixes the source | `learning.ts` is out of scope and old lessons remain | Rejected for now |
| Broad hard-rule tier (adds `block*`, `deferred`, `prerequisite`, `mandatory`) | Catches about 18 more lessons | Weak words produce borderline false positives | Rejected (strong tier decided) |
| Keep hiding by cap instead of switch | No new constant | Exploratory lines would still appear when space allows | Rejected |
| Put filter patterns in `config.ts` | Central | Protected Zone, no need | Rejected |

## Existing Tests That Encode the Old Behavior (must change, listed in tasks)

In `learning-context.test.ts`:
- `lesson content filter` cases `'strong sector tailwinds'` and `'it moved strongly higher'` (rejected today) → they must now pass through; the `'strong move'` case in "counts rejects even when the lesson slots are full", the `'strong sector rs'` case (cutoff exclusion) and `'strong other setup'` (other setup) use "strong" only to trigger the filter and need another trigger (a dollar figure).
- "counts rejects even when the lesson slots are already full" expects two lessons from one trade (`['clean one','clean two']`) → expects one now.
- "marks exploratory dimensions and keeps them after confirmatory ones" expects the exploratory line → runs with `showExploratoryBuckets: true`.
- The exact snapshot key-set test (version 2 keys) → version 3 keys.
- Cap test with `[long, long]` in one trade → one lesson now; assertions re-checked.
Other tests (track record, same-symbol history, footer, wording) are unaffected.

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/learning-context.ts | MODIFY | Constants, `isHardRuleLesson` + pattern constant, new selection, statistics filter without "strong", exploratory switch, version-3 snapshot, optional `options` |
| src/lib/__tests__/learning-context.test.ts | MODIFY | Update the cases above; add tests for the new behavior |
| src/lib/__tests__/fixtures/lessons-real-samples.ts (or similar) | CREATE | Real lesson texts from STEP 0 used as inputs |
| src/lib/claude-agent.ts ⚠️ | MODIFY (Protected) | Replace the single SYSTEM_PROMPT bullet at `:127` |

## Protected Zone Impact

- ⚠️ `src/lib/claude-agent.ts` — one SYSTEM_PROMPT bullet only. Requires Amaury confirmation before implementation.
- Not touched: `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`.

## Database Changes

None. The snapshot is JSON inside `trade_evaluations.indicators_at_buy` and `open_position_contexts.indicators`; old version-2 snapshots stay as they are.

## Expected Effect (measured on real data, 100 last BUYs, counterfactual)

With the statistics filter without "strong", the strong-tier filter and one lesson per trade: 85 BUYs keep 2 lessons, 15 end with 1, none with 0. By setup: MEAN_REVERSION 0/41, TREND_PULLBACK 0/5, TREND_ZLE05 0/25 below 2; TREND_PULLBACK_3DAY 14/21 and EMA_RECLAIM 1/4 below 2 (3DAY has only 9 eligible trades outside the pre-cutoff exclusion). This matches the brief's ~15%.

## Open Questions

- **O-1 (extra statistics patterns):** the brief says to "keep the others (… sample size, n=, N trades, pattern library, percentage-of-trades claims)", but the current filter has only four patterns besides "strong" (dollar amounts, win rate, profit factor, supported). Adding the extra ones would change at most 3 of 381 lessons (`sample size` 1 new; the others are already caught). Recommended: keep exactly the four existing patterns and add none. Confirm, or say to add them.
- **O-2 (rollback wording):** with the constants at 3 / false / true the text is restored **except** that "strong/strongly" lessons stay allowed (that is a bug fix, not a switch). Recommended: accept; the regression test uses inputs without those words. Confirm.
- **O-3 (`options` argument):** add an optional `options` object (`lessonsPerTrade`, `hardRuleFilterEnabled`, `showExploratoryBuckets`) to `SetupLearningInput`, defaulting to the constants, so tests can cover both settings. Recommended: yes.
- **O-4 (counts):** `filteredLessonCount` and `hardRuleLessonsFiltered` count filtered lessons across all eligible trades (also after the slots are full), not lessons skipped by the per-trade cap; a lesson dropped by the statistics filter is not counted again by the hard-rule filter. Confirm.
- **O-5 (`exploratoryHidden`):** counts the exploratory match lines produced for this candidate (viable, n ≥ `MIN_BUCKET_N`) that the switch removed, before the caps. Confirm.
- **O-6 (types):** `LearningSnapshot` becomes `version: 3`; export a union type for stored snapshots of version 2 or 3 and make `buildPatternIds` accept it. Confirm.
