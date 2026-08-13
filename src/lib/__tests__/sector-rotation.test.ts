import { describe, it, expect } from 'vitest'
import { computeSectorRotation, formatSectorRotationContext } from '../sector-rotation'

function makeBars(count: number, startClose = 100, dailyChange = 0): { t: string; c: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(2025, 0, i + 1).toISOString(),
    c: startClose + i * dailyChange,
  }))
}

describe('computeSectorRotation — normal case', () => {
  it('computes positive relative strength when a sector outperforms SPY over 20 days', () => {
    // Arrange — SPY flat, GDX rising steadily over the lookback window
    const spyBars = makeBars(30, 100, 0)
    const gdxBars = makeBars(30, 100, 1)
    const xleBars = makeBars(30, 100, 0)
    const xlkBars = makeBars(30, 100, 0)

    // Act
    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    // Assert
    expect(result.gdx_relative_strength_pct).not.toBeNull()
    expect(result.gdx_relative_strength_pct!).toBeGreaterThan(0)
    expect(result.xle_relative_strength_pct).toBeCloseTo(0, 5)
    expect(result.xlk_relative_strength_pct).toBeCloseTo(0, 5)
  })

  it('computes negative relative strength when a sector underperforms SPY over 20 days', () => {
    // Arrange
    const spyBars = makeBars(30, 100, 1)
    const gdxBars = makeBars(30, 100, 0)
    const xleBars = makeBars(30, 100, 0)
    const xlkBars = makeBars(30, 100, 0)

    // Act
    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    // Assert
    expect(result.gdx_relative_strength_pct!).toBeLessThan(0)
  })
})

describe('computeSectorRotation — insufficient sector history', () => {
  it('returns null only for the sector with too few bars, leaving others populated', () => {
    // Arrange — GDX has fewer than 22 bars (20-day lookback + 2), others sufficient
    const spyBars = makeBars(30)
    const gdxBars = makeBars(10)
    const xleBars = makeBars(30)
    const xlkBars = makeBars(30)

    // Act
    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    // Assert
    expect(result.gdx_relative_strength_pct).toBeNull()
    expect(result.xle_relative_strength_pct).not.toBeNull()
    expect(result.xlk_relative_strength_pct).not.toBeNull()
  })
})

describe('computeSectorRotation — insufficient SPY history', () => {
  it('returns null for all three sectors when SPY 20-day return cannot be computed', () => {
    // Arrange
    const spyBars = makeBars(10)
    const gdxBars = makeBars(30)
    const xleBars = makeBars(30)
    const xlkBars = makeBars(30)

    // Act
    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    // Assert
    expect(result.gdx_relative_strength_pct).toBeNull()
    expect(result.xle_relative_strength_pct).toBeNull()
    expect(result.xlk_relative_strength_pct).toBeNull()
  })
})

describe('computeSectorRotation — zero-division guard', () => {
  it('returns null for a sector whose past close is zero', () => {
    // Arrange — refIndex = 28 (30 bars), pastClose index = 28 - 20 = 8; set bars[8].c = 0
    const spyBars = makeBars(30)
    const gdxBars = makeBars(30)
    gdxBars[8] = { ...gdxBars[8], c: 0 }
    const xleBars = makeBars(30)
    const xlkBars = makeBars(30)

    // Act
    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    // Assert
    expect(result.gdx_relative_strength_pct).toBeNull()
  })
})

describe('computeSectorRotation — exact boundary', () => {
  it('22 bars (documented minimum: lookback 20 + 2) computes successfully', () => {
    const spyBars = makeBars(22)
    const gdxBars = makeBars(22, 100, 1)
    const xleBars = makeBars(22)
    const xlkBars = makeBars(22)

    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    expect(result.gdx_relative_strength_pct).not.toBeNull()
  })

  it('21 bars (one short of minimum) returns null — guards the refIndex - LOOKBACK_DAYS off-by-one', () => {
    const spyBars = makeBars(21)
    const gdxBars = makeBars(21)
    const xleBars = makeBars(21)
    const xlkBars = makeBars(21)

    const result = computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)

    expect(result.gdx_relative_strength_pct).toBeNull()
  })
})

describe('formatSectorRotationContext', () => {
  it('renders a percentage line with sign for each sector when all data present', () => {
    const text = formatSectorRotationContext({
      gdx_relative_strength_pct: 2.5,
      xle_relative_strength_pct: -1.25,
      xlk_relative_strength_pct: 0,
    })

    expect(text).toContain('Gold/Mining (GDX): +2.50% vs SPY (20d)')
    expect(text).toContain('Energy (XLE): -1.25% vs SPY (20d)')
    expect(text).toContain('Technology (XLK): +0.00% vs SPY (20d)')
  })

  it('renders "no data" for sectors with a null value, independent of the others', () => {
    const text = formatSectorRotationContext({
      gdx_relative_strength_pct: 1.1,
      xle_relative_strength_pct: null,
      xlk_relative_strength_pct: null,
    })

    expect(text).toContain('Gold/Mining (GDX): +1.10% vs SPY (20d)')
    expect(text).toContain('Energy (XLE): no data')
    expect(text).toContain('Technology (XLK): no data')
  })

  it('renders "no data" for all three sectors when the whole snapshot is null', () => {
    const text = formatSectorRotationContext({
      gdx_relative_strength_pct: null,
      xle_relative_strength_pct: null,
      xlk_relative_strength_pct: null,
    })

    expect(text).toContain('Gold/Mining (GDX): no data')
    expect(text).toContain('Energy (XLE): no data')
    expect(text).toContain('Technology (XLK): no data')
  })
})
