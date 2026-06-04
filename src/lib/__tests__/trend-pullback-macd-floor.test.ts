import { describe, it, expect } from 'vitest'

// Replicates trendPullbackMomentumOk, trendSetup, wouldPassWithoutMacdFloor from claude-agent.ts.
// Keep in sync with the TREND_PULLBACK detection block when conditions change.

const MACD_FLOOR = -2.0

function evalTrendPullbackMomentumOk(macdHistogram: number | null): boolean {
  return macdHistogram !== null && macdHistogram > MACD_FLOOR
}

function evalTrendSetup(p: {
  ema50: number
  ema200: number
  currentPrice: number
  ema50Prev: number | null
  zScore: number
  adx: number | null
  macdHistogram: number | null
}): boolean {
  const adxValue = p.adx
  const adxOk = adxValue === null || adxValue >= 20
  const ema50SlopeOk = p.ema50Prev !== null && p.ema50 > p.ema50Prev
  const momentumOk = p.ema50Prev !== null ? p.ema50 > p.ema50Prev : false
  const trendQualityOk = ema50SlopeOk && adxOk
  const trendPullbackMomentumOk = evalTrendPullbackMomentumOk(p.macdHistogram)
  return (
    p.ema50 > 0 &&
    p.ema200 > 0 &&
    p.currentPrice > p.ema50 &&
    p.ema50 > p.ema200 &&
    p.zScore <= 0 &&
    momentumOk &&
    trendQualityOk &&
    trendPullbackMomentumOk
  )
}

function evalWouldPassWithoutMacdFloor(p: {
  ema50: number
  ema200: number
  currentPrice: number
  ema50Prev: number | null
  zScore: number
  adx: number | null
}): boolean {
  const adxValue = p.adx
  const adxOk = adxValue === null || adxValue >= 20
  const ema50SlopeOk = p.ema50Prev !== null && p.ema50 > p.ema50Prev
  const momentumOk = p.ema50Prev !== null ? p.ema50 > p.ema50Prev : false
  const trendQualityOk = ema50SlopeOk && adxOk
  return (
    p.ema50 > 0 &&
    p.ema200 > 0 &&
    p.currentPrice > p.ema50 &&
    p.ema50 > p.ema200 &&
    p.zScore <= 0 &&
    momentumOk &&
    trendQualityOk
  )
}

const UPTREND_BASE = {
  ema50: 150,
  ema200: 140,
  currentPrice: 155,
  ema50Prev: 149,
  zScore: -0.5,
  adx: 25,
}

describe('trendPullbackMomentumOk — MACD floor gate', () => {
  it('COP profile: MACD -1.69 — passes (> -2.0)', () => {
    // Arrange
    const macd = -1.69

    // Act
    const result = evalTrendPullbackMomentumOk(macd)

    // Assert
    expect(result).toBe(true)
  })

  it('NVDA profile: MACD -1.42 — passes', () => {
    // Arrange
    const macd = -1.42

    // Act
    const result = evalTrendPullbackMomentumOk(macd)

    // Assert
    expect(result).toBe(true)
  })

  it('UUUU profile: MACD -0.05 — passes', () => {
    // Arrange
    const macd = -0.05

    // Act
    const result = evalTrendPullbackMomentumOk(macd)

    // Assert
    expect(result).toBe(true)
  })

  it('GOOGL profile: MACD -5.84 — blocked (deteriorating momentum)', () => {
    // Arrange
    const macd = -5.84

    // Act
    const result = evalTrendPullbackMomentumOk(macd)

    // Assert
    expect(result).toBe(false)
  })

  it('MACD null — blocked (cannot confirm momentum)', () => {
    // Arrange / Act / Assert
    expect(evalTrendPullbackMomentumOk(null)).toBe(false)
  })

  it('MACD = -2.0 exactly — blocked (strict > required)', () => {
    // Arrange
    const macd = -2.0

    // Act
    const result = evalTrendPullbackMomentumOk(macd)

    // Assert
    expect(result).toBe(false)
  })

  it('MACD = -1.999 — passes (just above floor)', () => {
    expect(evalTrendPullbackMomentumOk(-1.999)).toBe(true)
  })

  it('positive MACD — passes', () => {
    expect(evalTrendPullbackMomentumOk(0.5)).toBe(true)
  })
})

describe('trendSetup — with MACD floor gate', () => {
  it('healthy pullback (MACD -1.69): trendSetup passes', () => {
    expect(evalTrendSetup({ ...UPTREND_BASE, macdHistogram: -1.69 })).toBe(true)
  })

  it('GOOGL profile (MACD -5.84): trendSetup blocked by MACD floor', () => {
    expect(evalTrendSetup({ ...UPTREND_BASE, macdHistogram: -5.84 })).toBe(false)
  })

  it('MACD null: trendSetup blocked', () => {
    expect(evalTrendSetup({ ...UPTREND_BASE, macdHistogram: null })).toBe(false)
  })

  it('MACD -2.0 exactly: trendSetup blocked (strict >)', () => {
    expect(evalTrendSetup({ ...UPTREND_BASE, macdHistogram: -2.0 })).toBe(false)
  })

  it('downtrend (ema50 < ema200): trendSetup blocked regardless of MACD', () => {
    expect(evalTrendSetup({ ...UPTREND_BASE, ema50: 135, ema50Prev: 134, macdHistogram: -1.0 })).toBe(false)
  })

  it('z-score > 0: trendSetup blocked (price above fair value)', () => {
    expect(evalTrendSetup({ ...UPTREND_BASE, zScore: 0.1, macdHistogram: -1.0 })).toBe(false)
  })
})

describe('wouldPassWithoutMacdFloor — T-14 verify shadow variable', () => {
  it('GOOGL profile: wouldPassWithoutMacdFloor = true (all conditions except MACD pass)', () => {
    // Arrange — same uptrend structure as GOOGL, MACD not considered here
    const params = { ...UPTREND_BASE }

    // Act
    const result = evalWouldPassWithoutMacdFloor(params)

    // Assert
    expect(result).toBe(true)
  })

  it('downtrend: wouldPassWithoutMacdFloor = false (structure fails)', () => {
    expect(evalWouldPassWithoutMacdFloor({ ...UPTREND_BASE, ema50: 135, ema50Prev: 134 })).toBe(false)
  })

  it('flat EMA50 slope: wouldPassWithoutMacdFloor = false', () => {
    expect(evalWouldPassWithoutMacdFloor({ ...UPTREND_BASE, ema50Prev: 150 })).toBe(false)
  })
})

describe('BLOCKED_MACD condition — T-15 sole-blocker gate', () => {
  function isMacdSoleBlocker(p: typeof UPTREND_BASE & { macdHistogram: number | null }): boolean {
    const trendSetup = evalTrendSetup(p)
    const wouldPassWithoutMacdFloor = evalWouldPassWithoutMacdFloor(p)
    const trendPullbackMomentumOk = evalTrendPullbackMomentumOk(p.macdHistogram)
    return !trendSetup && wouldPassWithoutMacdFloor && !trendPullbackMomentumOk
  }

  it('GOOGL profile: MACD is sole blocker → BLOCKED_MACD fires', () => {
    expect(isMacdSoleBlocker({ ...UPTREND_BASE, macdHistogram: -5.84 })).toBe(true)
  })

  it('MACD = -2.0 exactly: sole blocker → BLOCKED_MACD fires', () => {
    expect(isMacdSoleBlocker({ ...UPTREND_BASE, macdHistogram: -2.0 })).toBe(true)
  })

  it('good MACD (-1.0): BLOCKED_MACD does NOT fire (trendSetup passes)', () => {
    expect(isMacdSoleBlocker({ ...UPTREND_BASE, macdHistogram: -1.0 })).toBe(false)
  })

  it('downtrend + bad MACD: BLOCKED_MACD does NOT fire (structure is also a blocker)', () => {
    expect(isMacdSoleBlocker({ ...UPTREND_BASE, ema50: 135, ema50Prev: 134, macdHistogram: -5.0 })).toBe(false)
  })

  it('z-score > 0 + bad MACD: BLOCKED_MACD does NOT fire (z-score is also a blocker)', () => {
    expect(isMacdSoleBlocker({ ...UPTREND_BASE, zScore: 0.5, macdHistogram: -5.0 })).toBe(false)
  })
})
