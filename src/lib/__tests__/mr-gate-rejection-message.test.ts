import { describe, it, expect } from 'vitest'
import type { MarketRegime } from '../types'

// Replicates the rejection-message branch from claude-agent.ts's
// `if (!setup_detected)` block (mrGateBlocked sub-case + genuine no-setup case).
// Keep in sync with the detection block when conditions change.
function buildRejection(p: {
  zScore: number
  effectiveThreshold: number
  marketRegime: MarketRegime | null
  adx: number | null
}): { reasoning: string; error: string | undefined } {
  const mrRangingAdxFloor = 18
  const adxValue = p.adx

  const meanReversionSignal = p.zScore <= p.effectiveThreshold

  const hasValidAdx =
    typeof adxValue === 'number' &&
    Number.isFinite(adxValue)

  const mrRangingAdxGateOk =
    !(
      p.marketRegime === 'RANGING' &&
      hasValidAdx &&
      adxValue < mrRangingAdxFloor
    )

  const mrGateBlocked = meanReversionSignal && !mrRangingAdxGateOk

  if (mrGateBlocked) {
    return {
      reasoning: `Mean reversion signal triggered (z-score ${p.zScore.toFixed(3)} <= ${p.effectiveThreshold.toFixed(2)}) but blocked by RANGING+low-ADX gate (ADX ${adxValue !== null ? adxValue.toFixed(1) : 'null'} < ${mrRangingAdxFloor})`,
      error: `MR_RANGING_ADX_GATE: z-score ${p.zScore.toFixed(3)} met entry threshold ${p.effectiveThreshold.toFixed(2)}, blocked — regime=RANGING, ADX=${adxValue !== null ? adxValue.toFixed(1) : 'null'} < ${mrRangingAdxFloor}`,
    }
  }

  return {
    reasoning: `Setup gate: no mean reversion setup (z-score ${p.zScore.toFixed(3)} > ${p.effectiveThreshold.toFixed(2)}) and no trend setup (price not above EMA50)`,
    error: undefined,
  }
}

const BASE_THRESHOLD = -1.3

describe('MR gate rejection message — gate-blocked sub-case', () => {
  it('NEM profile: z=-1.81 meets threshold but RANGING+ADX13.0 blocks — reasoning states signal triggered, not "z-score > threshold"', () => {
    const r = buildRejection({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 13.0 })
    expect(r.reasoning).toContain('signal triggered')
    expect(r.reasoning).not.toContain('z-score -1.810 > -1.30')
    expect(r.error).toMatch(/^MR_RANGING_ADX_GATE:/)
  })

  it('UUUU profile: z=-1.57, RANGING, ADX 15.2 — error is non-empty and prefixed', () => {
    const r = buildRejection({ zScore: -1.57, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 15.2 })
    expect(r.error).toBe('MR_RANGING_ADX_GATE: z-score -1.570 met entry threshold -1.30, blocked — regime=RANGING, ADX=15.2 < 18')
  })

  it('handles null ADX gracefully in the error string (gate would not have fired, but guards formatting)', () => {
    const r = buildRejection({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: null })
    // null ADX fails-open the gate (hasValidAdx=false) — this is the genuine no-setup path
    expect(r.error).toBeUndefined()
  })
})

describe('MR gate rejection message — genuine no-setup case (unchanged)', () => {
  it('z-score above threshold, no signal at all — reasoning unchanged, error undefined', () => {
    const r = buildRejection({ zScore: -0.5, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'TRENDING', adx: 32.4 })
    expect(r.reasoning).toBe('Setup gate: no mean reversion setup (z-score -0.500 > -1.30) and no trend setup (price not above EMA50)')
    expect(r.error).toBeUndefined()
  })

  it('signal present but non-RANGING regime — never reaches mrGateBlocked, not applicable here (setup_detected would be true upstream)', () => {
    const r = buildRejection({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'TRENDING', adx: 13.0 })
    expect(r.error).toBeUndefined()
  })
})
