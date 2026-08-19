import { describe, it, expect, vi } from 'vitest'
import type { NewsEvent } from '../types'

const { mockGetRecentNewsClassifications } = vi.hoisted(() => ({
  mockGetRecentNewsClassifications: vi.fn(),
}))

vi.mock('../db', () => ({
  saveNewsEvent: vi.fn(),
  getRecentNormalizedHeadlines: vi.fn(),
  getRecentNewsClassifications: mockGetRecentNewsClassifications,
}))

import { getAggregateMacroSentiment } from '../news-intelligence'

function makeClassification(overrides: Partial<NewsEvent>): NewsEvent {
  return {
    timestamp: '',
    symbol: null,
    scope: 'MACRO',
    sentiment: 'NEUTRAL',
    impact: 'LOW',
    threshold_adjustment: 0,
    headline: '',
    ...overrides,
  }
}

describe('getAggregateMacroSentiment', () => {
  it('counts BULLISH/BEARISH/NEUTRAL among MACRO-scope classifications and excludes SYMBOL-scope ones', async () => {
    // Arrange
    mockGetRecentNewsClassifications.mockResolvedValue([
      makeClassification({ scope: 'MACRO', sentiment: 'BULLISH' }),
      makeClassification({ scope: 'MACRO', sentiment: 'BULLISH' }),
      makeClassification({ scope: 'MACRO', sentiment: 'BEARISH' }),
      makeClassification({ scope: 'MACRO', sentiment: 'NEUTRAL' }),
      makeClassification({ scope: 'SYMBOL', symbol: 'AAPL', sentiment: 'BULLISH' }),
      makeClassification({ scope: 'SYMBOL', symbol: 'MSFT', sentiment: 'BEARISH' }),
    ])

    // Act
    const result = await getAggregateMacroSentiment(12)

    // Assert
    expect(result).toEqual({ bullishCount: 2, bearishCount: 1, neutralCount: 1 })
    expect(mockGetRecentNewsClassifications).toHaveBeenCalledWith(12)
  })

  it('returns all-zero counts when no classifications exist in the window', async () => {
    // Arrange
    mockGetRecentNewsClassifications.mockResolvedValue([])

    // Act
    const result = await getAggregateMacroSentiment(12)

    // Assert
    expect(result).toEqual({ bullishCount: 0, bearishCount: 0, neutralCount: 0 })
  })

  it('returns zero counts for sentiments that are absent when all MACRO news share one sentiment', async () => {
    // Arrange
    mockGetRecentNewsClassifications.mockResolvedValue([
      makeClassification({ scope: 'MACRO', sentiment: 'BEARISH' }),
      makeClassification({ scope: 'MACRO', sentiment: 'BEARISH' }),
      makeClassification({ scope: 'MACRO', sentiment: 'BEARISH' }),
    ])

    // Act
    const result = await getAggregateMacroSentiment(12)

    // Assert
    expect(result).toEqual({ bullishCount: 0, bearishCount: 3, neutralCount: 0 })
  })
})
