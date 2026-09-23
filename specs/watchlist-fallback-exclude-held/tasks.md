# Tasks — Exclude heldSymbols from the Static TRADING_WATCHLIST Fallback Path

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — ⚠️ REQUIRED: `src/lib/claude-agent.ts` is Protected Zone. Obtain fresh, explicit, in-conversation confirmation from Amaury before starting Phase 1 — this is separate from, and not satisfied by, spec approval alone.
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — claude-agent.ts

- [x] T-01: Re-verify current exact line numbers for the fallback watchlist block (currently ~1151-1182) and the `openPositionSymbols` declaration (currently ~1479) before editing — they may have shifted since this spec was written.
- [x] T-02: Relocate `const openPositionSymbols = new Set(positions.map((p) => p.symbol))` from its current location (~line 1479) to immediately before the `// 2. Dynamic stock selection` comment (~line 1151). Do not change its computation — `positions.map((p) => p.symbol)`, unchanged.
- [x] T-03: Delete the declaration from its original location (~line 1479) — do not leave a duplicate. The main loop's skip check (~line 1559, `if (openPositionSymbols.has(symbol))`) must resolve to the hoisted declaration; do not change that check's own logic.
- [x] T-04: In the fallback block's existing `.split(',').map((s) => s.trim()).filter(Boolean)` chain (~lines 1178-1181), append one more step: `.filter((s) => !openPositionSymbols.has(s))`. Do not change the `TRADING_WATCHLIST` env var name, its 9-symbol default list, or the existing `.split`/`.map`/`.filter(Boolean)` steps.
- [x] T-05: Confirm no blacklist or quality-filter logic is added to the fallback block — `INSTRUMENT_BLACKLIST` filtering remains solely at its existing location (~line 1554, now shifted to 1559 after the hoist).
- [x] T-06: Confirm the try/catch/`SelectionStepError` handling and both `insertSelectionFailure()` calls (~lines 1161-1177) are byte-for-byte unchanged.
- [x] T-07: Confirm the auto-entry injection block (`watchlist.push(sym)`, ~line 1273, now 1278 after the hoist) is byte-for-byte unchanged.
- [x] T-08: Confirm no top-up/refill logic was added anywhere — the fallback path may now return fewer than 9 symbols when positions are open; this is the intended, accepted behavior (parity with the dynamic path's already-shipped shape).

## Post-Implementation

- [x] T-09: Run `npx tsc --noEmit` — must pass with zero new errors.
- [x] T-10: Produce a diff-only view (`git diff -- src/lib/claude-agent.ts`) confirming exactly two changes: the relocated `openPositionSymbols` declaration and the new `.filter()` step — nothing else.
- [x] T-11: Confirm `src/lib/stock-selector.ts` is untouched (`git diff --stat -- src/lib/stock-selector.ts` shows no output) — this fallback path was always meant to bypass `selectStocksForAnalysis()` entirely, and continues to do so.
- [x] T-12: Run the existing test suite (`npx vitest run`) and confirm no regressions. Note: no existing test file references `TRADING_WATCHLIST` or `openPositionSymbols` directly (verified via grep before writing this spec) — a clean run is expected, not a coincidence.
- [ ] Run `/review watchlist-fallback-exclude-held` to verify implementation matches spec.
- [x] Confirm Protected Zone files unchanged except the explicitly-confirmed `claude-agent.ts` modification.

## Estimated Complexity

**Low** — mechanically, this is one relocated `const` declaration and one appended `.filter()` clause, both provably safe (a pure `Set` construction moved earlier in the same synchronous function scope, and an additive filter predicate). The only reason this isn't trivial-complexity is that `claude-agent.ts` is a Protected Zone file encoding live trading logic — treat the confirmation gate above as load-bearing, not procedural box-ticking.
