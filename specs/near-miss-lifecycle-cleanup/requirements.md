# Requirements — Near-Miss Watchlist Lifecycle Cleanup

## Functional Requirements

FR-01: The system shall mark `near_miss_watchlist` entries as `EXPIRED` when their `status` is `ACTIVE` and their `expires_at` timestamp is earlier than the current time, at the start of each `detectNearMisses()` invocation.

FR-02: The system shall mark `near_miss_watchlist` entries as `CANCELLED` when their `status` is `ACTIVE`, their `signal_type` is `MEAN_REVERSION`, their `latest_zscore` is greater than `-1.0`, and their `expires_at` timestamp is later than the current time, at the start of each `detectNearMisses()` invocation.

FR-03: The system shall execute the expiration UPDATE (FR-01) before the cancellation UPDATE (FR-02) in each invocation.

FR-04: The system shall log `[NEAR-MISS] Cleaned up expired entries` after the expiration UPDATE completes.

FR-05: The system shall log `[NEAR-MISS] Cancelled reverted MR entries` after the cancellation UPDATE completes.

FR-06: The system shall not alter the `status` of `near_miss_watchlist` entries whose `signal_type` is not `MEAN_REVERSION` during the cancellation step (FR-02).

FR-07: The system shall not alter the `status` of `near_miss_watchlist` entries whose `status` is not `ACTIVE` during either UPDATE step.

FR-08: Where the existing `updateWatchlist()` function calls `cleanupExpiredNearMisses()` and `cancelRevertedNearMisses()`, the system shall continue to invoke those calls unchanged.

## Non-Functional Requirements

NFR-01: The two UPDATE queries introduced in `detectNearMisses()` shall produce zero TypeScript compilation errors.

NFR-02: The two UPDATE queries shall complete before any detection or insertion logic inside `detectNearMisses()` runs.

## Constraints

C-01: This feature must not modify any Protected Zone file beyond `src/lib/watchlist-monitor.ts`. Amaury has specified the exact change; confirmation is implicit in the spec request.

C-02: The feature shall consist of exactly two Supabase UPDATE queries. No new detection logic, insertion logic, or structural changes to `detectNearMisses()` are permitted.

C-03: The cancellation threshold for MR entries is fixed at `-1.0` (the `NEAR_MISS_UPPER` constant already defined in `watchlist-monitor.ts`).

## Out of Scope

- Modifying `updateWatchlist()` cleanup behavior.
- Adding signal-type filtering to the existing `cancelRevertedNearMisses()` db helper.
- Changing near-miss detection or insertion logic in any function.
- Adding cancellation logic for non-MEAN_REVERSION signal types.
- Any database schema changes.
