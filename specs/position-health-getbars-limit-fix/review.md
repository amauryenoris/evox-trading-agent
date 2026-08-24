# Review Report — Fix Stale current_price in Position Health Monitor (getBars limit)

**Date**: 2026-08-24
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Explicit `limit` on the SPY `getBars()` call, matching `daysBack` | ✅ SATISFIED | `scripts/position-health-check.ts:80` — `getBars('SPY', '1Day', 400, 400)` |
| FR-02 | Explicit `limit` on the per-symbol `getBars()` call, matching `daysBack` | ✅ SATISFIED | `scripts/position-health-check.ts:98` — `getBars(ctx.symbol, '1Day', 400, 400)` |
| FR-03 | `daysBack` stays `400` on both calls — only `limit` added | ✅ SATISFIED | Diff shows `400)` → `400, 400)` on both lines — the pre-existing `daysBack` argument is untouched |
| NFR-01 | No other line/branch/log statement changed | ✅ SATISFIED | Diff is exactly 2 lines changed, both `getBars()` call sites — every catch block, log line, and the insert logic are byte-identical |
| NFR-02 | `getBars()`/`alpaca.ts` defaults untouched | ✅ SATISFIED | `git diff -- src/lib/alpaca.ts` is empty |
| NFR-03 | `claude-agent.ts` and its own `getBars()` calls untouched | ✅ SATISFIED | `git diff -- src/lib/claude-agent.ts` is empty |
| NFR-04 | `npx tsc --noEmit` passes, confirming `scripts/` is in TS check scope | ✅ SATISFIED | Independently re-ran `npx tsc --noEmit` for this review — zero errors |
| C-01 | Protected Zone untouched, `scripts/**` is Touch-freely | ✅ SATISFIED | All 7 Protected Zone files diff-clean; `scripts/position-health-check.ts` is the only file changed |
| C-02 | No schema/migration change | ✅ SATISFIED | No migration file in `git status` |
| C-03 | `calculateAllIndicators()`/`state-fingerprint.ts` untouched | ✅ SATISFIED | Neither file appears in `git status` |
| C-04 | Confined to exactly two call sites in exactly one file | ✅ SATISFIED | Grep for `getBars(` in the file (performed during implementation) returned exactly lines 80 and 98, both updated; `git status` shows exactly one file modified for this feature |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No Protected Zone file touched. `scripts/position-health-check.ts` is explicitly "Touch freely" per `CLAUDE.md`'s file permission matrix — no confirmation was required, and none was needed.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | This script makes zero Claude calls (confirmed in the original diagnostic — no `@anthropic-ai/sdk` import); not applicable |
| Supabase patterns | ➖ N/A | No Supabase query changed — the existing `db.from('position_health_snapshots').insert(rows)` call is untouched by this diff |
| TypeScript quality | ✅ | No `any` introduced; no mutation (the fix only widens an existing function-call argument); the two touched functions/blocks are unchanged in length; file stays well under 800 lines; `400` is not a "new" magic number — it's the pre-existing `daysBack` value now also passed as `limit`, matching the already-established `(sym, '1Day', 300, 300)` precedent in `claude-agent.ts` |
| Security | ✅ | No secrets, no injection surface, no sensitive data in any log statement (unchanged) |

## Task Checklist

- Completed: 8/8 implementation tasks (`T-01`–`T-08`), plus all 3 Pre-Implementation checkboxes

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- Per `requirements.md`'s own Out of Scope section, the ~180+ already-written `position_health_snapshots` rows with stale `current_price` values are not backfilled by this fix (by design — this fix only prevents new stale writes going forward). If historical accuracy of that table matters for any downstream analysis, a separate backfill/cleanup task would be needed — not a defect in this implementation, just a reminder of the stated scope boundary.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. This closes the confirmed root cause of the Position Health Monitor's stale `current_price` (and by extension, the previously-unexplained OXY Kalman-sign-discrepancy finding).
