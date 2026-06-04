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
  const lowAdxMacdBoost = 0.25
  const adxValue = p.adx
  const macdHistogram = p.macdHistogram
  const ema50SlopeOk = p.ema50Prev !== null && p.ema50 > p.ema50Prev
  const adxOkZLE05 =
    adxValue !== null &&
    (
      adxValue >= 18 ||
      (adxValue >= 15 && macdHistogram !== null && macdHistogram > lowAdxMacdBoost)
    )
  const trendQualityOk = ema50SlopeOk && adxOkZLE05
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
    macdHistogram !== null &&
    macdHistogram > 0
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

  it('accepts ADX=22 (>= 18 free pass, no MACD needed): z=0.8', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: 22 })).toBe(true)
  })

  it('accepts ADX=24 (>= 18 free pass): z=0.8', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: 24 })).toBe(true)
  })

  it('accepts ADX=25 (>= 18 free pass)', () => {
    expect(evalTrendZLE05Setup({ ...BASE, zScore: 0.8, adx: 25 })).toBe(true)
  })

  it('rejects ADX null', () => {
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

  describe('adaptive ADX gate', () => {
    it('FCX May 28 profile: ADX=15.7, MACD=0.29 — low-ADX boost passes', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 15.7, macdHistogram: 0.29 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(true)
    })

    it('FCX May 29 profile: ADX=16.4, MACD=0.45 — low-ADX boost passes', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 16.4, macdHistogram: 0.45 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(true)
    })

    it('FCX May 26 profile: ADX=15.8, MACD=0.13 — MACD not above boost threshold, blocked', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 15.8, macdHistogram: 0.13 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })

    it('MP May 28 profile: ADX=21.9, MACD=0.22 — free pass (>= 18), MACD value irrelevant', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 21.9, macdHistogram: 0.22 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(true)
    })

    it('OXY profile: ADX=12.0, MACD=0.01 — ADX below 15, blocked', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 12.0, macdHistogram: 0.01 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })

    it('GOLD profile: ADX=11.0, MACD=0.09 — ADX below 15, blocked', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 11.0, macdHistogram: 0.09 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })

    it('ADX=17, MACD=0.26 — boundary: MACD strictly above 0.25, passes', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 17, macdHistogram: 0.26 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(true)
    })

    it('ADX=17, MACD=0.25 — boundary: MACD not strictly above 0.25, blocked', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 17, macdHistogram: 0.25 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })

    it('ADX=18, MACD=0.0 — free pass at exactly 18, zero MACD still passes gate', () => {
      // Arrange: MACD=0.0 is not > 0, so must confirm overall MACD>0 check uses the same value
      // This case: adxOkZLE05 passes (>= 18), but macdHistogram > 0 fails → blocked
      const input = { ...BASE, zScore: 0.8, adx: 18, macdHistogram: 0.0 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })

    it('ADX=14.9, MACD=0.5 — ADX below 15, blocked even with strong MACD', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: 14.9, macdHistogram: 0.5 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })

    it('ADX=null — always blocked', () => {
      // Arrange
      const input = { ...BASE, zScore: 0.8, adx: null, macdHistogram: 0.5 }

      // Act
      const result = evalTrendZLE05Setup(input)

      // Assert
      expect(result).toBe(false)
    })
  })
})
