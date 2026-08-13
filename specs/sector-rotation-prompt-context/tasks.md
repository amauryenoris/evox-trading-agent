# Tasks — Sector Rotation Prompt Context

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts` — pre-authorized by Amaury per originating request)
- [X] Database migrations drafted (N/A — none needed)

## Implementation Checklist

### Phase 1 — Pure Calculation Module
- [x] T-01: Create `src/lib/sector-rotation.ts` with `SectorRotationSnapshot` interface (`gdx_relative_strength_pct`, `xle_relative_strength_pct`, `xlk_relative_strength_pct`, all `number | null`)
- [x] T-02: Implement `computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)` — 20-day lookback, `bars.length - 2` anti-lookahead reference index, returns `null` for a sector when its own bars or SPY's bars are insufficient (per FR-03/04/05)
- [x] T-03: Implement `formatSectorRotationContext(snapshot)` — plain-text, one line per sector (GDX/XLE/XLK), "no data" fallback per sector when `null` (per FR-06/07)

### Phase 2 — Cycle Orchestration (claude-agent.ts)
- [x] T-04: Import `computeSectorRotation` and `formatSectorRotationContext` from `./sector-rotation`
- [x] T-05: Extend the cycle-start `Promise.all` (currently claude-agent.ts:990-1000) with GDX, XLE, XLK `getBars('<SYM>', '1Day', 400)` calls, each with its own `.catch((err) => { console.error('[SECTOR_ROTATION] <SYM> fetch failed:', err); return [] })`
- [x] T-06: Immediately after `computeSpxSnapshot(spyBars)`, compute `sectorRotation` and `sectorRotationContext`, and log `[SECTOR_ROTATION]` with the snapshot (per FR-10)

### Phase 3 — Prompt Injection (claude-agent.ts)
- [x] T-07: Add `sectorRotationContext: string = ''` as a new trailing optional parameter to `buildEnrichedPrompt()`
- [x] T-08: Insert the conditional "SECTOR ROTATION" section into the template, between the MACRO & MARKET CONTEXT section (`${macroContext}`) and the RECENT NEWS section, using the `watchlistContext`-style non-empty conditional
- [x] T-09: Pass `sectorRotationContext` at the sole `buildEnrichedPrompt()` call site (claude-agent.ts:1784-1795)

### Phase 4 — Testing
- [x] T-10: Write unit tests for `computeSectorRotation()` in `src/lib/__tests__/sector-rotation.test.ts` — covers: normal case, insufficient sector history (`null` for that sector only), insufficient SPY history (`null` for all three), zero-division guard on `pastClose === 0`
- [x] T-11: Write unit tests for `formatSectorRotationContext()` — covers: all-data case, mixed data/no-data case, all-null case, sign formatting (`+`/`-` prefix)
- [x] T-12: Verify 80%+ coverage on `src/lib/sector-rotation.ts`

## Post-Implementation

- [x] Run `/review sector-rotation-prompt-context` to verify implementation matches spec
- [x] Confirm no other `claude-agent.ts` behavior (gates, signal detection, position sizing) changed beyond what's described here — verified via `git diff src/lib/claude-agent.ts`: only the import, `Promise.all` extension, `sectorRotation`/`sectorRotationContext` computation + log, `buildEnrichedPrompt()` signature/template, and the one call site are touched

## Estimated Complexity

Low — one new ~35-line pure-calculation file with a direct test precedent (`state-fingerprint.ts` / `compute-spx-snapshot-window.test.ts`), plus a mechanical, single-call-site extension of an already-optional-parameter pattern in `claude-agent.ts`. No new I/O patterns, no schema changes, no gate logic.
