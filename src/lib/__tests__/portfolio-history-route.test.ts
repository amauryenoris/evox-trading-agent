import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockRange, mockFrom, mockSelect, mockNot, mockGte, mockOrder } = vi.hoisted(() => ({
  mockRange: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockNot: vi.fn(),
  mockGte: vi.fn(),
  mockOrder: vi.fn(),
}))

const sharedBuilder = {
  select: mockSelect,
  not: mockNot,
  gte: mockGte,
  order: mockOrder,
  range: mockRange,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, _init?: unknown) => data,
  },
}))

import { GET } from '../../app/api/portfolio-history/route'

function makeRow(date: string, equity: string) {
  return { created_at: `${date}T14:00:00.000Z`, portfolio_snapshot: { equity } }
}

describe('GET /api/portfolio-history — pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    mockSelect.mockReturnValue(sharedBuilder)
    mockNot.mockReturnValue(sharedBuilder)
    mockGte.mockReturnValue(sharedBuilder)
    mockOrder.mockReturnValue(sharedBuilder)
  })

  it('fetches all rows across multiple pages and combines them into history', async () => {
    // Arrange — page 0: full 1000 rows on Apr 20; page 1: 50 rows on May 20
    const page0 = Array.from({ length: 1000 }, () => makeRow('2026-04-20', '104000'))
    const page1 = Array.from({ length: 50 }, () => makeRow('2026-05-20', '105000'))
    mockRange
      .mockResolvedValueOnce({ data: page0, error: null })
      .mockResolvedValueOnce({ data: page1, error: null })

    // Act
    const result = await GET() as unknown as { history: Array<{ date: string; equity: number }> }

    // Assert — two pages were fetched with correct offsets
    expect(mockRange).toHaveBeenCalledTimes(2)
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999)
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999)
    // Both pages contributed to history
    expect(result.history).toHaveLength(2)
    expect(result.history[0].date).toBe('2026-04-20')
    expect(result.history[1].date).toBe('2026-05-20')
  })

  it('returns empty history when first page has no rows', async () => {
    // Arrange
    mockRange.mockResolvedValueOnce({ data: [], error: null })

    // Act
    const result = await GET() as unknown as { history: Array<{ date: string; equity: number }> }

    // Assert
    expect(mockRange).toHaveBeenCalledTimes(1)
    expect(result.history).toHaveLength(0)
  })
})
