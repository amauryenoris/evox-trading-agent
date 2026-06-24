# Tasks — Fix SPX Snapshot Insufficient SMA200 Window

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Amaury has confirmed Protected Zone change in `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — Root cause fix (Protected Zone)

- [x] T-01: In `src/lib/claude-agent.ts:870`, change `getBars('SPY', '1Day', 260)` to `getBars('SPY', '1Day', 400)`, matching the proven-sufficient margin already used in `scripts/backfill-spx-regime.ts:74`.

### Phase 2 — Testing

- [x] T-02: Create `src/lib/__tests__/compute-spx-snapshot-window.test.ts` (replicating `computeSpxSnapshot`/`smaAt` inline, per project convention) covering:
  - A synthetic 260-calendar-day-equivalent bars array (~180 bars) → confirms `spx_sma200`/`spx_regime` are null and `spx_sma50` is also null (reproducing today's bug, as a regression guard documenting the *old* behavior was indeed broken)
  - A synthetic 400-calendar-day-equivalent bars array (~276 bars) → confirms `spx_sma200`, `spx_sma50`, `spx_regime` are all populated (non-null)
  - Exactly 201 bars (the documented minimum) → confirms successful computation at the boundary
  - 200 bars (one short of minimum) → confirms `spx_sma200` is still null at this boundary (guards the off-by-one in `refIndex = bars.length - 2`)
- [x] T-03: Run `npx tsc --noEmit` — must exit 0 with no errors.
- [x] T-04: Run `npm run build` — must pass.
- [ ] T-05: Manual verification — on the next live agent cycle, confirm via the `[MACRO_SPX]` console log line that `sma50`/`sma200`/`regime` are no longer `null` (not just `price`).
- [ ] T-06: Manual verification — confirm via Supabase that a newly-opened position's `open_position_contexts.indicators` contains non-null `spx_sma50`/`spx_sma200`/`spx_regime`.

## Post-Implementation

- [x] Run `/review fix-spx-snapshot-insufficient-sma200-window` to verify implementation matches spec
- [x] Confirm only `src/lib/claude-agent.ts` was modified — no other Protected Zone files touched
- [x] Confirm `computeSpxSnapshot()`'s internal logic is byte-for-byte unchanged (only the `getBars` call-site argument changed)

## Estimated Complexity

**Low** — One numeric argument change at one call site, reusing an already-validated margin from an existing script, plus tests. No schema change, no new abstractions, no behavior change to trade execution.
