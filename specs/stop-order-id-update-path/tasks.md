# Tasks — stop-order-id-update-path (CHANGE 3a)

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed (if applicable) — N/A, `db.ts` is not in the Protected Zone
- [x ] Database migrations drafted (if applicable) — N/A, `stop_order_id` column already exists

## Implementation Checklist

### Phase 1 — Data layer write path
- [x] T-01: In `src/lib/db.ts`, extend `updatePositionContext()`'s `.update({...})` object (currently lines 205-219) with a 5th field: `stop_order_id: updates.stopOrderId`. Do not change how the existing 4 fields are written.

### Phase 2 — Verification
- [x] T-02: Read the modified `updatePositionContext()` and confirm it now writes exactly 5 fields — nothing added or removed besides the one new line.
- [x] T-03: Grep the repo to confirm no new call site passing `stopOrderId` to `updatePositionContext()` was introduced (that wiring is CHANGE 3b, out of scope here). (Only the 2 pre-existing call sites in claude-agent.ts:260,294 — neither passes stopOrderId.)
- [x] T-04: Run `npx tsc --noEmit` — confirm no new type errors.
- [x] T-05: Run `npm run build` — confirm it passes.
- [x] T-06: Run the existing test suite (`npx vitest run`) — confirm all pass unmodified, and report which test files ran. (297/297 passed, 29 files)

## Post-Implementation

- [x] Run `/review stop-order-id-update-path` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (they are not touched by this feature)

## Estimated Complexity

Low — a single 1-line addition to an existing object literal in a non-Protected-Zone file, no new call sites, no new types, no migration.
