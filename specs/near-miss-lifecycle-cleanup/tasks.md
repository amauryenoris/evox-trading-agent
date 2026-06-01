# Tasks — Near-Miss Watchlist Lifecycle Cleanup

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open question resolved: db helper approach chosen — add `cancelRevertedMRNearMisses()` to `db.ts`

## Implementation Checklist

### Phase 1 — Data Layer (conditional on open question)

**If db-helper approach is chosen:**
- [x] T-01: In `src/lib/db.ts`, add `cancelRevertedMRNearMisses()` — UPDATE ACTIVE MEAN_REVERSION entries where `latest_zscore > -1.0` and `expires_at > now` to CANCELLED

**If inline approach is chosen:**
- [ ] T-01 (alt): No db.ts changes needed; Supabase client imported directly in `watchlist-monitor.ts`

### Phase 2 — watchlist-monitor.ts

- [x] T-02: In `src/lib/watchlist-monitor.ts`, at the top of `detectNearMisses()` (before the `if (!kalman || !marketRegime) return` guard), add:
  - `const now = new Date().toISOString()`
  - UPDATE query: set ACTIVE entries with `expires_at < now` to EXPIRED
  - `console.log('[NEAR-MISS] Cleaned up expired entries')`
  - UPDATE query: set ACTIVE MEAN_REVERSION entries with `latest_zscore > -1.0` and `expires_at > now` to CANCELLED
  - `console.log('[NEAR-MISS] Cancelled reverted MR entries')`

### Phase 3 — Verification

- [x] T-03: Run `npx tsc --noEmit` — confirm zero TypeScript errors
- [x] T-04: Confirm `updateWatchlist()` still calls `cleanupExpiredNearMisses()` and `cancelRevertedNearMisses()` unchanged

### Phase 4 — Testing

- [ ] T-05: Write unit tests for the two new UPDATE paths in `detectNearMisses()` — BLOCKED: no test framework configured (no jest/vitest in package.json)
  - Expired entry gets status = EXPIRED
  - Active MR entry with zscore > -1.0 gets status = CANCELLED
  - Active non-MR entry with zscore > -1.0 remains ACTIVE (FR-06 regression check)
- [ ] T-06: Verify 80% coverage on modified code paths — BLOCKED: no test framework configured

## Post-Implementation

- [ ] Run `/review near-miss-lifecycle-cleanup` to verify implementation matches spec
- [ ] Confirm no detection or insertion logic was altered in `detectNearMisses()`

## Estimated Complexity

**Low** — two Supabase UPDATE queries prepended to an existing function; no logic changes, no schema changes, no new types.
