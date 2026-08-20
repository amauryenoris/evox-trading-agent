# Design — Narrow getRecentNewsClassifications()'s Return Type

## Architecture Decision

This is a type-safety-only fix confined to the data-access boundary between `db.ts` and its callers. It adds one derived type in `types.ts` (`NewsClassificationRecord = Pick<NewsEvent, ...>`) and re-points `getRecentNewsClassifications()`'s return type and final cast at it. No query logic, no control flow, and no consumer code changes — the fix works purely because both existing callers already, independently, only ever read fields inside the narrower type's field set (confirmed live in the prior 2-round diagnostic: `newsIntelligenceLayer()` reads all 5 of `scope`/`symbol`/`sentiment`/`impact`/`threshold_adjustment`; `getAggregateMacroSentiment()` reads a subset, `scope`/`sentiment`).

The mechanism chosen is `Pick<NewsEvent, ...>` rather than a hand-written standalone interface, so the field types (the literal unions for `scope`/`sentiment`/`impact`, etc.) stay derived from `NewsEvent` and can't drift independently.

## Data Flow

```
news_events table (Supabase)
        │
        │  db.ts: getRecentNewsClassifications(hours)
        │  .select('scope, symbol, sentiment, impact, threshold_adjustment')
        │  (SQL unchanged)
        ▼
NewsClassificationRecord[]   ← NEW: narrowed from NewsEvent[] to Pick<NewsEvent, 'scope' | 'symbol' | 'sentiment' | 'impact' | 'threshold_adjustment'>
        │
        ├──────────────────────────────┐
        ▼                               ▼
newsIntelligenceLayer()          getAggregateMacroSentiment()
(reads all 5 fields —            (reads .scope, .sentiment —
 type-checks unchanged)           type-checks unchanged)
```

Before this fix, the compiler believed `data` had 12 fields (7 of them non-optional) even though only 5 were ever fetched; a future read of `.headline` or `.created_at` would silently compile and be `undefined` at runtime. After this fix, the same read is a compile error.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Leave `NewsEvent[]` as the return type, document the gap in a comment only | Zero code change | Comment-only protection is exactly what already existed and already failed to prevent the gap from going unnoticed until this diagnostic | Rejected |
| `Pick<NewsEvent, 'scope' \| 'symbol' \| 'sentiment' \| 'impact' \| 'threshold_adjustment'>` as a new named type, paired comments in both locations | Compiler-enforced; field types stay derived from `NewsEvent` (no duplication of the literal unions); minimal diff; matches the project's stated preference for simple, direct code over abstraction | Two locations (`.select()` list and `Pick<>` field list) must still be updated together by a human — mitigated, not eliminated, by the paired comments | Chosen |
| Derive the `.select()` string from the type (or vice versa) via a shared constant/codegen | Fully eliminates the sync-by-hand risk | More machinery than this project's small-file convention calls for; not requested; higher review/maintenance surface for a 5-field type | Rejected (explicitly, per prior discussion) |
| Standalone hand-written interface (not `Pick<>`) for the 5 fields | Slightly more explicit at the call site | Duplicates the literal-union types (`'MACRO' \| 'SYMBOL'`, etc.) already declared on `NewsEvent` — a second place those unions could drift out of sync | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `NewsClassificationRecord` type (a `Pick<>` of `NewsEvent`) immediately after the `NewsEvent` interface, with a comment pointing at `db.ts`'s `.select()` list |
| `src/lib/db.ts` | MODIFY | Change `getRecentNewsClassifications()`'s return type annotation and final cast from `NewsEvent[]` to `NewsClassificationRecord[]`; add `NewsClassificationRecord` to the existing `./types` import; add a comment above the function pointing at the `Pick<>` in `types.ts` |

No other file changes. `news-intelligence.ts` (`newsIntelligenceLayer()`, `getAggregateMacroSentiment()`, `buildThresholdMap()`) is read but not modified — both callers are expected to type-check against the narrower type with zero code changes, per the prior diagnostic's field-usage confirmation.

## Protected Zone Impact

Per `CLAUDE.md`'s File Permission Matrix: `src/lib/types.ts` is explicitly listed under **Touch freely**. `src/lib/db.ts` is not listed in either the "Touch freely" or the "Confirm with Amaury before touching" table — it falls outside the matrix as currently written.

None of the CLAUDE.md hard Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) or the `specs/README.md` extended reminder list (which adds `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, and DB migrations) is touched by this fix.

**None — this feature does not require Protected Zone changes or Amaury confirmation**, based on the current file permission matrix. Flagging for awareness only: `db.ts` is a core data-access file that isn't explicitly categorized either way in `CLAUDE.md`; if Amaury wants `db.ts` treated as confirm-first going forward, that's a `CLAUDE.md` update to make separately, not a blocker for this fix.

## Database Changes

None — no migration, no schema change. The `.select()` column list against `news_events` is byte-identical before and after.

## Open Questions

- None. All design decisions (Pick<> vs. standalone interface, paired-comment mitigation vs. derive-from-query abstraction, scope of the two callers) were resolved in the prior 2-round diagnostic per the fix prompt's stated context.
