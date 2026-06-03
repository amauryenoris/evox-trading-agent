import { describe, it, expect } from 'vitest'

// Replicates trendZLE05Setup conditions from claude-agent.ts (uses trendQualityOkZLE05).
// Keep in sync with the detection block when conditions change.
function evalTrendZLE05Setup(p: {
  ema50: number
  ema200: number
  currentPrice: number
  ema50Prev: number | null
  zScore: number
  adx: number | null
  macdHistogram: number | null
}): boolean {
  const ema50SlopeOk = p.ema50Prev !== null && p.ema50 > p.ema50Prev
  const adxOk = p.adx !== null && p.adx >= 25
  const trendQualityOk = ema50SlopeOk && adxOk
  const momentumOk = p.ema50Prev !== null ? p.ema50 > p.ema50Prev : false
  return (
    p.ema50 > 0 &&
    p.ema200 > 0 &&
    p.currentPrice > p.ema50 &&
    p.ema50 > p.ema200 &&
    p.zScore > 0 &&
    p.zScore <= 1.25 &&
    momentumOk &&
    trendQualityOk &&
    p.macdHistogram !== null &&
    p.macdHistogram > 0
  )
}

const BASE = {
  ema50: 150,
  ema200: 140,
  currentPrice: 155,
  ema50Prev: 149,
  adx: 27,
  macdHistogram: 0.5,
}

describe('TREND_ZLE05 setup detection — widened z-score window', () => {
  it('accepts expanded bucket: z=0.8, ADX=27', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8 })).toBe(true)
  })

  it('accepts legacy bucket: z=0.3, ADX=27', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.3 })).toBe(true)
  })

  it('accepts upper boundary: z=1.25, ADX=27', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 1.25 })).toBe(true)
  })

  it('rejects z above upper bound: z=1.26', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 1.26 })).toBe(false)
  })

  it('rejects z at or below zero: z=0', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0 })).toBe(false)
  })

  it('rejects ADX below new floor: z=0.8, ADX=22', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: 22 })).toBe(false)
  })

  it('rejects ADX at exactly 24 (below floor): z=0.8, ADX=24', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: 24 })).toBe(false)
  })

  it('accepts ADX at exactly 25 (new floor)', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: 25 })).toBe(true)
  })

  it('rejects ADX null — null no longer passes through', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: null })).toBe(false)
  })

  it('rejects missing MACD histogram', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, macdHistogram: null })).toBe(false)
  })

  it('rejects negative MACD histogram', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, macdHistogram: -0.1 })).toBe(false)
  })

  it('rejects flat EMA50 slope (ema50 == ema50Prev)', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, ema50Prev: 150 })).toBe(false)
  })

  it('rejects downward EMA50 slope (ema50 < ema50Prev)', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, ema50Prev: 151 })).toBe(false)
  })

  it('rejects price below EMA50', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, currentPrice: 148 })).toBe(false)
  })

  it('rejects EMA50 below EMA200 (downtrend)', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, ema50: 135, ema50Prev: 134 })).toBe(false)
  })
})
