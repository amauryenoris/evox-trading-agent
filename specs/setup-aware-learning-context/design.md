# Design — Setup-aware learning context for the BUY prompt + persisted decision snapshot

## Architecture Decision

A new pure module `src/lib/learning-context.ts` builds the whole learning block from data passed in
(`trades`, `indicators`, `asOf`). It reuses `getPatternStats`-family functions from `pattern-stats.ts`
(`buildSetupTrackRecords`, `buildBucketReports`) and `SCHEMA` / `RULE_VERSION_BOUNDARIES` / `filterDiagnostic`
from `pattern-schema.ts`, so the numbers Claude sees are the same ones the dashboard Patterns view shows.
`learning.ts:buildLearningContext` shrinks to: load trades, call the module, return `{ text, snapshot }`.
`claude-agent.ts` passes the candidate's setup/symbol/indicators/cycle timestamp in, keeps the snapshot with the
candidate (also through `buyQueue`), and writes it into `indicators.learningContext` and `patternIdsUsed` when a
position opens. No schema, type or DB-layer change is needed.

## Pre-Implementation Verification (FAIL FAST checks — performed against current code)

| Fail-fast condition | Result | Evidence |
|---|---|---|
| `buildLearningContext` called once per cycle instead of per candidate | **Passes** | Single call site, `claude-agent.ts:2119`, inside the per-symbol loop after `signalType` is known. `buyQueue.push` (`:2460`) is in the same iteration, so the snapshot is in scope. |
| `patternIdsUsed` / indicators JSONB cannot carry data without `types.ts`/`db.ts` change | **Passes** | `patternIdsUsed: string[]` (`types.ts:204`) written to `pattern_ids` (`db.ts:170`). Direct-BUY site builds `indicatorsAtBuy` and the ranking site `bestIndicatorsAtBuy`, both typed `TechnicalIndicators & Record<string, unknown>`; `fillAttempts` is attached the same way. **Not yet verified:** the `pattern_ids` column type (expected `text[]`) — Task T-01 checks the migration files read-only. |
| Loaded trade records lack buy indicators, fingerprint or timestamps | **Passes, with caveats** | `getTradeEvaluations` returns `buyTimestamp`, `sellTimestamp`, `signal_type`, `stateFingerprint`, `lessonsLearned`, `holdingDays`, and `buyIndicators` built with `...raw`, so `ema50`, `prevClose`, `closeMinus3` and `sectorRotation` survive at runtime. Caveats: (1) `sectorRotation` is not in the `TechnicalIndicators` type, so it must be read through a narrow type guard; (2) `buyTimestamp` is `''` when the row value is null. |

Also found, and not covered by the request text:

- **The "3 saveOpenPositionContext sites" are not all candidate-driven.** `:244-254` is the orphaned-position
  reconcile path (`[AUTO-RECONCILED]`): no candidate, no prompt, no learning block. Only `:2392` (direct BUY) and
  `:2603` (ranking winner) can carry a snapshot. This design persists at those two and leaves the reconcile site
  untouched (FR-58).
- **Existing tests assert the behavior being removed.** `gate-relevance-context.test.ts` (whole file) and the
  `buildLearningContext` block of `pattern-library-min-sample-gate.test.ts` call the real `buildLearningContext`
  and check pattern rows / `DIMENSION_IMPORTANCE` text. They will fail by design (see Open Questions).
- **Timestamp comparison hazard.** DB timestamps are UTC (`...Z`); `SCHEMA_FROZEN_AT` and the cutoff use `-04:00`
  offsets. Comparing those as strings is wrong by up to 4 hours. The new module compares instants via
  `Date.getTime()`. `pattern-stats.ts` currently compares `buyTimestamp < SCHEMA_FROZEN_AT` as strings
  (observation only; out of scope here).

## Data Flow

```
claude-agent.ts (per candidate, ~2119)
  signalType, symbol, indicators, timestamp(asOf)
        │
        ▼
learning.ts: buildLearningContext({setup, symbol, indicators, asOf})
  trades = getTradeEvaluations(LEARNING_TRADES_LIMIT)      ← only DB read
        │
        ▼
learning-context.ts: buildSetupLearningBlock({setup, symbol, indicators, asOf, trades})
  a. track record     ← buildSetupTrackRecords(trades) → setup baseline + latest rule-version n
  b. matching buckets ← buildBucketReports(trades, setup) minus diagnostic
                        + candidate pseudo-trade → getTradeDimensionValue(dim, pseudo, trades)
                        keep: viable && bucket resolved && bucket n >= MIN_BUCKET_N
  c. same-symbol      ← last 3 trades of symbol by sellTimestamp
  d. lessons          ← same-setup trades, newest first, minus pre-SECTOR_RS_RELIABLE_FROM
                        trades that carry sectorRotation data; take 2
  e. footer; apply caps (40 lines / 3000 chars, drop lessons first)
        │
        ▼ { text, snapshot }
claude-agent.ts
  text      → buildEnrichedPrompt(... learningContext ...)           (unchanged position)
  snapshot  → buyQueue entry (ranking path) / local var (direct path)
  on BUY:   indicatorsAtBuy.learningContext = snapshot
            patternIdsUsed = buildPatternIds(snapshot)
            → saveOpenPositionContext (:2392 and :2603)
```

## Design decisions

- **Pseudo-trade.** The candidate is wrapped as a `TradeEvaluation` (`id: 'candidate'`, `symbol`,
  `signal_type: setup`, `buyTimestamp: asOf`, `buyIndicators: indicators`, neutral values elsewhere) used only to
  look up bucket values. It is never added to `trades` or any summary.
- **Additive helper.** `pattern-stats.ts` gains `getTradeDimensionValue(dimension, trade, allTrades)`, a thin
  exported wrapper over the existing private `getDimensionValue`. Nothing else in the file changes.
- **Current rule version n.** The latest boundary of the setup by `effectiveDate`; n = its `after.n` from
  `buildSetupTrackRecords`. A setup with no boundaries uses its baseline n. Text names the label and date.
- **Truncation order (FR-33).** Remove lesson 2, then lesson 1 and header, then trailing matching-condition lines
  (exploratory first). Track record and footer are never removed. The truncation steps are the one place the
  request is silent past "lessons first"; confirm in Open Questions.
- **Setup matching** uses `getStatsSetupName`, so legacy `TREND` and null `signal_type` trades belong to no setup
  and never supply lessons or baselines.
- **Empty setup (FR-09).** One line replaces track record, matching conditions and lessons; same-symbol history
  and the footer still render.
- **Percent format.** One decimal with sign, like the previous prompt text (`+3.2%`).
- **Limit.** `LEARNING_TRADES_LIMIT = 1000`, a named constant in `learning.ts`: PostgREST returns at most 1000
  rows per request, so a larger value would silently cap anyway. `getTradeEvaluations` orders newest sell first,
  so beyond 1000 closed trades the oldest drop out. There are 113 today.
- **Cost.** One query per candidate per cycle, up from one 200-row query plus the pattern_library query. NFR-08.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Thin wrapper in `learning.ts` + pure module (request) | Pure/testable core; small Protected Zone diff | Wrapper still reloads trades per candidate | **Chosen** |
| Load trades once per cycle and pass them in | Fewer queries | Changes call-site structure beyond the authorized wiring | Rejected (follow-up) |
| Add `learningContext` to `TechnicalIndicators` type | Type-safe key | Needs `types.ts` change (forbidden) | Rejected; use the existing `Record<string, unknown>` mechanism |
| Persist the snapshot at the reconcile site too | "3 sites" literally | No candidate/prompt exists there; would store fabricated data | Rejected |
| Reuse `getPatternStats` whole | One call | Computes all five setups per candidate | Rejected; use per-setup `buildBucketReports` + `buildSetupTrackRecords` |
| String comparison for the cutoff | Matches `pattern-stats` style | Off by up to 4 h across Z vs -04:00 | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/learning-context.ts` | CREATE | `buildSetupLearningBlock`, `buildPatternIds`, `SECTOR_RS_RELIABLE_FROM`, snapshot types |
| `src/lib/__tests__/learning-context.test.ts` | CREATE | Unit tests for the module |
| `src/lib/pattern-stats.ts` | MODIFY (additive) | Export `getTradeDimensionValue` only |
| `src/lib/learning.ts` ⚠️ | MODIFY | `buildLearningContext` becomes a wrapper; drop pattern/recent/general/`DIMENSION_IMPORTANCE` code and its import; keep `updatePatternLibrary` and `getRelevantPatterns` untouched |
| `src/lib/claude-agent.ts` ⚠️ | MODIFY | Call-site args, `buyQueue` entry gains a snapshot field, two persist sites gain `learningContext` and `patternIdsUsed` |
| `src/lib/__tests__/gate-relevance-context.test.ts` | MODIFY/DELETE | Tests the removed comparison (decision pending) |
| `src/lib/__tests__/pattern-library-min-sample-gate.test.ts` | MODIFY | Keep `getRelevantPatterns` block; replace the obsolete `buildLearningContext` block |
| `src/lib/gate-importance.ts` | UNCHANGED | `learning.ts` stops importing it; `claude-agent.ts` still references the file |

## Protected Zone Impact

`src/lib/learning.ts` and `src/lib/claude-agent.ts` only, and only for the wiring above. Authorization was given
in the request for exactly these two files.
⚠️ Requires Amaury confirmation before implementation (re-confirm at `/implement`; do not infer from this spec).
No other Protected Zone file is touched.

## Database Changes

None. `open_position_contexts.indicators` (JSONB) gains a `learningContext` key; `pattern_ids` receives strings.
No migration. The `pattern_ids` column type is confirmed read-only in T-01.

## Notes

- `SECTOR_RS_RELIABLE_FROM`: `git log` shows the macro-bars fix `c18a449` at `2026-10-05T10:54:28-04:00`. The
  request's fallback is `2026-10-06T00:00:00-04:00`. A commit time is not a deploy time, and the fallback only
  discards at most one more trading day, so the fallback is the proposed value.
- Sector rotation is computed once per cycle, so "has sectorRotation data" is a property of the trade, not the
  symbol.
- Verification limits: the live cycle (Alpaca, Claude, market hours) cannot be run here. The wiring is verified
  by `tsc`, tests of the pure module and `buildPatternIds`, and the diff, not by executing a cycle. The `.tmp/`
  script renders blocks from real stored trades, using each chosen trade's stored buy indicators as the candidate.

## Open Questions — resolved (2026-10-12, Amaury: accept all proposals)

1. **Cutoff value:** `2026-10-06T00:00:00-04:00`.
2. **Reconcile site:** stays unchanged; only the direct-BUY and ranking-winner sites carry a snapshot.
3. **Obsolete tests:** `gate-relevance-context.test.ts` is deleted; the `buildLearningContext` block of
   `pattern-library-min-sample-gate.test.ts` is replaced.
4. **Truncation past lessons:** trailing (exploratory) matching lines are dropped next.
5. **Empty setup:** same-symbol history still renders.
6. **Return type:** `buildLearningContext` returns `{ text, snapshot }`.

## Implementation notes

- Lesson tags and same-symbol lines use the **sell** date.
- `FR-08`/`FR-18` apply to text the module generates; lesson text is quoted verbatim.
