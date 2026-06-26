import { describe, it, expect } from 'vitest'
import {
  toEtDate,
  smaAtIndex,
  findPriorBarIndex,
  classifyRegime,
  type SpyBar,
} from '../../../scripts/lib/spx-snapshot-helpers'

describe('toEtDate', () => {
  it('converts a UTC ISO timestamp to an America/New_York calendar date', () => {
    // Arrange
    const isoTimestamp = '2026-06-15T13:54:58.238Z' // 9:54am ET

    // Act
    const etDate = toEtDate(isoTimestamp)

    // Assert
    expect(etDate).toBe('2026-06-15')
  })

  it('rolls back to the prior ET date for a UTC timestamp just after midnight', () => {
    // Arrange
    const isoTimestamp = '2026-06-16T02:00:00.000Z' // 10pm ET on 6/15

    // Act
    const etDate = toEtDate(isoTimestamp)

    // Assert
    expect(etDate).toBe('2026-06-15')
  })
})

describe('smaAtIndex', () => {
  const closes = Array.from({ length: 10 }, (_, i) => i + 1) // [1..10]

  it('returns null when there are fewer than `period` closes available up to index', () => {
    // Arrange / Act
    const result = smaAtIndex(closes, 2, 5)

    // Assert
    expect(result).toBeNull()
  })

  it('computes the average of the last `period` closes ending at index', () => {
    // Arrange / Act
    const result = smaAtIndex(closes, 4, 5) // closes[0..4] = 1,2,3,4,5

    // Assert
    expect(result).toBe(3)
  })

  it('returns a value exactly at the minimum sufficient index (index === period - 1)', () => {
    // Arrange / Act
    const result = smaAtIndex(closes, 4, 5)

    // Assert
    expect(result).not.toBeNull()
  })
})

describe('findPriorBarIndex', () => {
  const bars: SpyBar[] = [
    { date: '2026-06-10', close: 100 },
    { date: '2026-06-11', close: 101 },
    { date: '2026-06-12', close: 102 },
    { date: '2026-06-15', close: 103 },
  ]

  it('returns the index of the last bar strictly before the given ET date', () => {
    // Arrange / Act
    const index = findPriorBarIndex(bars, '2026-06-15')

    // Assert — must be 2026-06-12 (strictly before 6/15), not 6/15 itself
    expect(index).toBe(2)
  })

  it('returns -1 when no bar exists before the given ET date', () => {
    // Arrange / Act
    const index = findPriorBarIndex(bars, '2026-06-10')

    // Assert
    expect(index).toBe(-1)
  })

  it('returns the last bar index when the given date is after all bars', () => {
    // Arrange / Act
    const index = findPriorBarIndex(bars, '2026-07-01')

    // Assert
    expect(index).toBe(3)
  })
})

describe('classifyRegime', () => {
  it('classifies BULL when spyClose is above sma200', () => {
    // Arrange / Act
    const regime = classifyRegime(700, 650, 600)

    // Assert
    expect(regime).toBe('BULL')
  })

  it('classifies CAUTION when spyClose is above sma50 but at or below sma200', () => {
    // Arrange / Act
    const regime = classifyRegime(620, 600, 650)

    // Assert
    expect(regime).toBe('CAUTION')
  })

  it('classifies BEAR when spyClose is at or below both sma50 and sma200', () => {
    // Arrange / Act
    const regime = classifyRegime(580, 600, 650)

    // Assert
    expect(regime).toBe('BEAR')
  })

  it('classifies CAUTION at the sma200 boundary (spyClose === sma200)', () => {
    // Arrange / Act
    const regime = classifyRegime(650, 600, 650)

    // Assert
    expect(regime).toBe('CAUTION')
  })

  it('classifies BEAR at the sma50 boundary (spyClose === sma50)', () => {
    // Arrange / Act
    const regime = classifyRegime(600, 600, 650)

    // Assert
    expect(regime).toBe('BEAR')
  })
})
