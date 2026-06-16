import { describe, it, expect } from 'vitest'
import type { MarketRegime } from '../types'

// Replicates the MR Ranging ADX gate from claude-agent.ts (meanReversionSignal /
// mrRangingAdxGateOk / meanReversionSetup). Keep in sync with the detection block
// when conditions change.
function evalMrGate(p: {
  zScore: number
  effectiveThreshold: number
  marketRegime: MarketRegime | null
  adx: number | null
  enableMrRangingAdxGate?: boolean
}): { signal: boolean; setup: boolean } {
  const enableMrRangingAdxGate = p.enableMrRangingAdxGate ?? true
  const mrRangingAdxFloor = 18
  const adxValue = p.adx

  const meanReversionSignal = p.zScore <= p.effectiveThreshold

  const hasValidAdx =
    typeof adxValue === 'number' &&
    Number.isFinite(adxValue)

  const mrRangingAdxGateOk =
    !enableMrRangingAdxGate ||
    !(
      p.marketRegime === 'RANGING' &&
      hasValidAdx &&
      adxValue < mrRangingAdxFloor
    )

  return {
    signal: meanReversionSignal,
    setup: meanReversionSignal && mrRangingAdxGateOk,
  }
}

const BASE_THRESHOLD = -1.3
const RELAXED_THRESHOLD = -1.2

describe('MR Ranging ADX gate — blocks RANGING + ADX < 18', () => {
  it('blocks NEM profile: RANGING, ADX 13.0, z=-1.81', () => {
    const r = evalMrGate({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 13.0 })
    expect(r.signal).toBe(true)
    expect(r.setup).toBe(false)
  })

  it('blocks UUUU profile: RANGING, ADX 15.2, z=-1.57', () => {
    const r = evalMrGate({ zScore: -1.57, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 15.2 })
    expect(r.signal).toBe(true)
    expect(r.setup).toBe(false)
  })

  it('blocks RBLX profile: RANGING, ADX 16.4, z=-3.18', () => {
    const r = evalMrGate({ zScore: -3.18, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 16.4 })
    expect(r.signal).toBe(true)
    expect(r.setup).toBe(false)
  })

  it('blocks edge case below floor: RANGING, ADX 17.6, z=-1.28 (news-relaxed threshold)', () => {
    const r = evalMrGate({ zScore: -1.28, effectiveThreshold: RELAXED_THRESHOLD, marketRegime: 'RANGING', adx: 17.6 })
    expect(r.signal).toBe(true)
    expect(r.setup).toBe(false)
  })
})

describe('MR Ranging ADX gate — passes non-RANGING regimes', () => {
  it('passes OXY profile: HIGH_VOLATILITY, ADX 17.6, z=-1.28 despite ADX < 18', () => {
    const r = evalMrGate({ zScore: -1.28, effectiveThreshold: RELAXED_THRESHOLD, marketRegime: 'HIGH_VOLATILITY', adx: 17.6 })
    expect(r.setup).toBe(true)
  })

  it('passes TRANSITION, ADX 22.7, z=-1.92', () => {
    const r = evalMrGate({ zScore: -1.92, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'TRANSITION', adx: 22.7 })
    expect(r.setup).toBe(true)
  })

  it('passes HIGH_VOLATILITY, ADX 27.1, z=-1.42', () => {
    const r = evalMrGate({ zScore: -1.42, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'HIGH_VOLATILITY', adx: 27.1 })
    expect(r.setup).toBe(true)
  })

  it('passes TRENDING, ADX 32.4, z=-2.53', () => {
    const r = evalMrGate({ zScore: -2.53, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'TRENDING', adx: 32.4 })
    expect(r.setup).toBe(true)
  })

  it('passes null regime, ADX 13.0, z=-1.81 (regime unknown is not RANGING)', () => {
    const r = evalMrGate({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: null, adx: 13.0 })
    expect(r.setup).toBe(true)
  })
})

describe('MR Ranging ADX gate — ADX floor boundary', () => {
  it('passes RANGING, ADX 18.1, z=-1.81 (above floor)', () => {
    const r = evalMrGate({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 18.1 })
    expect(r.setup).toBe(true)
  })

  it('passes RANGING, ADX exactly 18.0 (gate is strict <)', () => {
    const r = evalMrGate({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: 18.0 })
    expect(r.setup).toBe(true)
  })
})

describe('MR Ranging ADX gate — fail-open on invalid ADX', () => {
  it('passes RANGING, ADX NaN (corrupt data does not block)', () => {
    const r = evalMrGate({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: NaN })
    expect(r.setup).toBe(true)
  })

  it('passes RANGING, ADX null (missing data does not block)', () => {
    const r = evalMrGate({ zScore: -1.81, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'RANGING', adx: null })
    expect(r.setup).toBe(true)
  })
})

describe('MR Ranging ADX gate — toggle and signal precedence', () => {
  it('setup === signal for all blocked profiles when gate disabled', () => {
    const profiles = [
      { zScore: -1.81, adx: 13.0 },
      { zScore: -1.57, adx: 15.2 },
      { zScore: -3.18, adx: 16.4 },
      { zScore: -1.28, adx: 17.6 },
    ]
    for (const p of profiles) {
      const r = evalMrGate({
        zScore: p.zScore,
        effectiveThreshold: RELAXED_THRESHOLD,
        marketRegime: 'RANGING',
        adx: p.adx,
        enableMrRangingAdxGate: false,
      })
      expect(r.setup).toBe(r.signal)
      expect(r.setup).toBe(true)
    }
  })

  it('no signal (z above threshold) → no setup regardless of gate', () => {
    const r = evalMrGate({ zScore: -0.9, effectiveThreshold: BASE_THRESHOLD, marketRegime: 'TRENDING', adx: 32.4 })
    expect(r.signal).toBe(false)
    expect(r.setup).toBe(false)
  })
})
