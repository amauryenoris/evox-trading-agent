# Design — Gate-Aware Relevance Context in RECENT TRADE LESSONS

## Architecture Decision

This feature spans three files across two layers: the Supabase data-access
layer (`db.ts`, one-line additive fix restoring data that already exists in
the DB but was being dropped on read), the learning/prompt-building layer
(`learning.ts`, the actual comparison logic), and the decision-pipeline
call site (`claude-agent.ts`, assembling the current cycle's fingerprint
from values already computed this cycle). No new files, no new database
columns — `state_fingerprint` already exists on `trade_evaluations`
(SF-C/SF-D, commit `f21f042`) and is already written correctly by
`insertTradeEvaluation()`; this closes the read-side gap and adds the
comparison logic on top of both correctly-flowing fingerprints.

## Data Flow

1. **Per cycle, per symbol** (`runAgentCycle()`, `claude-agent.ts`): after
   setup detection, the system already has `signalType`, `zScore`,
   `adxValue`, `macdHistogram`, and `spxSnapshot.spx_regime` in scope.
   These are assembled into a `StateFingerprint`-shaped object
   (`currentFingerprint`) using the already-imported bucket functions
   (`getAdxBucket`, `getZBucket`, `getMacdBucket`).
2. `currentFingerprint` is passed as `buildLearningContext()`'s second
   argument.
3. Inside `buildLearningContext()` (`learning.ts`), `getTradeEvaluations()`
   now returns each historical trade's own `stateFingerprint` (fixed in
   `db.ts` — previously always `undefined`).
4. For each of the 5 RECENT TRADE LESSONS entries, the system compares
   `currentFingerprint` against that entry's `stateFingerprint`,
   dimension-by-dimension (`adx_bucket`, `macd_bucket`, `z_bucket`,
   `market_regime`), annotating differences with `DIMENSION_IMPORTANCE`'s
   classification for each side's own `signal_type`.
5. The resulting annotated text becomes part of `learningContext`, which
   flows unchanged into `buildEnrichedPrompt()` and then Claude's user
   prompt — pure prompt-context text, never a gating or execution input.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Fix `getTradeEvaluations()`'s mapper to include `stateFingerprint` (this spec) | Minimal, single additive line; reuses data already correctly written to the DB; centralizes fingerprint bucketing in one place (`state-fingerprint.ts`) | Touches `db.ts`, one file beyond the original two-file scope | **Chosen** (per Amaury's explicit scope-expansion decision) |
| Reconstruct a fingerprint ad-hoc inside `buildLearningContext()` from `e.buyIndicators` instead of fixing `db.ts` | Zero `db.ts` changes | Duplicates bucket-computation logic already centralized in `state-fingerprint.ts`; `buyIndicators` doesn't carry `spx_regime`/`market_regime` context needed for the "regime" dimension — would require a second, parallel (and inconsistent) fingerprint-construction path | Rejected |
| Ship the comparison logic now, leave `db.ts` broken, fix it in a later prompt | Stays within the original file boundary | Ships dead code — the feature would type-check and pass tests but never actually render a comparison line against real data, defeating the entire point | Rejected |
| Compare "regime" using `spx_regime` instead of `market_regime` | Matches the field name literally present in every fingerprint alongside `signal_type` | No signal-detection gate in `claude-agent.ts` actually reads `spx_regime` — only `market_regime` (`indicators.marketRegime === 'RANGING'` in the MEAN_REVERSION gate) is gate-relevant; using `spx_regime` would produce a "Regime" annotation that doesn't correspond to any real gate importance | Rejected |
| Omit the whole comparison line if any single dimension is null | Simpler logic | Throws away 3 good dimensions because 1 is missing — notably `z_bucket` is *always* null for `EMA_RECLAIM` trades (a `state-fingerprint.ts` characteristic, out of scope to change), so this would silently disable ADX/MACD/regime comparisons for every EMA_RECLAIM entry | Rejected |
| Per-dimension null handling: omit just that one dimension (this spec) | Preserves the other 3 dimensions' comparisons even when one bucket is null | Slightly more branching in the comparison logic | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db.ts` | MODIFY | `getTradeEvaluations()`'s row mapper: add `stateFingerprint: row.state_fingerprint ?? null` — one additive line, no other query or mapping behavior changes. |
| `src/lib/learning.ts` | MODIFY | `buildLearningContext()` signature gains optional `currentFingerprint: StateFingerprint | null = null`; RECENT TRADE LESSONS loop gains per-entry comparison logic; new read-only import of `DIMENSION_IMPORTANCE` from `./gate-importance` and `StateFingerprint` from `./types`. |
| `src/lib/claude-agent.ts` | MODIFY | Call site (~line 1649): assemble `currentFingerprint` from in-scope values, pass as second argument. |
| `src/lib/__tests__/*.test.ts` | CREATE | New test file(s) covering match/differ/per-dimension-null/whole-entry-fallback logic and the once-only interpretive sentence. |

## Protected Zone Impact

⚠️ **`src/lib/learning.ts` and `src/lib/claude-agent.ts` are both Protected
Zone** per `CLAUDE.md`'s file permission matrix and `SDD.md` §17
(`claude-agent.ts`: decision pipeline; `learning.ts`: explicitly listed).
Both require Amaury confirmation before implementation. Note the
`claude-agent.ts` touch here is strictly additive at the call site — no
gate condition, signal-detection logic, or execution path is modified;
this only changes what text gets built for Claude's prompt.

`src/lib/db.ts` is not formally listed as Protected Zone in either
`CLAUDE.md` or `SDD.md`, but is flagged for awareness as the sole
service-role Supabase access layer (SDD.md §13). The change here is a
single additive field-mapping line with no query, RLS, or write-path
impact.

## Database Changes

None. The `state_fingerprint` column on `trade_evaluations` already exists
and is already correctly written (commit `f21f042`, SF-C/SF-D). This is a
read-path code fix only.

## Open Questions

- Historical `trade_evaluations` rows written before commit `f21f042`
  (SF-C/SF-D) will have `state_fingerprint = null` in the database
  regardless of this fix — comparison lines can only ever render against
  trades closed *after* that commit. In the near term, the RECENT TRADE
  LESSONS pool (last 5 closed trades project-wide) may still show few or
  zero comparison lines until enough post-SF-C/SF-D trades accumulate.
  Not blocking — flagging for Amaury's awareness, not a defect in this
  implementation.
