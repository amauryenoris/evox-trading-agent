import { describe, it, expect } from 'vitest'

// Replicates the two indicatorsAtBuy/bestIndicatorsAtBuy assignment blocks
// added in claude-agent.ts (call site 1: ~2015-2018 area; call site 2:
// ~2190-2193 + the best.entry.indicators reach-through) — decoupled per
// this project's pattern (see CLAUDE.md Test Patterns) to avoid importing
// the full 2000+ line runAgentCycle() and its heavy dependency graph.
// Keep in sync with claude-agent.ts if this assignment logic changes.

interface CandidateContext {
  symbol: string
  effectiveThreshold: number
  newsAdjustment: number
}

function applyCallSite1Fields(
  target: Record<string, unknown>,
  effectiveThreshold: number,
  newsAdjustment: number,
  sectorRotation: unknown,
  sectorRotationContext: string
): void {
  target.effectiveThreshold = effectiveThreshold
  target.newsAdjustment = newsAdjustment
  target.sectorRotation = sectorRotation
  target.sectorRotationContext = sectorRotationContext
}

// Mirrors the CORRECT call-site-2 fix: reads the per-candidate value off
// best.entry.indicators (captured at buyQueue push time), not the
// loop-scoped variable — which would hold the last-processed symbol's value.
function applyCallSite2FieldsCorrect(
  target: Record<string, unknown>,
  best: { entry: { indicators: CandidateContext } },
  sectorRotation: unknown,
  sectorRotationContext: string
): void {
  target.effectiveThreshold = best.entry.indicators.effectiveThreshold
  target.newsAdjustment = best.entry.indicators.newsAdjustment
  target.sectorRotation = sectorRotation
  target.sectorRotationContext = sectorRotationContext
}

// Mirrors the NAIVE/WRONG approach the spec explicitly rejects: directly
// referencing the outer per-symbol loop variables after the loop has
// finished, which hold the last-processed candidate's value.
function applyCallSite2FieldsNaive(
  target: Record<string, unknown>,
  lastLoopedEffectiveThreshold: number,
  lastLoopedNewsAdjustment: number,
  sectorRotation: unknown,
  sectorRotationContext: string
): void {
  target.effectiveThreshold = lastLoopedEffectiveThreshold
  target.newsAdjustment = lastLoopedNewsAdjustment
  target.sectorRotation = sectorRotation
  target.sectorRotationContext = sectorRotationContext
}

describe('call site 1 (immediate-buy path) — field assignment', () => {
  it('assigns effectiveThreshold, newsAdjustment, sectorRotation, and sectorRotationContext', () => {
    // Arrange
    const indicatorsAtBuy: Record<string, unknown> = { rsi: 50 }
    const sectorRotation = { gdx_relative_strength_pct: 1.2, xle_relative_strength_pct: -0.5, xlk_relative_strength_pct: 0.3 }

    // Act
    applyCallSite1Fields(indicatorsAtBuy, -1.42, -0.12, sectorRotation, 'Gold/Mining (GDX): +1.20% vs SPY (20d)')

    // Assert
    expect(indicatorsAtBuy.effectiveThreshold).toBe(-1.42)
    expect(indicatorsAtBuy.newsAdjustment).toBe(-0.12)
    expect(indicatorsAtBuy.sectorRotation).toEqual(sectorRotation)
    expect(indicatorsAtBuy.sectorRotationContext).toBe('Gold/Mining (GDX): +1.20% vs SPY (20d)')
  })
})

describe('call site 2 (ranking path) — stale-variable trap', () => {
  it('using the last-looped variable produces the WRONG value when it differs from the winner', () => {
    // Arrange — simulate a per-symbol loop processing AAPL then MSFT (MSFT last),
    // but the ranking phase picks AAPL as the winning candidate.
    const buyQueue: Array<{ symbol: string; entry: { indicators: CandidateContext } }> = [
      { symbol: 'AAPL', entry: { indicators: { symbol: 'AAPL', effectiveThreshold: -1.45, newsAdjustment: -0.15 } } },
      { symbol: 'MSFT', entry: { indicators: { symbol: 'MSFT', effectiveThreshold: -1.20, newsAdjustment: 0.10 } } },
    ]
    const best = buyQueue[0] // AAPL wins the ranking
    const lastLoopedSymbol = buyQueue[buyQueue.length - 1].entry.indicators // MSFT — last processed in the loop

    // Act
    const correctTarget: Record<string, unknown> = {}
    applyCallSite2FieldsCorrect(correctTarget, best, null, '')

    const naiveTarget: Record<string, unknown> = {}
    applyCallSite2FieldsNaive(naiveTarget, lastLoopedSymbol.effectiveThreshold, lastLoopedSymbol.newsAdjustment, null, '')

    // Assert — the two approaches diverge, proving the scoping bug is real
    expect(correctTarget.effectiveThreshold).toBe(-1.45)
    expect(correctTarget.newsAdjustment).toBe(-0.15)
    expect(naiveTarget.effectiveThreshold).toBe(-1.20)
    expect(naiveTarget.newsAdjustment).toBe(0.10)
    expect(correctTarget.effectiveThreshold).not.toBe(naiveTarget.effectiveThreshold)
    expect(correctTarget.newsAdjustment).not.toBe(naiveTarget.newsAdjustment)
  })

  it('the correct (entry.indicators-based) approach matches the winning candidate regardless of loop order', () => {
    // Arrange — winner is the LAST-processed candidate this time; correct approach must still match it
    const buyQueue: Array<{ symbol: string; entry: { indicators: CandidateContext } }> = [
      { symbol: 'NVDA', entry: { indicators: { symbol: 'NVDA', effectiveThreshold: -1.30, newsAdjustment: 0 } } },
      { symbol: 'TSLA', entry: { indicators: { symbol: 'TSLA', effectiveThreshold: -1.15, newsAdjustment: 0.15 } } },
    ]
    const best = buyQueue[1] // TSLA wins, and is also last in the loop

    // Act
    const target: Record<string, unknown> = {}
    applyCallSite2FieldsCorrect(target, best, null, '')

    // Assert
    expect(target.effectiveThreshold).toBe(-1.15)
    expect(target.newsAdjustment).toBe(0.15)
  })
})

describe('sectorRotation cycle-invariance across call sites', () => {
  it('sectorRotation and sectorRotationContext are identical for call site 1 and call site 2 within the same cycle', () => {
    // Arrange — a single cycle-wide sectorRotation snapshot, referenced at both call sites
    const sectorRotation = { gdx_relative_strength_pct: -2.1, xle_relative_strength_pct: 0.4, xlk_relative_strength_pct: 1.8 }
    const sectorRotationContext = 'Gold/Mining (GDX): -2.10% vs SPY (20d)'

    // Act
    const callSite1Target: Record<string, unknown> = {}
    applyCallSite1Fields(callSite1Target, -1.3, 0, sectorRotation, sectorRotationContext)

    const callSite2Target: Record<string, unknown> = {}
    const best = { entry: { indicators: { symbol: 'X', effectiveThreshold: -1.3, newsAdjustment: 0 } } }
    applyCallSite2FieldsCorrect(callSite2Target, best, sectorRotation, sectorRotationContext)

    // Assert
    expect(callSite1Target.sectorRotation).toEqual(callSite2Target.sectorRotation)
    expect(callSite1Target.sectorRotationContext).toBe(callSite2Target.sectorRotationContext)
  })
})

describe('existing fields are preserved (not altered by the new assignments)', () => {
  it('call site 1: pre-existing keys on indicatorsAtBuy survive untouched', () => {
    // Arrange — simulate the object already carrying spx_*/state_fingerprint before the new assignments run
    const indicatorsAtBuy: Record<string, unknown> = {
      rsi: 42,
      spx_price: 6500,
      spx_regime: 'BULL',
      state_fingerprint: { signal_type: 'MEAN_REVERSION', spx_regime: 'BULL', market_regime: 'RANGING', adx_bucket: 'LOW', z_bucket: 'DEEP', macd_bucket: 'POSITIVE' },
      tp_zscore: null,
    }
    const snapshot = { ...indicatorsAtBuy }

    // Act
    applyCallSite1Fields(indicatorsAtBuy, -1.3, 0, null, '')

    // Assert — pre-existing keys are byte-identical; only new keys were added
    for (const key of Object.keys(snapshot)) {
      expect(indicatorsAtBuy[key]).toEqual(snapshot[key])
    }
  })

  it('call site 2: pre-existing keys on bestIndicatorsAtBuy survive untouched', () => {
    // Arrange
    const bestIndicatorsAtBuy: Record<string, unknown> = {
      rsi: 55,
      spx_price: 6480,
      spx_regime: 'CAUTION',
      state_fingerprint: { signal_type: 'TREND_ZLE05', spx_regime: 'CAUTION', market_regime: 'TRANSITION', adx_bucket: 'MID', z_bucket: 'CONTINUATION', macd_bucket: 'POSITIVE' },
      zle05_zscore: 0.8,
    }
    const snapshot = { ...bestIndicatorsAtBuy }
    const best = { entry: { indicators: { symbol: 'X', effectiveThreshold: -1.2, newsAdjustment: 0.1 } } }

    // Act
    applyCallSite2FieldsCorrect(bestIndicatorsAtBuy, best, null, '')

    // Assert
    for (const key of Object.keys(snapshot)) {
      expect(bestIndicatorsAtBuy[key]).toEqual(snapshot[key])
    }
  })
})
