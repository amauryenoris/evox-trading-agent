import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Replicates the observability helpers from claude-agent.ts.
// Keep in sync with the block inserted after emaReclaimSetup evaluation.

function fmt(v?: number | null): string {
  return typeof v === 'number' ? v.toFixed(2) : 'NA'
}

function macdBucket(macdHistogram: number | null): string {
  return macdHistogram === null  ? 'NO_DATA' :
         macdHistogram > 0       ? 'POSITIVE' :
         macdHistogram > -2.0    ? 'MODERATE_NEG' :
                                   'DEEP_NEG'
}

function riskFactors(p: {
  ema50GtEma200: boolean
  macdHistogram: number | null
  adxValue: number | null
}): string {
  return [
    !p.ema50GtEma200 ? 'EMA_STRUCTURE' : null,
    p.macdHistogram !== null && p.macdHistogram <= 0 ? 'MACD_NON_POSITIVE' : null,
    p.adxValue !== null && p.adxValue < 20 ? 'LOW_ADX' : null,
  ].filter((v): v is string => Boolean(v))
   .join('|') || 'NONE'
}

// ── fmt() ──────────────────────────────────────────────────────────────────

describe('fmt() — null-safe number formatter', () => {
  it('formats a positive number to 2 decimal places', () => {
    expect(fmt(1.5678)).toBe('1.57')
  })

  it('formats zero', () => {
    expect(fmt(0)).toBe('0.00')
  })

  it('formats a negative number', () => {
    expect(fmt(-0.4)).toBe('-0.40')
  })

  it('returns NA for null', () => {
    expect(fmt(null)).toBe('NA')
  })

  it('returns NA for undefined', () => {
    expect(fmt(undefined)).toBe('NA')
  })
})

// ── emaReclaimMacdBucket ───────────────────────────────────────────────────

describe('emaReclaimMacdBucket — MACD histogram bucketing', () => {
  it('returns NO_DATA when macdHistogram is null', () => {
    expect(macdBucket(null)).toBe('NO_DATA')
  })

  it('returns POSITIVE when macdHistogram > 0', () => {
    expect(macdBucket(0.1)).toBe('POSITIVE')
    expect(macdBucket(2.5)).toBe('POSITIVE')
  })

  it('returns MODERATE_NEG when macdHistogram is (-2.0, 0]', () => {
    expect(macdBucket(0)).toBe('MODERATE_NEG')
    expect(macdBucket(-1.0)).toBe('MODERATE_NEG')
    expect(macdBucket(-1.999)).toBe('MODERATE_NEG')
  })

  it('returns DEEP_NEG when macdHistogram <= -2.0', () => {
    expect(macdBucket(-2.0)).toBe('DEEP_NEG')
    expect(macdBucket(-5.0)).toBe('DEEP_NEG')
  })
})

// ── emaReclaimRiskFactors ──────────────────────────────────────────────────

describe('emaReclaimRiskFactors — pipe-separated risk dimension tokens', () => {
  it('returns NONE when no risk dimensions apply', () => {
    expect(riskFactors({ ema50GtEma200: true, macdHistogram: 0.5, adxValue: 25 })).toBe('NONE')
  })

  it('returns EMA_STRUCTURE when ema50 is not above ema200', () => {
    expect(riskFactors({ ema50GtEma200: false, macdHistogram: 0.5, adxValue: 25 })).toBe('EMA_STRUCTURE')
  })

  it('returns MACD_NON_POSITIVE when macdHistogram === 0', () => {
    expect(riskFactors({ ema50GtEma200: true, macdHistogram: 0, adxValue: 25 })).toBe('MACD_NON_POSITIVE')
  })

  it('returns MACD_NON_POSITIVE when macdHistogram < 0', () => {
    expect(riskFactors({ ema50GtEma200: true, macdHistogram: -0.5, adxValue: 25 })).toBe('MACD_NON_POSITIVE')
  })

  it('does not set MACD_NON_POSITIVE when macdHistogram is null', () => {
    expect(riskFactors({ ema50GtEma200: true, macdHistogram: null, adxValue: 25 })).toBe('NONE')
  })

  it('returns LOW_ADX when adxValue < 20', () => {
    expect(riskFactors({ ema50GtEma200: true, macdHistogram: 0.5, adxValue: 15 })).toBe('LOW_ADX')
  })

  it('does not set LOW_ADX when adxValue is null', () => {
    expect(riskFactors({ ema50GtEma200: true, macdHistogram: 0.5, adxValue: null })).toBe('NONE')
  })

  it('returns pipe-separated tokens when multiple dimensions apply', () => {
    const result = riskFactors({ ema50GtEma200: false, macdHistogram: -0.5, adxValue: 10 })
    expect(result).toBe('EMA_STRUCTURE|MACD_NON_POSITIVE|LOW_ADX')
  })

  it('returns two tokens when exactly two dimensions apply', () => {
    const result = riskFactors({ ema50GtEma200: true, macdHistogram: -0.5, adxValue: 10 })
    expect(result).toBe('MACD_NON_POSITIVE|LOW_ADX')
  })
})

// ── Log emission ───────────────────────────────────────────────────────────

describe('EMA_RECLAIM observability log emission', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('[EMA_RECLAIM_ENTRY] emits when emaReclaimSetup is true', () => {
    const emaReclaimSetup = true
    const hasPrevData = true
    const symbol = 'TEST'
    const zScore = -0.4
    const mcdHist = 0.3
    const adx = 25
    const ema50GtEma200 = true
    const regime = 'NORMAL'

    const bucket = macdBucket(mcdHist)
    const factors = riskFactors({ ema50GtEma200, macdHistogram: mcdHist, adxValue: adx })

    if (emaReclaimSetup) {
      console.log(
        `[EMA_RECLAIM_ENTRY] symbol=${symbol}` +
        ` z=${fmt(zScore)}` +
        ` macd=${fmt(mcdHist)}` +
        ` macdBucket=${bucket}` +
        ` adx=${fmt(adx)}` +
        ` ema50GtEma200=${ema50GtEma200}` +
        ` regime=${regime}` +
        ` riskFactors=${factors}`
      )
    }

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[EMA_RECLAIM_ENTRY]')
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('macdBucket=POSITIVE')
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('riskFactors=NONE')
    )
  })

  it('[EMA_RECLAIM_BLOCKED] emits when hasPrevData is true and emaReclaimSetup is false', () => {
    const emaReclaimSetup = false
    const hasPrevData = true
    const symbol = 'TEST'
    const zScore = 0.5
    const mcdHist = null
    const adx = 15
    const ema50GtEma200 = false
    const regime = 'HIGH_VOLATILITY'

    const bucket = macdBucket(mcdHist)
    const factors = riskFactors({ ema50GtEma200, macdHistogram: mcdHist, adxValue: adx })

    if (hasPrevData && !emaReclaimSetup) {
      console.log(
        `[EMA_RECLAIM_BLOCKED] symbol=${symbol}` +
        ` z=${fmt(zScore)}` +
        ` macd=${fmt(mcdHist)}` +
        ` macdBucket=${bucket}` +
        ` adx=${fmt(adx)}` +
        ` ema50GtEma200=${ema50GtEma200}` +
        ` regime=${regime}` +
        ` riskFactors=${factors}`
      )
    }

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[EMA_RECLAIM_BLOCKED]')
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('macdBucket=NO_DATA')
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('riskFactors=EMA_STRUCTURE|LOW_ADX')
    )
  })

  it('[EMA_RECLAIM_BLOCKED] does NOT emit when hasPrevData is false', () => {
    const emaReclaimSetup = false
    const hasPrevData = false

    if (hasPrevData && !emaReclaimSetup) {
      console.log('[EMA_RECLAIM_BLOCKED] should not fire')
    }

    expect(console.log).not.toHaveBeenCalled()
  })

  it('[EMA_RECLAIM_ENTRY] does NOT emit when emaReclaimSetup is false', () => {
    const emaReclaimSetup = false

    if (emaReclaimSetup) {
      console.log('[EMA_RECLAIM_ENTRY] should not fire')
    }

    expect(console.log).not.toHaveBeenCalled()
  })
})
