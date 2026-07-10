# Tasks — Normalize sell_timestamp Precision

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed (`src/lib/claude-agent.ts:1060`)
- [X] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Helper
- [x] T-01: In `src/lib/alpaca.ts`, add `export function normalizeTimestampPrecision(iso: string): string` near `AlpacaOrder`/`getOrders`/`getLatestSellOrder`. Implementation: `return new Date(iso).toISOString()`.

### Phase 2 — getLatestSellOrder (alpaca.ts:299-315)
- [x] T-02: Update the filter at line ~310 to compare `normalizeTimestampPrecision(o.filled_at)` against `normalizeTimestampPrecision(afterTimestamp)` instead of the raw strings.
- [x] T-03: Update the sort callback at line ~314 to compare normalized `filled_at` values on both sides instead of the raw strings.
- [x] T-04: Confirm the returned `AlpacaOrder` objects (both from `.filter()` and the final `[0]`) still carry the original, unmodified `filled_at` — normalization must be local to the comparison expressions only, never assigned back onto the order object.

### Phase 3 — Write point (claude-agent.ts:1060, Protected Zone)
- [x] T-05: Import `normalizeTimestampPrecision` from `./alpaca` in `claude-agent.ts` (or confirm it's already imported via the existing `alpaca.ts` import if one exists — check current import list first).
- [x] T-06: Change line 1060 from `const sellTimestamp = sellOrder?.filled_at ?? timestamp` to `const sellTimestamp = normalizeTimestampPrecision(sellOrder?.filled_at ?? timestamp)`.
- [x] T-07: Confirm no other line in `claude-agent.ts` changes — `sellTimestamp` at line 1072 (`agent_log.timestamp`) and the `evaluateClosedTrade()` call at line 1062 (`trade_evaluations.sell_timestamp`) both consume the now-normalized variable with no further edits needed there.

### Phase 4 — Testing
- [x] T-08: Unit test `normalizeTimestampPrecision('2026-04-30T14:25:59.639949215Z')` returns `'2026-04-30T14:25:59.639Z'`.
- [x] T-09: Unit test `normalizeTimestampPrecision('2026-06-09T16:19:01.019Z')` returns the same value unchanged (already 3-digit).
- [x] T-10: Unit test `normalizeTimestampPrecision` against the other observed live precisions (5-digit, 6-digit) to confirm consistent 3-digit-ms output for each.
- [x] T-11: Unit test `getLatestSellOrder()` with synthetic orders sharing an identical timestamp prefix but differing only in trailing precision digits (the theoretical defect case) — confirmed via two tests: (1) mixed-precision fills across distinct seconds still select the true chronological winner (`b` at 15:24, despite fewer digits than `c`), and (2) a same-millisecond prefix-collision now safely ties (excluded by strict `>`) instead of being reversed by the old raw-string 'Z'-vs-digit artifact. `normalizeTimestampPrecision` unit test confirms colliding prefixes normalize to an identical value (no longer distinguishable by the old bug).
- [x] T-12: Unit test `getLatestSellOrder()` regression — distinct, non-colliding timestamps (different seconds, symbols, sides) still filter/sort identically to current behavior.
- [x] T-13: Unit test `getLatestSellOrder()`'s return value still exposes the original, unnormalized `filled_at` on the returned `AlpacaOrder` (only comparisons were normalized).
- [x] T-14: Run full existing suite (`npm test`) — confirm `ioc-fill-verification.test.ts` and all other tests still pass unmodified.
- [x] T-15: Coverage — `vitest.config.ts`'s `coverage.include` is scoped to `src/lib/db.ts` only (per existing project convention), so v8 cannot emit a numeric % for `alpaca.ts`/`claude-agent.ts`; not widening that shared config as part of this fix (out of scope). Verified by code-path inspection instead: all 4 branches of `normalizeTimestampPrecision` usage are exercised (already-3-digit passthrough, 5/6/9-digit truncation, prefix-collision tie), and both modified `getLatestSellOrder` comparison sites (filter line 322, sort line ~326) are hit by every test in the new file.

## Post-Implementation

- [x] Run `/review fix-sell-timestamp-precision-normalization` to verify implementation matches spec — see `review.md`, APPROVED
- [x] Confirm Protected Zone diff is exactly the one-line change at `claude-agent.ts:1060` (plus import) — no unrelated changes (`git diff --stat`: 3 lines changed in `claude-agent.ts`, matching 1 import line + 1 wrapped expression)
- [x] Run `npx tsc --noEmit` — passes (no output, exit clean)
- [x] Run `npm run build` — passes (compiled successfully, all routes generated)
- [x] Confirm (via Supabase read query, not a code change) that no row in `trade_evaluations` or `agent_log` was modified by this change alone — row counts unchanged: `trade_evaluations` 56/56, `agent_log` ghost_close 13/13, matching the diagnostic's baseline exactly

## Estimated Complexity

**Low** — one new pure helper function (~1 line of logic), two comparison-site edits in an existing function, one wrapped expression in a Protected Zone file. No new files, no DB migration, no API/UI surface. The bulk of the effort is already done (3 rounds of diagnostics established root cause, scope, and safety). Test-writing is the largest remaining chunk of work.
