# Design — Normalize sell_timestamp Precision

## Architecture Decision

This is a two-point surgical fix in the exit/learning-loop data path, not a new feature. It touches exactly two files:

- `src/lib/alpaca.ts` — hosts the new `normalizeTimestampPrecision()` helper (co-located with `AlpacaOrder`, `getOrders()`, and `getLatestSellOrder()`, the only functions that touch Alpaca's raw timestamp strings) and uses it internally in `getLatestSellOrder()`'s filter/sort.
- `src/lib/claude-agent.ts` — wraps the existing `sellTimestamp` computation at line 1060 with the new helper. This is the sole point where a `sellTimestamp` value is computed; it is reused downstream (line 1072, `evaluateClosedTrade()`) so normalizing once here fixes both storage sinks.

No new file is created. No existing file outside these two is touched.

**Why `alpaca.ts` and not a new `src/lib/utils.ts` entry or `src/lib/time.ts`:** the inconsistency originates entirely from Alpaca's API response format, and the only two call sites that need it are both already inside `alpaca.ts`'s domain (`getLatestSellOrder`) or immediately consume its output (`claude-agent.ts:1060`, one import away). `utils.ts` currently holds generic non-timestamp helpers; introducing a timestamp-specific helper there would separate it from the `AlpacaOrder`/`filled_at` context it exists to normalize, with no reuse benefit today (only these two call sites exist per the diagnostic). If a third, non-Alpaca-related normalization need appears later, extracting to a shared utility at that point is trivial and lower-risk than speculatively generalizing now (YAGNI).

## Data Flow

```
Alpaca GET /v2/orders (getOrders)
         │
         ▼
AlpacaOrder[] (filled_at: string | null, raw RFC-3339, variable precision)
         │
         ▼
getLatestSellOrder(symbol, afterTimestamp)
  ├─ filter: normalizeTimestampPrecision(o.filled_at) > normalizeTimestampPrecision(afterTimestamp)   [NEW]
  ├─ sort:   normalizeTimestampPrecision(b.filled_at) > normalizeTimestampPrecision(a.filled_at)       [NEW]
  └─ returns: AlpacaOrder as-is (filled_at UNCHANGED)                                                  [unchanged]
         │
         ▼
claude-agent.ts:1060
  sellTimestamp = normalizeTimestampPrecision(sellOrder?.filled_at ?? timestamp)                       [NEW]
         │
         ├─────────────────────────────┬───────────────────────────────────┐
         ▼                             ▼                                   
evaluateClosedTrade()          insertAgentLogEntry()                
  → TradeEvaluation.sellTimestamp        → AgentLogEntry.timestamp (ghost-close only)
         │                             │
         ▼                             ▼
db.ts:233 → trade_evaluations.sell_timestamp    db.ts (agent_log insert) → agent_log.timestamp
  (normalized, 3-digit ms, going forward)          (normalized, 3-digit ms, going forward)
```

Historical rows already in both tables are untouched — this flow only governs values computed after deployment.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `new Date(iso).toISOString()` wrapper (proposed) | Reuses JS's own battle-tested RFC-3339 parser; zero new dependencies; one line of logic; handles all observed precision variants (3/5/6/9 digits) uniformly | Loses sub-ms precision permanently on the normalized value (acceptable — no consumer needs it, per diagnostic) | **Chosen** |
| Manual regex/string-slice truncation to 3 fractional digits | Avoids `Date` parsing overhead | Reimplements RFC-3339 parsing edge cases (variable digit width, optional offset formats) that `Date` already handles correctly; first manual timestamp-parsing code in the project, higher maintenance risk | Rejected |
| Normalize only at write point (`claude-agent.ts:1060`), leave `getLatestSellOrder` raw-comparison as-is | Smaller diff; fixes the two confirmed storage sinks | Leaves the in-memory filter/sort defect in `getLatestSellOrder` unfixed — per diagnostic, this runs on raw Alpaca data *before* any value reaches `sellTimestamp`, so it has its own independent latent-collision risk | Rejected — diagnostic explicitly found this needs its own fix |
| Backfill historical rows to 3-digit ms alongside the forward fix | Full consistency across all data | Destructive, irreversible precision loss on historical Alpaca-sourced timestamps; no confirmed real defect exists in current data to justify it (0/56 pairwise collisions found) | Rejected — explicit decision, forward-only fix |
| Add a Postgres CHECK constraint enforcing 3-digit-ms format on `sell_timestamp` | Enforces consistency at the schema level, catches any future bypass of the app-layer fix | DB migration required (Protected Zone-adjacent, out of scope per constraints); would reject/complicate legitimate historical data queries; premature for a single-write-path column | Rejected — YAGNI, no DB migration requested |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/alpaca.ts` | MODIFY | Add exported `normalizeTimestampPrecision(iso: string): string` helper. Modify `getLatestSellOrder()`'s filter (line 310) and sort (line 314) to compare normalized values; `AlpacaOrder` objects returned are unchanged. |
| `src/lib/claude-agent.ts` | MODIFY | Wrap the `sellTimestamp` computation at line 1060 with `normalizeTimestampPrecision(...)`. Import the helper from `alpaca.ts`. No other line in this file changes. |
| `src/lib/__tests__/*.test.ts` | CREATE (new test file) or MODIFY (existing alpaca/claude-agent test file) | Unit tests for `normalizeTimestampPrecision()` and a regression/synthetic-collision test for `getLatestSellOrder()`. Exact file TBD in tasks.md, following existing test-file naming (e.g. `normalize-timestamp-precision.test.ts`). |

No API routes, dashboard components, `db.ts`, `learning.ts`, `types.ts`, or any other `src/lib/` file changes.

## Protected Zone Impact

`src/lib/claude-agent.ts` is touched — **one line** (1060), wrapping the existing expression in the new helper call, no logic/behavior change to signal detection, gates, or exit rules.

⚠️ **Requires Amaury confirmation before implementation**, per `specs/README.md`'s Protected Zone rule. `src/lib/alpaca.ts` is not in the Protected Zone list and does not require this confirmation.

## Database Changes

None. No migration, no new column, no new table, no RLS change. This is an application-layer-only fix.

## Open Questions

- None. All prior diagnostic rounds (STEP 0 verification, write-path scoping, real-collision check) confirm the approach is sufficient and safe as scoped.
