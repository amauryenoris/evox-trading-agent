# Tasks — PositionsTable ACTIVATION_PCT: Add TREND_PULLBACK_3DAY

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, this file is not in the Protected Zone
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Dashboard constant fix (only phase)
- [x] T-01: In `src/components/dashboard/PositionsTable.tsx`, add `TREND_PULLBACK_3DAY: 0.06,` to the existing `ACTIVATION_PCT` object literal (currently lines 7-13), without changing any of the 5 existing key-value pairs or reformatting the object beyond this one addition.
- [x] T-02: Verify the 5 existing entries are byte-for-byte unchanged (diff review).
- [x] T-03: Verify no other line in the file changed — particularly that line 37's consumption of `ACTIVATION_PCT` is untouched.

### Phase 2 — Verification
- [x] T-04: Run `npx tsc --noEmit` — must pass.
- [x] T-05: Run `npm run build` — must pass.
- [x] T-06: Run the full test suite (`npx vitest run`) — all existing tests must pass unmodified; report which test files ran. Confirm (via repo search) that no test file references `PositionsTable` or `ACTIVATION_PCT` — if the search turns up a match not identified during spec authoring, treat that as a spec gap and stop rather than silently adjusting a test.
- [x] T-07: Manually confirm (via a throwaway script or direct inspection of the object literal — not a new permanent test file, since none was requested) that `ACTIVATION_PCT['TREND_PULLBACK_3DAY']` now equals `0.06`, and that the fallback `ACTIVATION_PCT[signal] ?? 0.05` still returns `0.05` for an unrecognized key.
- [x] T-08: Report the final line count of `PositionsTable.tsx`.

## Post-Implementation

- [x] Run `/review positions-table-activation-pct-3day` to verify implementation matches spec
- [x] Confirm no other files changed (this fix should touch exactly one file)

## Estimated Complexity

Low — a single key-value pair added to an existing object literal in a non-Protected-Zone file, with no logic, type, or test changes required beyond verification.
