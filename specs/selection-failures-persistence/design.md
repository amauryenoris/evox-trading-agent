# Design — Selection Failures Persistence (CHANGE 3 of 3)

## Architecture Decision

This change adds one new table and threads one new write call through the
existing selection-fallback path — no new abstractions. `supabase/migrations/`
gets a new idempotent migration creating `selection_failures` with RLS
enabled and zero policies (service-role-only, matching `daily_bars` /
`position_health_snapshots`). `src/lib/types.ts` gets a small
`SelectionFailure` type (mirroring the existing `SelectionDecision` /
`SelectionEvaluation` pattern). `src/lib/db.ts` gets one new function,
`insertSelectionFailure()`, following the exact shape of
`insertSelectionEvaluation()` immediately above it. `src/lib/claude-agent.ts`
(Protected Zone) calls it from inside the already-modified `catch` block
(CHANGE 2), reusing the `step`/`detail` values already being logged — no
new computation, no change to the existing `console.warn` lines.

## Data Flow

```
runAgentCycle() (claude-agent.ts, try at 1153)
  │
  ├─ getMarketMovers(30) throws, or candidates.length < 10
  │     → catch (1161): err instanceof SelectionStepError === false
  │     → console.warn('...step=screener_fetch...', err)   [unchanged, CHANGE 2]
  │     → NEW: await insertSelectionFailure({
  │            failureStep: 'screener_fetch',
  │            failureDetail: (err as Error).message ?? String(err),
  │          }).catch((dbErr) => console.error('[SELECTION_FAILURES] ...', dbErr))
  │
  └─ selectStocksForAnalysis(...) throws SelectionStepError
        → catch (1161): err instanceof SelectionStepError === true
        → console.warn(`...step=${err.step}: ${err.detail}` + stopReason suffix)   [unchanged, CHANGE 2]
        → NEW: await insertSelectionFailure({
               failureStep: err.step,
               failureDetail: err.detail + (err.stopReason ? ` (stop_reason=${err.stopReason})` : ''),
             }).catch((dbErr) => console.error('[SELECTION_FAILURES] ...', dbErr))
  │
  └─ watchlist = TRADING_WATCHLIST fallback   [unchanged, CHANGE 2]

insertSelectionFailure() (db.ts)
  → getClient().from('selection_failures').insert({ failure_step, failure_detail })
  → if (error) throw new Error(...)   [caller already wraps in .catch(), see above]
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One `insertSelectionFailure()` call added inside **each** of the two existing branches (`if`/`else`), directly after each existing `console.warn` | Zero changes to CHANGE 2's existing lines — lowest risk to already-reviewed Protected Zone code; each branch already has exactly the `step`/`detail` values it needs, no restructuring | Two call-sites instead of one | **Chosen** — see Open Questions, this reading of the truncated prompt is called out explicitly for Amaury to confirm |
| Extract `step`/`detail` into shared local variables before the `if`/`else`, then call `insertSelectionFailure()` once after it | Exactly one call-site, matches the prompt's literal phrasing "adding one new call" | Requires restructuring CHANGE 2's `console.warn` lines to read from the new variables instead of `err.step`/`err.detail` inline — a change to already-merged, already-reviewed Protected Zone code that the spec's "Related but out of scope" section says not to make | Rejected |
| Fire-and-forget (`insertSelectionFailure(...)` without `await`, no `.catch()`) | Zero latency added to the fallback path | This code runs inside `npm run cycle` — a short-lived `tsx` script executed by GH Actions, not a long-lived server. An unawaited promise risks the process exiting before the write flushes, silently dropping the exact failure record this CHANGE exists to capture | Rejected |
| Await `insertSelectionFailure(...)` wrapped in its own `.catch()` | Guarantees the write completes (or fails loudly to the console) before the cycle continues, without letting a DB outage block the existing fallback-to-watchlist behavior (FR-06) | Slightly more code per branch | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/<timestamp>_create_selection_failures.sql` | CREATE | New table + RLS enable, no policies |
| `src/lib/types.ts` | MODIFY | Add `SelectionFailureStep` union type and `SelectionFailure` interface, alongside `SelectionDecision`/`SelectionEvaluation` |
| `src/lib/db.ts` | MODIFY | Add `insertSelectionFailure()` in a new "SELECTION FAILURES" section, following `insertSelectionEvaluation()`'s exact pattern |
| `src/lib/claude-agent.ts` (Protected Zone) | MODIFY | Add one `insertSelectionFailure(...)` call in each branch of the existing `catch` block (lines 1161-1174), wrapped in `.catch()` |
| `src/lib/__tests__/db.selection-failures.test.ts` | CREATE | Unit tests for `insertSelectionFailure()`, following `db.selection-history-candidate-scores.test.ts`'s mocking pattern |

## Protected Zone Impact

⚠️ Two Protected Zone surfaces, requiring **separate** confirmations from
Amaury before implementation, per house rule (a prior claim of
"authorized by Jorge, confirmed this session" in the originating prompt is
not itself sufficient):

1. `src/lib/claude-agent.ts` — adding the two `insertSelectionFailure(...)`
   calls inside the existing `catch` block. No other line in this file
   changes.
2. The new DB migration — `CLAUDE.md`'s Protected Zone list includes
   "Any DB migration" as its own category, distinct from the source-file
   list above.

## Database Changes

New table `selection_failures` (see Requirements, User-Approved Design
Decisions). No changes to any existing table or column.

## Open Questions

- **Call-site shape**: the originating prompt was truncated mid-migration-SQL
  (cut off at `ALTER T...`), so the exact prescribed `db.ts`/`claude-agent.ts`
  code for steps 2+ was never received. This design chose to add the new
  call once per existing branch (two call-sites, zero restructuring of
  CHANGE 2's lines) over extracting shared variables (one call-site, but
  requires touching CHANGE 2's already-merged `console.warn` lines) because
  the spec explicitly scopes out modifying "any of CHANGE 1/2's existing
  logic beyond adding one new call." Please confirm this reading is correct
  before `/implement` proceeds, or provide the intended exact snippet if the
  full original prompt specified something different.
- Confirm with Amaury: proceed with touching `src/lib/claude-agent.ts`'s
  catch block (two new call-sites) under fresh, in-conversation
  confirmation.
- Confirm with Amaury: proceed with adding the new `selection_failures`
  migration under fresh, in-conversation confirmation.
