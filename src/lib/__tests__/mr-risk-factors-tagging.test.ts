import { describe, it, expect } from 'vitest'
import type { MarketRegime } from '../types'

// Replicates the mrRiskFactors computation from claude-agent.ts (immediately after
// meanReversionSetup). Keep in sync with the detection block when conditions change.
const mrRangingAdxFloor = 18

function computeMrRiskFactors(p: {
  meanReversionSignal: boolean
  adx: number | null
  marketRegime: MarketRegime | null
  distanceToEma50Pct: number | null
}): string[] | null {
  const adxValue = p.adx
  const hasValidAdx =
    typeof adxValue === 'number' &&
    Number.isFinite(adxValue)

  return !p.meanReversionSignal ? null : [
    hasValidAdx && adxValue < mrRangingAdxFloor ? 'LOW_ADX' : null,
    p.marketRegime === 'RANGING' ? 'RANGING' : null,
    p.distanceToEma50Pct !== null && p.distanceToEma50Pct < -15 ? 'DEEP_EXTENSION' : null,
  ].filter((v): v is string => Boolean(v))
}

describe('mrRiskFactors — independent observability tags per MR evaluation', () => {
  it('signal=false — returns null regardless of other inputs', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: false,
      adx: 10,
      marketRegime: 'RANGING',
      distanceToEma50Pct: -20,
    })

    expect(result).toBeNull()
  })

  it('signal=true, all three factors firing — returns all three tags', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 13.0,
      marketRegime: 'RANGING',
      distanceToEma50Pct: -16,
    })

    expect(result).toEqual(['LOW_ADX', 'RANGING', 'DEEP_EXTENSION'])
  })

  it('signal=true, zero factors firing — returns empty array, not null', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 25,
      marketRegime: 'TRENDING',
      distanceToEma50Pct: -2,
    })

    expect(result).toEqual([])
    expect(result).not.toBeNull()
  })

  it('signal=true, only LOW_ADX fires', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 15.2,
      marketRegime: 'HIGH_VOLATILITY',
      distanceToEma50Pct: -3,
    })

    expect(result).toEqual(['LOW_ADX'])
  })

  it('signal=true, only RANGING fires', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 25,
      marketRegime: 'RANGING',
      distanceToEma50Pct: -1,
    })

    expect(result).toEqual(['RANGING'])
  })

  it('signal=true, only DEEP_EXTENSION fires', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 25,
      marketRegime: 'TRANSITION',
      distanceToEma50Pct: -18.5,
    })

    expect(result).toEqual(['DEEP_EXTENSION'])
  })

  it('LOW_ADX gate is strict < 18 — adx exactly 18.0 does not fire', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 18.0,
      marketRegime: 'TRENDING',
      distanceToEma50Pct: 0,
    })

    expect(result).toEqual([])
  })

  it('DEEP_EXTENSION gate is strict < -15 — exactly -15 does not fire', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 25,
      marketRegime: 'TRENDING',
      distanceToEma50Pct: -15,
    })

    expect(result).toEqual([])
  })

  it('adx=null (missing data) does not throw and does not produce LOW_ADX', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: null,
      marketRegime: 'RANGING',
      distanceToEma50Pct: null,
    })

    expect(result).toEqual(['RANGING'])
  })

  it('adx=NaN (corrupt data) does not throw and does not produce LOW_ADX', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: NaN,
      marketRegime: null,
      distanceToEma50Pct: null,
    })

    expect(result).toEqual([])
  })

  it('distanceToEma50Pct=null does not throw and does not produce DEEP_EXTENSION', () => {
    const result = computeMrRiskFactors({
      meanReversionSignal: true,
      adx: 25,
      marketRegime: 'TRENDING',
      distanceToEma50Pct: null,
    })

    expect(result).toEqual([])
  })
})
