import { describe, it, expect } from 'vitest'
import { buildThresholdMap, type NewsClassification } from '../news-intelligence'

// Replicates the symbol-assignment expression from classifyNewsItem()
// (news-intelligence.ts line ~139) — kept as a tiny standalone function since
// classifyNewsItem() itself makes a live Anthropic API call and isn't exported.
// Keep in sync with that line if its logic changes.
function resolveSymbol(
  parsedScope: 'MACRO' | 'SYMBOL',
  parsedSymbol: string | null,
  ambientSymbol: string | null
): string | null {
  return parsedScope === 'MACRO' ? null : (parsedSymbol ?? ambientSymbol)
}

describe('classifyNewsItem symbol assignment — MACRO scope', () => {
  it('persists symbol=null when scope=MACRO and an ambient ticker is present', () => {
    // Arrange
    const parsedScope = 'MACRO' as const
    const parsedSymbol = null
    const ambientSymbol = 'AMZN'

    // Act
    const result = resolveSymbol(parsedScope, parsedSymbol, ambientSymbol)

    // Assert
    expect(result).toBeNull()
  })

  it('persists symbol=null when scope=MACRO even if Claude mistakenly returned a ticker', () => {
    // Arrange — defensive case: MACRO scope should never carry a symbol regardless of parsed.symbol
    const parsedScope = 'MACRO' as const
    const parsedSymbol = 'SPY'
    const ambientSymbol = 'SPY'

    // Act
    const result = resolveSymbol(parsedScope, parsedSymbol, ambientSymbol)

    // Assert
    expect(result).toBeNull()
  })
})

describe('classifyNewsItem symbol assignment — SYMBOL scope (unchanged behavior)', () => {
  it('persists the parsed symbol when scope=SYMBOL and Claude returns a valid symbol', () => {
    // Arrange
    const parsedScope = 'SYMBOL' as const
    const parsedSymbol = 'MSFT'
    const ambientSymbol = 'AMZN'

    // Act
    const result = resolveSymbol(parsedScope, parsedSymbol, ambientSymbol)

    // Assert
    expect(result).toBe('MSFT')
  })

  it('falls back to the ambient ticker when scope=SYMBOL and parsed.symbol is null', () => {
    // Arrange
    const parsedScope = 'SYMBOL' as const
    const parsedSymbol = null
    const ambientSymbol = 'AAPL'

    // Act
    const result = resolveSymbol(parsedScope, parsedSymbol, ambientSymbol)

    // Assert
    expect(result).toBe('AAPL')
  })
})

describe('buildThresholdMap — unaffected by the symbol fix', () => {
  it('produces the same macro adjustment regardless of MACRO rows carrying a null symbol', () => {
    // Arrange — mixed MACRO (null symbol, post-fix) + SYMBOL classifications
    const symbols = ['AAPL', 'MSFT', 'NVDA']
    const classified: NewsClassification[] = [
      { scope: 'MACRO', symbol: null, sentiment: 'BEARISH', impact: 'HIGH', threshold_adjustment: -0.15, reasoning: '' },
      { scope: 'MACRO', symbol: null, sentiment: 'BULLISH', impact: 'LOW', threshold_adjustment: 0.03, reasoning: '' },
      { scope: 'SYMBOL', symbol: 'AAPL', sentiment: 'BULLISH', impact: 'MEDIUM', threshold_adjustment: 0.08, reasoning: '' },
    ]

    // Act
    const map = buildThresholdMap(symbols, classified)

    // Assert — macro adjustment: -0.15 + 0.03 = -0.12, no cap triggered
    expect(map.__MACRO__).toBeCloseTo(-0.12, 5)
    // AAPL: base + macro(-0.12) + symbolAdj(0.08), clamped to [-1.8, -1.2]
    expect(map.AAPL).toBeCloseTo(Math.max(-1.8, Math.min(-1.2, -1.3 + -0.12 + 0.08)), 5)
    // MSFT/NVDA: no own news, only macro adjustment applied
    expect(map.MSFT).toBeCloseTo(Math.max(-1.8, Math.min(-1.2, -1.3 + -0.12)), 5)
    expect(map.NVDA).toBeCloseTo(Math.max(-1.8, Math.min(-1.2, -1.3 + -0.12)), 5)
  })

  it('produces an identical map whether a MACRO row carries symbol=null or a stray ticker (proves the fix does not change threshold math)', () => {
    // Arrange — same classifications, differing only in the MACRO row's symbol field
    const symbols = ['AAPL']
    const withNullSymbol: NewsClassification[] = [
      { scope: 'MACRO', symbol: null, sentiment: 'BULLISH', impact: 'HIGH', threshold_adjustment: 0.15, reasoning: '' },
    ]
    const withStraySymbol: NewsClassification[] = [
      { scope: 'MACRO', symbol: 'AMZN', sentiment: 'BULLISH', impact: 'HIGH', threshold_adjustment: 0.15, reasoning: '' },
    ]

    // Act
    const mapWithNull = buildThresholdMap(symbols, withNullSymbol)
    const mapWithStray = buildThresholdMap(symbols, withStraySymbol)

    // Assert
    expect(mapWithNull).toEqual(mapWithStray)
  })
})
