# Requirements — Gate-Aware Relevance Context in RECENT TRADE LESSONS

## Context

`buildLearningContext()` ([learning.ts:290-329](../../src/lib/learning.ts#L290-L329))
takes only `indicators`. Its RECENT TRADE LESSONS block (lines 309-318)
lists the 5 most-recently-closed trades project-wide with zero relevance
filtering — the confirmed root cause of cross-setup contamination in
Claude's prompt (NOK→NFLX; this session's XOM-pattern→UUUU case). The call
site is [claude-agent.ts:1649](../../src/lib/claude-agent.ts#L1649):
`const learningContext = await buildLearningContext(indicators)`.

`gate-constants-hoist` (merged) established `gate-importance.ts`'s
`DIMENSION_IMPORTANCE` table as a real, gate-derived per-setup importance
map for ADX/MACD/z/regime. This feature wires that table into RECENT TRADE
LESSONS: for each of the 5 entries, when both the current trade's and the
historical trade's state fingerprints are available, append a per-dimension
match/differ line annotated with each dimension's gate-importance under
each trade's own `signal_type` — giving Claude the raw facts to weigh
cross-setup relevance itself, rather than presenting all 5 lessons as
equally applicable.

**Blocking discovery from this spec's verification pass (resolved by
Amaury — scope expanded to include the fix):** `getTradeEvaluations()`
([db.ts:266-320](../../src/lib/db.ts#L266-L320)) selects `*` from
`trade_evaluations` (so `state_fingerprint` is present in the raw row) but
its row-mapper never copies it onto the returned `TradeEvaluation` object —
every trade this function returns currently has `stateFingerprint ===
undefined`, unconditionally. Without fixing this, the comparison logic
below can never activate: it would type-check and build cleanly while
silently never rendering a single comparison line. This fix is in scope.

## Functional Requirements

FR-01: The system shall accept an optional second parameter,
       `currentFingerprint: StateFingerprint | null`, on
       `buildLearningContext()`, defaulting to `null`.

FR-02: The system shall produce output byte-identical to the current
       (pre-change) behavior when `buildLearningContext()` is called with
       only its first argument (`currentFingerprint` defaults to `null`).

FR-03: The system shall populate `stateFingerprint` on every
       `TradeEvaluation` object returned by `getTradeEvaluations()` from
       the row's `state_fingerprint` column, defaulting to `null` when the
       column is null.

FR-04: The system shall render one relevance-comparison line for a RECENT
       TRADE LESSONS entry when `currentFingerprint` is non-null, that
       entry's own `stateFingerprint` is non-null, and both trades'
       `signal_type` are keys present in `DIMENSION_IMPORTANCE`.

FR-05: Where a per-dimension comparison is rendered, if either side's
       bucket value for that specific dimension (`adx_bucket`,
       `macd_bucket`, `z_bucket`, or `market_regime`) is null, the system
       shall omit that single dimension from the line rather than reporting
       a false match or differ.

FR-06: The system shall compare the "regime" dimension using each
       fingerprint's `market_regime` field, not `spx_regime` — `
       market_regime` is the field the MEAN_REVERSION gate actually
       evaluates (`indicators.marketRegime === 'RANGING'`); no signal gate
       reads `spx_regime`.

FR-07: Where two non-null dimension values differ, the system shall display
       both values, each annotated with `DIMENSION_IMPORTANCE`'s
       classification for that dimension under its own trade's
       `signal_type`.

FR-08: Where two non-null dimension values are equal, the system shall
       state that the dimension matches.

FR-09: The system shall omit the comparison line entirely for a RECENT
       TRADE LESSONS entry — falling back to the existing unlabeled format
       for that entry only — when `currentFingerprint` is null, that
       entry's own `stateFingerprint` is null, or either trade's
       `signal_type` is not a `DIMENSION_IMPORTANCE` key.

FR-10: The system shall append, exactly once and only when at least one
       comparison line was rendered in that call, the sentence: "Note:
       differences in dimensions that are not gated for either setup are
       generally less informative than differences in dimensions that are
       hard-gated for one or both setups."

FR-11: The system shall not alter which 5 trades RECENT TRADE LESSONS
       selects, their order, or the lesson text (`lessonsLearned`) itself.

FR-12: Where `runAgentCycle()` calls `buildLearningContext()`, the system
       shall assemble a `StateFingerprint`-shaped object from values already
       in scope (`signalType`, `spxSnapshot.spx_regime`,
       `indicators.marketRegime`, `getAdxBucket(adxValue)`,
       `getZBucket(zScore, signalType)`, `getMacdBucket(macdHistogram)`)
       and pass it as the second argument.

FR-13: The system shall leave `getRelevantPatterns()` / "PATTERNS WITH BEST
       PERFORMANCE" and `stock-selector.ts`'s "PAST SELECTION PERFORMANCE"
       unmodified in logic and output format.

## Non-Functional Requirements

NFR-01: The change shall introduce zero TypeScript compilation errors
        (`npx tsc --noEmit`).

NFR-02: `npm run build` shall pass with no new errors.

NFR-03: `pattern-library-min-sample-gate.test.ts` shall pass unmodified.

NFR-04: New tests shall cover: match, differ, per-dimension-null fallback,
        whole-entry fallback (either fingerprint null, or signal_type not
        a `DIMENSION_IMPORTANCE` key), and the interpretive sentence
        appearing exactly once and only when at least one comparison line
        rendered.

NFR-05: `DIMENSION_IMPORTANCE` shall be imported read-only in `learning.ts`
        — no write or mutation of it anywhere in the codebase.

## Constraints

C-01: `src/lib/learning.ts` and `src/lib/claude-agent.ts` are Protected
      Zone per `CLAUDE.md` / `SDD.md` §17 — Amaury confirmation required
      before implementation.

C-02: `src/lib/db.ts` is not formally listed as Protected Zone, but is the
      sole Supabase service-role data-access layer (SDD.md §13) — the fix
      here is a single additive line in one existing mapper, no other
      query or mapping behavior may change.

C-03: `gate-importance.ts`'s `DIMENSION_IMPORTANCE` values and the 3
      hoisted gate constants are read-only imports here — no modification.

C-04: The `self_flagged_disqualifying_risk` instruction block is out of
      scope — that is Prompt 3/3, a separate, independent change.

C-05: No gate condition, signal-detection logic, or order-execution path
      may be touched — this feature only affects prompt context text, never
      any conditional that determines `orderExecuted` or gating.

C-06: `getRelevantPatterns()`/"PATTERNS WITH BEST PERFORMANCE" and
      `stock-selector.ts`'s "PAST SELECTION PERFORMANCE" must remain
      untouched — confirmed structurally separate from this change.

## Out of Scope

- Softening `self_flagged_disqualifying_risk` example wording (Prompt 3/3)
- Naming or extracting the 4 unnamed inline gate thresholds
- `getZBucket()`'s existing behavior of returning `null` for `EMA_RECLAIM`
  (a pre-existing, unrelated characteristic of `state-fingerprint.ts`) —
  it simply means the z-dimension is omitted per FR-05 for those trades
- Backfilling `state_fingerprint` for `trade_evaluations` rows written
  before the SF-C/SF-D commit (`f21f042`) that first began persisting it —
  those older rows will continue to have `state_fingerprint = null` in the
  DB regardless of this fix; only trades closed after that commit can ever
  produce a comparison line
- Any change to `pattern_library` or `getRelevantPatterns()`
