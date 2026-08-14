# Tasks — Persist effectiveThreshold, newsAdjustment, sectorRotation into indicatorsAtBuy

## Pre-Implementation

- [x ] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts` — pre-authorized by Amaury per originating request)
- [x] Database migrations drafted (N/A — none needed, `jsonb` column already accepts ad-hoc keys)

## Implementation Checklist

### Phase 1 — Call Site 1 (immediate-buy path)
- [x] T-01: After the existing `indicatorsAtBuy.spx_*` assignments (`claude-agent.ts:2015-2018`), add:
      `indicatorsAtBuy.effectiveThreshold = effectiveThreshold`
      `indicatorsAtBuy.newsAdjustment = newsAdjustment`
      `indicatorsAtBuy.sectorRotation = sectorRotation`
      `indicatorsAtBuy.sectorRotationContext = sectorRotationContext`

### Phase 2 — Call Site 2 (ranking/best-candidate path)
- [x] T-02: After the existing `bestIndicatorsAtBuy.spx_*` assignments (`claude-agent.ts:2190-2193`), add the cycle-invariant pair directly:
      `bestIndicatorsAtBuy.sectorRotation = sectorRotation`
      `bestIndicatorsAtBuy.sectorRotationContext = sectorRotationContext`
- [x] T-03: Add the per-candidate pair, reading through `best.entry.indicators` with the same `TechnicalIndicators & Record<string, unknown>` cast already used to construct `indicatorsAtBuy`/`bestIndicatorsAtBuy` (per design.md's confirmed type-mechanics finding — required for `tsc --noEmit` to pass):
      `bestIndicatorsAtBuy.effectiveThreshold = (best.entry.indicators as TechnicalIndicators & Record<string, unknown>).effectiveThreshold`
      `bestIndicatorsAtBuy.newsAdjustment = (best.entry.indicators as TechnicalIndicators & Record<string, unknown>).newsAdjustment`

### Phase 3 — Testing
- [x] T-04: Test — call site 1: a simulated buy has `effectiveThreshold`, `newsAdjustment`, `sectorRotation`, `sectorRotationContext` all present and correct on the persisted indicators object
- [x] T-05: Test — call site 2 stale-variable trap: construct a scenario with ≥2 candidates in the ranking queue where the loop's last-processed symbol's `effectiveThreshold`/`newsAdjustment` differs from the winning candidate's own value; assert the persisted object carries the **winner's** value, not the last-looped one
- [x] T-06: Test — `sectorRotation`/`sectorRotationContext` are identical across both call sites within the same simulated cycle
- [x] T-07: Test — no existing field (`spx_*`, `state_fingerprint`, `tp_*`, `zle05_*`) is altered by this change at either call site

### Phase 4 — Verification
- [x] T-08: Run `npx tsc --noEmit` — passed, no errors (confirms the cast in T-03 resolves the type mismatch)
- [x] T-09: Run `npm run build` — passed, compiled successfully
- [x] T-10: Run full test suite — 320/320 tests passed (33 files), including the 6 new tests
- [x] T-11: `git diff --stat` shows only `claude-agent.ts` (+15/-0 lines) + the new test file changed

## Post-Implementation

- [x] Run `/review indicators-at-buy-persistence-fix` to verify implementation matches spec
- [x] Confirm no gate/signal-detection/sizing/execution logic changed — diff review limited to the two named object-construction blocks, confirmed via `git diff src/lib/claude-agent.ts`

## Estimated Complexity

Low — 8 total new assignment lines across two already-established construction blocks, no new functions, no type changes, no schema changes. The one non-trivial part is the call-site-2 cast (T-03), which is mechanical once identified (already identified in design.md) rather than a design decision.
