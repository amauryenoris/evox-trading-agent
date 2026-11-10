import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AlpacaBar } from '../types'
import { guardMacroBars } from '../macro-bars-staleness'

const NOW_ISO = '2026-11-04T15:30:00.000Z'
const MS_PER_DAY = 86_400_000

function bar(t: string): AlpacaBar {
  return { t } as unknown as AlpacaBar
}

describe('guardMacroBars', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW_ISO))
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    vi.useRealTimers()
  })

  it('returns an empty array and warns with lastBar=none ageDays=-1 for empty bars', () => {
    // Arrange
    const bars: AlpacaBar[] = []

    // Act
    const result = guardMacroBars('SPY', bars)

    // Assert
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[STALE_MACRO_BARS] symbol=SPY lastBar=none ageDays=-1')
  })

  it('returns the same array reference and does not warn for fresh bars', () => {
    // Arrange
    const bars = [bar('2026-11-03T05:00:00Z')]

    // Act
    const result = guardMacroBars('GDX', bars)

    // Assert
    expect(result).toBe(bars)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('returns an empty array and warns with the last bar date and age for stale bars with data', () => {
    // Arrange
    const bars = [bar('2026-10-20T04:00:00Z'), bar('2026-10-26T04:00:00Z')]

    // Act
    const result = guardMacroBars('XLE', bars)

    // Assert
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[STALE_MACRO_BARS] symbol=XLE lastBar=2026-10-26 ageDays=9')
  })

  it('keeps bars that are exactly 5 days old', () => {
    // Arrange
    const bars = [bar(new Date(new Date(NOW_ISO).getTime() - 5 * MS_PER_DAY).toISOString())]

    // Act
    const result = guardMacroBars('XLK', bars)

    // Assert
    expect(result).toBe(bars)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('drops bars one second beyond 5 days and reports ageDays=5', () => {
    // Arrange
    const bars = [bar(new Date(new Date(NOW_ISO).getTime() - (5 * MS_PER_DAY + 1000)).toISOString())]

    // Act
    const result = guardMacroBars('VIXY', bars)

    // Assert
    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith('[STALE_MACRO_BARS] symbol=VIXY lastBar=2026-10-30 ageDays=5')
  })
})
