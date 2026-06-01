# Review Report — Near-Miss Watchlist Lifecycle Cleanup

**Date**: 2026-06-01
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Mark ACTIVE entries EXPIRED when `expires_at < now` at start of `detectNearMisses()` | ✅ | `cleanupExpiredNearMisses()` called at line 24, before any detection logic |
| FR-02 | Mark ACTIVE MEAN_REVERSION entries CANCELLED when `latest_zscore > -1.0` AND `expires_at > now` | ✅ | `cancelRevertedMRNearMisses(NEAR_MISS_UPPER)` called at line 26; filters `.eq('signal_type', 'MEAN_REVERSION')` |
| FR-03 | Expiration UPDATE runs before cancellation UPDATE | ✅ | `cleanupExpiredNearMisses` at line 24, `cancelRevertedMRNearMisses` at line 26; both awaited in sequence |
| FR-04 | Log `[NEAR-MISS] Cleaned up expired entries` after expiration UPDATE | ✅ | `console.log` at line 25 |
| FR-05 | Log `[NEAR-MISS] Cancelled reverted MR entries` after cancellation UPDATE | ✅ | `console.log` at line 27 |
| FR-06 | Cancellation step does not touch entries with `signal_type != MEAN_REVERSION` | ✅ | `cancelRevertedMRNearMisses` includes `.eq('signal_type', 'MEAN_REVERSION')` filter |
| FR-07 | Neither UPDATE touches entries with `status != ACTIVE` | ✅ | Both helpers filter `.eq('status', 'ACTIVE')` |
| FR-08 | `updateWatchlist()` still calls `cleanupExpiredNearMisses()` and `cancelRevertedNearMisses()` unchanged | ✅ | Lines 102–105 in `watchlist-monitor.ts` unmodified |
| NFR-01 | Zero TypeScript compilation errors | ✅ | `tsc --noEmit` returned clean |
| NFR-02 | Both UPDATEs complete before detection/insertion logic | ✅ | Cleanup calls precede `const { kalman, marketRegime }` destructuring at line 29 |
| C-01 | No Protected Zone files touched beyond `watchlist-monitor.ts` | ✅ | Only `watchlist-monitor.ts` (Protected Zone, approved) and `db.ts` (not Protected) modified |
| C-02 | Exactly two UPDATE queries; no new detection/insertion logic | ✅ | Two db-helper calls added; zero changes to detection or insertion branches |
| C-03 | Cancellation threshold uses `NEAR_MISS_UPPER` (-1.0) | ✅ | `cancelRevertedMRNearMisses(NEAR_MISS_UPPER)` passes the named constant |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | MODIFIED | Expected — listed in `design.md`; Amaury confirmed |
| `src/lib/learning.ts` | UNTOUCHED | — |

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `claude-agent.ts` untouched |
| Supabase patterns — no `any` casts | ✅ | `cancelRevertedMRNearMisses` uses string literal status, no `any` |
| Supabase patterns — errors checked | ✅ | `if (error) console.error(...)` — consistent with sibling functions `cleanupExpiredNearMisses` and `cancelRevertedNearMisses` |
| Supabase patterns — no unbounded queries | ✅ | UPDATE queries; `.limit()` does not apply to bulk UPDATEs |
| Supabase patterns — not imported from `'use client'` | ✅ | Only imported in `watchlist-monitor.ts` (server-side) |
| TypeScript quality — no `any` types | ✅ | — |
| TypeScript quality — immutable patterns | ✅ | No in-place mutation |
| TypeScript quality — functions < 50 lines | ⚠️ | `detectNearMisses()` body is ~71 lines after +4 lines added. Pre-existing violation; this change adds 4 lines to an already oversized function |
| TypeScript quality — files < 800 lines | ✅ | `db.ts` ~733 lines; `watchlist-monitor.ts` 199 lines |
| TypeScript quality — named constants, no magic numbers | ✅ | `NEAR_MISS_UPPER` passed as argument |
| Security — no hardcoded secrets | ✅ | — |
| Security — parameterized queries | ✅ | Supabase client handles parameterization |
| Security — no sensitive data in logs | ✅ | Log messages contain only status labels |

---

## Task Checklist

- Completed: 4/4 applicable tasks (T-01, T-02, T-03, T-04 ✅)
- Blocked: 2/2 test tasks (T-05, T-06) — no test framework (jest/vitest) configured in project

---

## Findings

### CRITICAL (blocks merge)
None

### HIGH (should fix)
None

### MEDIUM (consider fixing)
- **T-05/T-06 — No unit tests written.** No test framework is configured in the project (`jest`/`vitest` absent from `package.json`). The FR-06 regression case (non-MR entries unaffected by cancellation) is not mechanically verified. Setting up a test framework is a project-level investment beyond this feature's scope, but the gap should be tracked.

### LOW (optional)
- **`detectNearMisses()` is ~71 lines**, exceeding the 50-line style guideline. Pre-existing issue (function was ~67 lines before this change). The 4 added lines are minimal. Consider extracting the cleanup preamble into a named helper (e.g., `runLifecycleCleanup()`) in a future refactor pass.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. The implementation satisfies all 13 verifiable requirements exactly as specified. The two warnings are a project-level infrastructure gap (no test runner) and a pre-existing style violation; neither blocks merge.
