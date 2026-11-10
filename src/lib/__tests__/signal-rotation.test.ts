import { describe, it, expect } from 'vitest'
import { ZSCORE_ENTRY_THRESHOLD } from '../config'
import type { AlpacaPosition, TechnicalIndicators } from '../types'
import { evaluateRotation, generateSignalType, type SignalResult } from '../signal-rotation'

const NO_ROTATION_CANDIDATES = 'No rotation candidates — all positions still in progress'

function kalman(zScore: number): TechnicalIndicators['kalman'] {
  return { stateEstimate: 100, forecastError: 0, errorStdDev: 1, zScore, signal: 'NEUTRAL' }
}

function indicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    rsi: 50,
    macd: { macdLine: 0, signalLine: 0, histogram: 0 },
    bollingerBands: { upper: 110, middle: 100, lower: 90, percentB: 0.5 },
    sma50: 100, sma200: 100, ema50: 105, ema200: 110, distanceToEma50Pct: 0,
    kalman: kalman(0),
    currentPrice: 100, volume: 1, prevDayVolume: 1,
    adx: 25, atr: 2, atrPercentile: 0.5,
    marketRegime: 'RANGING',
    ...overrides,
  } as TechnicalIndicators
}

function meanReversion(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return indicators({
    marketRegime: 'RANGING',
    rsi: 30,
    bollingerBands: { upper: 60, middle: 52, lower: 44, percentB: 0.1 },
    kalman: kalman(-1.8),
    ...overrides,
  })
}

function trendFollowing(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return indicators({
    marketRegime: 'TRENDING',
    adx: 30,
    macd: { macdLine: 1, signalLine: 0, histogram: 0.5 },
    sma50: 90,
    currentPrice: 100,
    rsi: 60,
    ...overrides,
  })
}

function bands(percentB: number): TechnicalIndicators['bollingerBands'] {
  return { upper: 1, middle: 1, lower: 1, percentB }
}

function macd(macdLine: number, signalLine: number, histogram: number): TechnicalIndicators['macd'] {
  return { macdLine, signalLine, histogram }
}

describe('generateSignalType — MEAN_REVERSION', () => {
  it('uses the real entry threshold -1.3 for these cases', () => {
    // Arrange / Act / Assert
    expect(ZSCORE_ENTRY_THRESHOLD).toBe(-1.3)
  })

  it('fires just below the threshold with confidence |z|/3', () => {
    // Arrange
    const input = meanReversion({ kalman: kalman(ZSCORE_ENTRY_THRESHOLD - 0.0001) })

    // Act
    const result = generateSignalType(input)

    // Assert
    expect(result).toEqual({ type: 'MEAN_REVERSION', confidence: 0.4333666666666667 })
  })

  it('does not fire exactly at the threshold', () => {
    // Arrange / Act
    const result = generateSignalType(meanReversion({ kalman: kalman(ZSCORE_ENTRY_THRESHOLD) }))

    // Assert
    expect(result).toEqual({ type: 'NO_SIGNAL', confidence: 0 })
  })

  it.each<[number, number]>([
    [-1.8, 0.6],
    [-3, 1],
    [-6, 1],
  ])('gives confidence min(|z|/3, 1): z=%s -> %s', (z, confidence) => {
    // Arrange / Act
    const result = generateSignalType(meanReversion({ kalman: kalman(z) }))

    // Assert
    expect(result).toEqual({ type: 'MEAN_REVERSION', confidence })
  })

  it.each<[string, Partial<TechnicalIndicators>, string]>([
    ['RSI 44', { rsi: 44 }, 'MEAN_REVERSION'],
    ['RSI 45', { rsi: 45 }, 'NO_SIGNAL'],
    ['RSI null', { rsi: null }, 'NO_SIGNAL'],
    ['%B 0.19', { bollingerBands: bands(0.19) }, 'MEAN_REVERSION'],
    ['%B 0.2', { bollingerBands: bands(0.2) }, 'NO_SIGNAL'],
    ['no Bollinger bands', { bollingerBands: null }, 'NO_SIGNAL'],
    ['TRENDING regime', { marketRegime: 'TRENDING' }, 'NO_SIGNAL'],
    ['null kalman', { kalman: null }, 'NO_SIGNAL'],
  ])('%s -> %s', (_label, overrides, expectedType) => {
    // Arrange / Act
    const result = generateSignalType(meanReversion(overrides))

    // Assert
    expect(result.type).toBe(expectedType)
  })
})

describe('generateSignalType — TREND_FOLLOWING', () => {
  it.each<[string, Partial<TechnicalIndicators>, string]>([
    ['ADX 25', { adx: 25 }, 'NO_SIGNAL'],
    ['ADX 25.01', { adx: 25.01 }, 'TREND_FOLLOWING'],
    ['ADX null', { adx: null }, 'NO_SIGNAL'],
    ['histogram 0', { macd: macd(1, 0, 0) }, 'NO_SIGNAL'],
    ['histogram 0.0001', { macd: macd(1, 0, 0.0001) }, 'TREND_FOLLOWING'],
    ['macdLine equal to signalLine', { macd: macd(0, 0, 0.5) }, 'NO_SIGNAL'],
    ['macdLine below signalLine', { macd: macd(-1, 0, 0.5) }, 'NO_SIGNAL'],
    ['null macd', { macd: null }, 'NO_SIGNAL'],
    ['sma50 null', { sma50: null }, 'TREND_FOLLOWING'],
    ['price equal to sma50', { sma50: 100 }, 'NO_SIGNAL'],
    ['price below sma50', { sma50: 101 }, 'NO_SIGNAL'],
    ['price above sma50', { sma50: 99 }, 'TREND_FOLLOWING'],
    ['RSI 50', { rsi: 50 }, 'NO_SIGNAL'],
    ['RSI 50.01', { rsi: 50.01 }, 'TREND_FOLLOWING'],
    ['RSI 74.99', { rsi: 74.99 }, 'TREND_FOLLOWING'],
    ['RSI 75', { rsi: 75 }, 'NO_SIGNAL'],
    ['RSI null', { rsi: null }, 'NO_SIGNAL'],
    ['RANGING regime', { marketRegime: 'RANGING' }, 'NO_SIGNAL'],
  ])('%s -> %s', (_label, overrides, expectedType) => {
    // Arrange / Act
    const result = generateSignalType(trendFollowing(overrides))

    // Assert
    expect(result.type).toBe(expectedType)
  })

  it.each<[number, number]>([
    [25.01, 0.5002],
    [30, 0.6],
    [50, 1],
    [80, 1],
  ])('gives confidence min(adx/50, 1): adx=%s -> %s', (adx, confidence) => {
    // Arrange / Act
    const result = generateSignalType(trendFollowing({ adx }))

    // Assert
    expect(result).toEqual({ type: 'TREND_FOLLOWING', confidence })
  })
})

describe('generateSignalType — NO_SIGNAL', () => {
  it('returns NO_SIGNAL with confidence 0 for neutral indicators', () => {
    // Arrange / Act
    const result = generateSignalType(indicators())

    // Assert
    expect(result).toEqual({ type: 'NO_SIGNAL', confidence: 0 })
  })
})

function position(symbol: string, unrealizedPlpc: string): AlpacaPosition {
  return { symbol, unrealized_plpc: unrealizedPlpc } as AlpacaPosition
}

function cacheOf(zBySymbol: Record<string, number | null>): Map<string, TechnicalIndicators> {
  return new Map(
    Object.entries(zBySymbol).map(([symbol, z]) => [symbol, indicators({ kalman: z === null ? null : kalman(z) })]),
  )
}

function signal(confidence: number): SignalResult {
  return { type: 'MEAN_REVERSION', confidence }
}

describe('evaluateRotation', () => {
  it.each<[number, boolean]>([
    [0.69, false],
    [0.7, true],
    [0, false],
  ])('confidence %s -> rotate=%s', async (confidence, rotate) => {
    // Arrange
    const positions = [position('A', '0')]

    // Act
    const result = await evaluateRotation(signal(confidence), positions, cacheOf({ A: -0.1 }))

    // Assert
    expect(result.rotate).toBe(rotate)
    if (!rotate) expect(result.reason).toBe('Signal too weak for rotation')
  })

  it('selects priority 1 at z = -0.8 with the exact reason text', async () => {
    // Arrange / Act
    const result = await evaluateRotation(signal(0.8), [position('A', '0')], cacheOf({ A: -0.8 }))

    // Assert
    expect(result).toEqual({ rotate: true, exitSymbol: 'A', reason: 'z-score -0.800 reverted to fair value' })
  })

  it('does not select priority 1 at z = -0.81', async () => {
    // Arrange / Act
    const result = await evaluateRotation(signal(0.8), [position('A', '0')], cacheOf({ A: -0.81 }))

    // Assert
    expect(result).toEqual({ rotate: false, reason: NO_ROTATION_CANDIDATES })
  })

  it('formats the z-score with three decimals in the priority-1 reason', async () => {
    // Arrange / Act
    const result = await evaluateRotation(signal(0.8), [position('A', '0')], cacheOf({ A: -0.12349 }))

    // Assert
    expect(result.reason).toBe('z-score -0.123 reverted to fair value')
  })

  it.each<[string, number, string, boolean]>([
    ['P&L 0.05, confidence 0.80', 0.8, '0.05', false],
    ['P&L 0.0501, confidence 0.80', 0.8, '0.0501', false],
    ['P&L 0.05, confidence 0.81', 0.81, '0.05', false],
    ['P&L 0.0501, confidence 0.81', 0.81, '0.0501', true],
  ])('priority 2: %s -> rotate=%s', async (_label, confidence, plpc, rotate) => {
    // Arrange / Act
    const result = await evaluateRotation(signal(confidence), [position('A', plpc)], cacheOf({ A: -1 }))

    // Assert
    expect(result.rotate).toBe(rotate)
  })

  it('formats the priority-2 reason with P&L and confidence', async () => {
    // Arrange / Act
    const result = await evaluateRotation(signal(0.9), [position('A', '0.123')], cacheOf({ A: -1 }))

    // Assert
    expect(result).toEqual({
      rotate: true,
      exitSymbol: 'A',
      reason: 'Rotating to better setup (P&L +12.3%, new confidence 0.90)',
    })
  })

  it('returns the no-candidates result when every position is still in progress', async () => {
    // Arrange
    const positions = [position('A', '0.01'), position('B', '0.01')]

    // Act
    const result = await evaluateRotation(signal(0.8), positions, cacheOf({ A: -1, B: -1 }))

    // Assert
    expect(result).toEqual({ rotate: false, reason: NO_ROTATION_CANDIDATES })
  })

  it('skips a position whose indicators have no kalman or are missing from the cache', async () => {
    // Arrange / Act
    const noKalman = await evaluateRotation(signal(0.8), [position('A', '0')], cacheOf({ A: null }))
    const missing = await evaluateRotation(signal(0.8), [position('Z', '0')], new Map())

    // Assert
    expect(noKalman).toEqual({ rotate: false, reason: NO_ROTATION_CANDIDATES })
    expect(missing).toEqual({ rotate: false, reason: NO_ROTATION_CANDIDATES })
  })

  it('picks the first priority-1 candidate in array order, not the highest z-score', async () => {
    // Arrange
    const cache = cacheOf({ A: -0.1, B: -0.7 })

    // Act
    const aFirst = await evaluateRotation(signal(0.8), [position('A', '0'), position('B', '0')], cache)
    const bFirst = await evaluateRotation(signal(0.8), [position('B', '0'), position('A', '0')], cache)

    // Assert
    expect(aFirst.exitSymbol).toBe('A')
    expect(bFirst.exitSymbol).toBe('B')
  })

  it('prefers a priority-1 candidate over a priority-2 candidate', async () => {
    // Arrange
    const positions = [position('A', '0.2'), position('B', '0')]

    // Act
    const result = await evaluateRotation(signal(0.9), positions, cacheOf({ A: -1, B: -0.5 }))

    // Assert
    expect(result).toEqual({ rotate: true, exitSymbol: 'B', reason: 'z-score -0.500 reverted to fair value' })
  })

  it('returns the no-candidates result for an empty position list', async () => {
    // Arrange / Act
    const result = await evaluateRotation(signal(0.8), [], new Map())

    // Assert
    expect(result).toEqual({ rotate: false, reason: NO_ROTATION_CANDIDATES })
  })
})
