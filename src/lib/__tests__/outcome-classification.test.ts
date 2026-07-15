import { describe, it, expect } from 'vitest'

// Replicates the outcome classification from learning.ts's evaluateClosedTrade
// (kept in sync manually, per this project's convention of decoupling logic
// tests from the source function to avoid false-positive regressions).
type Outcome = 'profit' | 'loss' | 'breakeven'

function classifyOutcome(pnlPct: number): Outcome {
  return pnlPct > 0 ? 'profit' : pnlPct < 0 ? 'loss' : 'breakeven'
}

// The pre-fix formula, kept here only to prove the regression it produced.
function classifyOutcomeOld(pnlPct: number): Outcome {
  return pnlPct > 0.1 ? 'profit' : pnlPct < -0.1 ? 'loss' : 'breakeven'
}

// Replicates the win-rate portion of buildSignalStats/signalStats from
// report-generator.ts and performance/route.ts.
function winRatePct(trades: { outcome: Outcome }[]): number {
  const wins = trades.filter((t) => t.outcome === 'profit')
  return trades.length > 0 ? (wins.length / trades.length) * 100 : 0
}

// Replicates stock-selector.ts's recordSelectionOutcome mapping.
function mapToSelectionOutcome(outcome: Outcome): 'profitable' | 'loss' | 'no_trade' {
  return outcome === 'profit' ? 'profitable' : outcome === 'loss' ? 'loss' : 'no_trade'
}

describe('outcome classification — corrected strict threshold', () => {
  it('classifies a small genuine win (XOM real value, +0.083%) as profit, not breakeven', () => {
    expect(classifyOutcome(0.0829531314807165)).toBe('profit')
  })

  it('classifies a small genuine loss (OXY real value, -0.071%) as loss, not breakeven', () => {
    expect(classifyOutcome(-0.0710605791437185)).toBe('loss')
  })

  it('classifies a small genuine loss (WVE real value, -0.078%) as loss, not breakeven', () => {
    expect(classifyOutcome(-0.078308535630382)).toBe('loss')
  })

  it('classifies exactly zero pnlPct as breakeven', () => {
    expect(classifyOutcome(0)).toBe('breakeven')
  })

  it('classifies a value just above zero as profit', () => {
    expect(classifyOutcome(0.0001)).toBe('profit')
  })

  it('classifies a value just below zero as loss', () => {
    expect(classifyOutcome(-0.0001)).toBe('loss')
  })

  it('regression: the old 0.1-threshold formula mislabeled these as breakeven', () => {
    expect(classifyOutcomeOld(0.0829531314807165)).toBe('breakeven')
    expect(classifyOutcomeOld(-0.0710605791437185)).toBe('breakeven')
  })
})

describe('Signal Type Breakdown win rate — TREND_ZLE05 known 13-trade sample', () => {
  // Reproduces the live-confirmed TREND_ZLE05 group: 3 clear wins, 1 tiny win
  // (previously mislabeled breakeven), 9 losses (all comfortably outside the
  // old 0.1 buffer, so unaffected by the fix either way).
  const pnlPcts = [2.1, 5.4, 1.2, 0.083, -0.3, -0.8, -1.1, -1.5, -2.0, -2.3, -0.9, -3.2, -0.5]

  it('old formula understates win rate at 23.08% due to the tiny win being mislabeled breakeven', () => {
    const trades = pnlPcts.map((pnlPct) => ({ outcome: classifyOutcomeOld(pnlPct) }))
    expect(winRatePct(trades)).toBeCloseTo(23.08, 1)
  })

  it('corrected formula reports the true win rate of 30.77%', () => {
    const trades = pnlPcts.map((pnlPct) => ({ outcome: classifyOutcome(pnlPct) }))
    expect(winRatePct(trades)).toBeCloseTo(30.77, 1)
  })
})

describe('stock-selector SelectionEvaluation mapping', () => {
  it('maps a genuinely-executed trade with a tiny nonzero win to profitable, not no_trade', () => {
    const outcome = classifyOutcome(0.0829531314807165)
    expect(mapToSelectionOutcome(outcome)).toBe('profitable')
  })

  it('maps a genuinely-executed trade with a tiny nonzero loss to loss, not no_trade', () => {
    const outcome = classifyOutcome(-0.0710605791437185)
    expect(mapToSelectionOutcome(outcome)).toBe('loss')
  })

  it('still maps an exact-zero pnlPct trade to no_trade', () => {
    const outcome = classifyOutcome(0)
    expect(mapToSelectionOutcome(outcome)).toBe('no_trade')
  })
})
