# Design — Learning context: rule-version lines and lesson filter

## Architecture Decision

Both fixes live inside `src/lib/learning-context.ts`, the pure module from commit `6286ca7`. No caller changes:
`learning.ts` and `claude-agent.ts` pass the same input and still receive `{ text, snapshot }`. The rule-version
change replaces `ruleVersionText` with a per-axis renderer over `record.ruleVersions`, which already carries
`appliesTo` and `after.n` per boundary. The lesson change adds a content predicate inside `collectLessons`, applied
per lesson string after the existing same-setup and pre-fix sector-RS checks.

## Findings Being Fixed

- **MEDIUM-1.** `ruleVersionText` sorts `RULE_VERSION_BOUNDARIES[setup]` by date and takes the first. For
  TREND_ZLE05 that is the sell-side "new exit rules trial" (2026-10-05), whose `after.n` counts trades *sold* since
  then (1), while 27 trades were *bought* under the current entry rules (boundary 2026-06-04). Claude can read `n=1`
  as a tiny sample.
- **MEDIUM-3.** `collectLessons` copies `lessonsLearned` strings verbatim. Real output contained `$11.16`,
  "strong sector tailwinds" and "17% win rate" (a stale `pattern_library` figure). The spec forbade the module from
  *generating* such text, but lessons bypass that guarantee.

## Data Flow

1. `buildSetupLearningBlock` → `buildSetupTrackRecords` (unchanged) → `record.ruleVersions`.
2. `ruleVersionLines(record, setup)`: group segments by `appliesTo`; per axis pick the latest `effectiveDate`;
   emit entry line, then exit line; fall back to the "no rule changes recorded" line when there are none.
3. `collectLessons(setupTrades)`: sort by sell date desc → drop pre-fix sector trades (`excludedLessonCount`) →
   flatten to lesson strings → partition by `isCleanLesson` → count rejects (`filteredLessonCount`) → take the first
   `MAX_LESSONS` clean ones.
4. Render, caps and snapshot assembly as before; snapshot gains `filteredLessonCount`, `version` becomes 2.

## Rendered Examples (TREND_ZLE05)

Before:
`Current rule version (new exit rules trial, since 2026-10-05): n=1`

After:
```
Entry rules (adaptive ADX gate stabilized, since 2026-06-04): n=27 bought under them
Exit rules (new exit rules trial, since 2026-10-05): n=1 sold under them
```
One-axis setup (MEAN_REVERSION): only the `Entry rules (...)` line. Setup with no boundaries (3DAY, EMA_RECLAIM):
the existing `Current rule version: n=<n> (no rule changes recorded)` line.

## Lesson Filter Patterns

| Rule | Pattern (case-insensitive) | Rejects |
|------|----------------------------|---------|
| Dollar amount | `/\$\s?\d/` | "lost $11.16 on the stop" |
| Win rate | `/\bwin[- ]?rate\b/` | "17% win rate for this pattern" |
| Profit factor | `/\bprofit[- ]factor\b/` | "profit factor 1.4" |
| Supported | `/\bsupported\b/` | "signal supported by volume" |
| Strong | `/\bstrong(ly)?\b/` | "strong sector tailwinds" |

Skip-whole-lesson, never rewrite: editing a lesson changes its meaning and the snapshot would no longer match what
the model saw.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Rule line: show both axes (entry + exit) | Honest on both; no information lost | Block grows by 1 line for ZLE05 | Chosen |
| Rule line: buy-axis boundary only | Simplest | Hides that exit rules changed on 2026-10-05, which is why ZLE05 results are in a trial | Rejected |
| Rule line: keep latest-by-date, add a caveat | No logic change | Number stays misleading | Rejected |
| Lessons: skip the whole lesson on a match | Preserves meaning; snapshot equals what Claude saw | Loses some useful lessons | Chosen |
| Lessons: strip the offending phrase/sentence | Keeps more lessons | Alters meaning, brittle | Rejected |
| Lessons: sanitize numbers generally (any `%`) | Stronger guard | Removes most lessons; `%` is legitimate in price-level lessons | Rejected |
| Lessons: leave as is (accept) | Zero work | Re-injects non-validated statistics | Rejected |
| Count rejects in `excludedLessonCount` | No schema change | Mixes two reasons (data corruption vs. content) | Rejected |
| Add `filteredLessonCount`, `version: 2` | Separate meaning, auditable | Shape change; old rows stay at v1 | Chosen |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/learning-context.ts | MODIFY | Replace `ruleVersionText` with `ruleVersionLines`; add `isCleanLesson` + named patterns; `filteredLessonCount`; `version: 2`. Stays under 300 lines (currently 210) |
| src/lib/__tests__/learning-context.test.ts | MODIFY | Update the rule-version and snapshot-shape assertions; add new cases |

No other file changes. Verified by grep: `LearningSnapshot` / `learningContext` are referenced only by
`learning-context.ts`, `learning.ts` and `claude-agent.ts`; no dashboard code reads the snapshot. `claude-agent.ts`
assigns the snapshot opaquely, so the new field needs no edit there.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `learning.ts` and `claude-agent.ts` are not touched.

## Database Changes

None. The new field is stored inside the existing `indicators` JSONB under `learningContext` for new positions only.

## Risks

- The word filter is intentionally blunt: a harmless lesson containing "strong" is dropped. Mitigation: lessons are
  capped at 2 and `filteredLessonCount` makes the loss visible.
- Fewer lessons will reach the prompt; sections are omitted when none remain, which the footer/caps already handle.
- `version: 2` snapshots coexist with stored `version: 1` rows; nothing reads them today.

## Open Questions

1. The original request text referenced "the full prompt" with detailed requirements for this follow-up; only the
   pointer to MEDIUM-1 and MEDIUM-3 arrived. Requirements here are derived from the review's suggested options.
   Confirm or correct the choices in the Alternatives table.
2. Wording of the two lines ("Entry rules … bought under them" / "Exit rules … sold under them"): acceptable, or
   different text wanted?
3. Should the filter list in FR-13 to FR-17 be extended (for example any `\d+%\s*(win|success)` pattern) or is the
   five-pattern list enough?
4. Bump to `version: 2` (recommended) or keep `version: 1` and add the field additively?
