# Tasks — Fix Stale current_price in Position Health Monitor (getBars limit)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A — `scripts/**` is "Touch freely", no protected file touched)
- [x] Database migrations drafted (N/A — no schema change)

## Implementation Checklist

### Phase 1 — Fix
- [x] T-01: In `scripts/position-health-check.ts:80`, change `getBars('SPY', '1Day', 400)` to `getBars('SPY', '1Day', 400, 400)` — no other change to that line
- [x] T-02: In `scripts/position-health-check.ts:98`, change `getBars(ctx.symbol, '1Day', 400)` to `getBars(ctx.symbol, '1Day', 400, 400)` — no other change to that line
- [x] T-03: Grepped the file for every `getBars(` occurrence — confirmed exactly these two call sites exist (lines 80, 98) and both are updated; nothing else needs the same fix

### Phase 2 — Verification
- [x] T-04: Ran `npx tsc --noEmit` — passed with zero errors, confirming `scripts/` is in the TypeScript check scope per `tsconfig.json`
- [x] T-05: Ran `npm run build` — passed
- [x] T-06: Confirmed no test file exists for this script (`Glob` for `*position-health-check*` in `src/lib/__tests__/` returned nothing) — N/A per requirements.md's Out of Scope, not a gap
- [x] T-07: Diff-reviewed `scripts/position-health-check.ts` — confirmed the only changes are the two `, 400` additions; every catch block, log statement, and the insert logic are byte-identical
- [x] T-08: Confirmed `alpaca.ts` and `claude-agent.ts` have zero diff

## Post-Implementation

- [ ] Run `/review position-health-getbars-limit-fix` to verify implementation matches spec
- [ ] Confirm `getBars()`'s defaults in `alpaca.ts`, and all of `claude-agent.ts`'s own `getBars()` calls, are unchanged

## Estimated Complexity

Low — a two-character-intent, two-line parameter fix in a single standalone script, with a confirmed root cause (both from code inspection and live-data cross-check) and a working precedent already in production to match against.
