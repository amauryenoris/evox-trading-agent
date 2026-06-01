# Design — Near-Miss Watchlist Lifecycle Cleanup

## Architecture Decision

This feature lives entirely in `src/lib/watchlist-monitor.ts`. Two bulk Supabase UPDATE statements are prepended to `detectNearMisses()`, providing a cleanup sweep that fires before any per-symbol detection or insertion logic. The existing cleanup in `updateWatchlist()` (which calls `cleanupExpiredNearMisses()` and `cancelRevertedNearMisses()`) runs once per full agent cycle; the new cleanup runs at each `detectNearMisses()` call — meaning it executes once per symbol, per cycle. This ensures stale entries are purged before new ones are considered, regardless of how the cycle is invoked.

## Data Flow

```
detectNearMisses(symbol, indicators, thresholdMap, blockedByGate?) called
  │
  ├─ 1. now = new Date().toISOString()
  │
  ├─ 2. UPDATE near_miss_watchlist
  │       SET status = 'EXPIRED'
  │     WHERE status = 'ACTIVE' AND expires_at < now
  │     → log "[NEAR-MISS] Cleaned up expired entries"
  │
  ├─ 3. UPDATE near_miss_watchlist
  │       SET status = 'CANCELLED'
  │     WHERE status = 'ACTIVE'
  │       AND signal_type = 'MEAN_REVERSION'
  │       AND latest_zscore > -1.0
  │       AND expires_at > now
  │     → log "[NEAR-MISS] Cancelled reverted MR entries"
  │
  └─ 4. Existing detection logic (unchanged)
         ├─ if (!kalman || !marketRegime) return
         ├─ blockedByGate path → insertNearMiss
         └─ standard near-miss path → insertNearMiss
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Inline Supabase queries in `detectNearMisses()` | Zero new abstractions; matches user's exact spec; no db.ts changes | Breaks the pattern of keeping all Supabase calls in db.ts; requires importing supabase client into watchlist-monitor.ts | **See open question below** |
| Call existing `cleanupExpiredNearMisses()` + new `cancelRevertedMRNearMisses()` db helper | Keeps all Supabase calls in db.ts; consistent with existing pattern; MR-specific helper is reusable | Adds one new function to db.ts; slightly more indirection | Preferred if Amaury wants to preserve the db.ts separation |
| Reuse existing `cancelRevertedNearMisses(NEAR_MISS_UPPER)` | No new code | Cancels ALL signal types — violates FR-06 | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/watchlist-monitor.ts` | MODIFY | Add two UPDATE queries at start of `detectNearMisses()` |
| `src/lib/db.ts` | MODIFY (conditional) | Add `cancelRevertedMRNearMisses()` helper if inline approach is rejected |

## Protected Zone Impact

⚠️ `src/lib/watchlist-monitor.ts` is in the Confirm zone. Amaury specified the exact change in the spec request — confirmation is implicit.

`src/lib/db.ts` is not in the Protected Zone and may be modified freely if the db-helper approach is chosen.

## Database Changes

None — uses existing `status`, `signal_type`, `latest_zscore`, and `expires_at` columns on `near_miss_watchlist`.

## Open Questions

- **Inline vs. db helper**: The user's pseudocode shows `supabase.from(...)` used directly inside `detectNearMisses()`. The current pattern keeps all Supabase calls in `db.ts` and imports helper functions into `watchlist-monitor.ts`. Should the implementation inline the Supabase client calls (requiring a new import in `watchlist-monitor.ts`) or add a new `cancelRevertedMRNearMisses()` helper to `db.ts` alongside the existing `cleanupExpiredNearMisses()` + `cancelRevertedNearMisses()`?
